import { ipcMain } from 'electron'
import { readFile, readdir } from 'fs/promises'
import { join } from 'path'
import type { Token, TokenGroup, TokenSet } from '../shared/api'

/**
 * Design-token detection (the differentiator's last piece). A repo can expose
 * tokens three ways; we probe them in priority order and the first that yields
 * tokens wins, so the right source is chosen per project automatically:
 *
 *   1. `.dsgn/tokens.json`  — an explicit, curated manifest (highest priority)
 *   2. `tailwind.config.*`  — the theme scale (static parse, no code execution)
 *   3. CSS custom properties — `--name: value` scanned from the repo's CSS
 *
 * The Tailwind config is parsed *statically* (babel, literal values only) — we
 * never execute the repo's config. @babel/parser is ESM-only → dynamic import().
 */

type BabelParser = typeof import('@babel/parser')
let babelPromise: Promise<BabelParser> | null = null
const loadBabel = (): Promise<BabelParser> => (babelPromise ??= import('@babel/parser'))

const TAILWIND_CONFIGS = [
  'tailwind.config.js',
  'tailwind.config.cjs',
  'tailwind.config.mjs',
  'tailwind.config.ts'
]
// Theme categories we surface (in this order).
const TW_CATEGORIES = ['colors', 'spacing', 'fontSize', 'borderRadius', 'fontWeight', 'boxShadow']

// ---------------------------------------------------------------------------
// 1. Manifest: .dsgn/tokens.json  → { groupName: { tokenName: "value" } }
// ---------------------------------------------------------------------------
async function fromManifest(root: string): Promise<TokenSet | null> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(join(root, '.dsgn', 'tokens.json'), 'utf8'))
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const groups: TokenGroup[] = []
  for (const [groupName, entries] of Object.entries(parsed as Record<string, unknown>)) {
    if (!entries || typeof entries !== 'object') continue
    const tokens: Token[] = []
    for (const [name, value] of Object.entries(entries as Record<string, unknown>)) {
      if (typeof value === 'string' || typeof value === 'number') {
        tokens.push({ name, value: String(value) })
      }
    }
    if (tokens.length) groups.push({ name: groupName, tokens })
  }
  return groups.length ? { source: 'manifest', origin: '.dsgn/tokens.json', groups } : null
}

// ---------------------------------------------------------------------------
// 2. Tailwind config (static parse)
// ---------------------------------------------------------------------------
interface Node {
  type: string
  [k: string]: unknown
}

/** Flatten an ObjectExpression of literal leaves to tokens (nested → "a-b"). */
function flattenObject(node: Node, prefix: string, out: Token[]): void {
  for (const prop of (node.properties as Node[] | undefined) ?? []) {
    if (prop.type !== 'ObjectProperty' && prop.type !== 'Property') continue
    const key = keyName(prop.key as Node)
    if (key == null) continue
    const name = prefix ? `${prefix}-${key}` : key
    const value = prop.value as Node
    if (value.type === 'StringLiteral' || value.type === 'NumericLiteral') {
      out.push({ name, value: String((value as unknown as { value: unknown }).value) })
    } else if (value.type === 'ObjectExpression') {
      flattenObject(value, name, out)
    }
  }
}

function keyName(key: Node): string | null {
  if (key.type === 'Identifier') return (key as { name?: string }).name ?? null
  if (key.type === 'StringLiteral' || key.type === 'NumericLiteral') {
    return String((key as unknown as { value: unknown }).value)
  }
  return null
}

/** Find every ObjectExpression assigned to `theme` (handles theme + theme.extend). */
function collectThemeObjects(ast: unknown, out: Node[]): void {
  if (!ast || typeof ast !== 'object') return
  const n = ast as Node
  if (
    (n.type === 'ObjectProperty' || n.type === 'Property') &&
    keyName(n.key as Node) === 'theme' &&
    (n.value as Node)?.type === 'ObjectExpression'
  ) {
    out.push(n.value as Node)
  }
  for (const key of Object.keys(n)) {
    if (key === 'loc') continue
    const v = (n as Record<string, unknown>)[key]
    if (Array.isArray(v)) v.forEach((c) => collectThemeObjects(c, out))
    else if (v && typeof v === 'object') collectThemeObjects(v, out)
  }
}

function categoryObject(themeObj: Node, category: string): Node | null {
  for (const prop of (themeObj.properties as Node[] | undefined) ?? []) {
    if (prop.type !== 'ObjectProperty' && prop.type !== 'Property') continue
    if (keyName(prop.key as Node) === category && (prop.value as Node)?.type === 'ObjectExpression') {
      return prop.value as Node
    }
    // theme.extend is itself an object — recurse into it.
    if (keyName(prop.key as Node) === 'extend' && (prop.value as Node)?.type === 'ObjectExpression') {
      const inner = categoryObject(prop.value as Node, category)
      if (inner) return inner
    }
  }
  return null
}

async function fromTailwind(root: string): Promise<TokenSet | null> {
  let code: string | null = null
  let origin = ''
  for (const name of TAILWIND_CONFIGS) {
    try {
      code = await readFile(join(root, name), 'utf8')
      origin = name
      break
    } catch {
      /* try next */
    }
  }
  if (code == null) return null
  try {
    const { parse } = await loadBabel()
    const ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
    const themes: Node[] = []
    collectThemeObjects(ast, themes)
    const groups: TokenGroup[] = []
    for (const category of TW_CATEGORIES) {
      const tokens: Token[] = []
      for (const theme of themes) {
        const obj = categoryObject(theme, category)
        if (obj) flattenObject(obj, '', tokens)
      }
      if (tokens.length) groups.push({ name: category, tokens: dedupe(tokens) })
    }
    return groups.length ? { source: 'tailwind', origin, groups } : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// 3. CSS custom properties
// ---------------------------------------------------------------------------
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', 'coverage'])
const CSS_VAR_RE = /(--[A-Za-z0-9-]+)\s*:\s*([^;}{]+)[;}]/g

async function findCssFiles(root: string, depth: number, acc: string[]): Promise<void> {
  if (depth > 4 || acc.length >= 40) return
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (acc.length >= 40) return
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue
      await findCssFiles(join(root, e.name), depth + 1, acc)
    } else if (/\.(css|scss)$/.test(e.name)) {
      acc.push(join(root, e.name))
    }
  }
}

/** Group a custom property by its first name segment, e.g. --color-bg → "color". */
function cssGroupOf(name: string): string {
  const seg = name.replace(/^--/, '').split('-')[0]
  return seg || 'tokens'
}

async function fromCss(root: string): Promise<TokenSet | null> {
  const files: string[] = []
  await findCssFiles(root, 0, files)
  const byGroup = new Map<string, Token[]>()
  const seen = new Set<string>()
  for (const f of files) {
    let css: string
    try {
      css = await readFile(f, 'utf8')
    } catch {
      continue
    }
    if (css.length > 500_000) continue
    for (const m of css.matchAll(CSS_VAR_RE)) {
      const name = m[1]
      const value = m[2].trim()
      if (!value || value.startsWith('var(') || seen.has(name)) continue
      seen.add(name)
      const g = cssGroupOf(name)
      if (!byGroup.has(g)) byGroup.set(g, [])
      byGroup.get(g)!.push({ name, value })
    }
  }
  const groups: TokenGroup[] = [...byGroup.entries()].map(([name, tokens]) => ({ name, tokens }))
  return groups.length ? { source: 'css', origin: `${files.length} CSS file(s)`, groups } : null
}

function dedupe(tokens: Token[]): Token[] {
  const seen = new Set<string>()
  return tokens.filter((t) => (seen.has(t.name) ? false : (seen.add(t.name), true)))
}

async function detectTokens(root: string): Promise<TokenSet> {
  return (
    (await fromManifest(root)) ??
    (await fromTailwind(root)) ??
    (await fromCss(root)) ?? { source: 'none', groups: [] }
  )
}

export function registerTokensIpc(): void {
  ipcMain.handle('tokens:detect', (_e, root: string) => detectTokens(root))
}
