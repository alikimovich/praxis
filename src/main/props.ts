import { ipcMain } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { dirname, isAbsolute, join, normalize, relative } from 'path'
import type {
  PropEdit,
  PropEditResult,
  PropField,
  PropInspection,
  PropKind,
  TokenEdit
} from '../shared/api'
import { applySvelteEdit, applySvelteTextEdit, inspectSvelteProps } from './props-svelte'

/**
 * Prop editing is framework-agnostic by dispatch: the source file's extension
 * picks an adapter. `.svelte` → props-svelte.ts; everything else (.tsx/.jsx/.ts/
 * .js) → the React/JSX engine below. Both speak the same `data-dsgn-source`
 * stamp, the same shared helpers (resolveSource, mergeFields, …), and return the
 * same PropInspection / PropEditResult shapes.
 */

/**
 * Prop/token editing for the v2 inspector. Given an element's `data-dsgn-source`
 * stamp ("relpath:line"), we parse the source file, find the JSX element on that
 * line, and read its current literal attributes — enriched, when we can resolve
 * a schema, by react-docgen. Edits are applied the "hybrid" way: simple literal
 * props are spliced straight into the source (instant hot-reload); anything
 * non-literal is handed back for the agent to do.
 *
 * @babel/parser is CJS-friendly (externalized). react-docgen v8 is ESM-only, so
 * it's loaded via dynamic import() like the Agent SDK.
 */

interface FoundElement {
  name: string
  /** The opening element AST node (with babel ranges). */
  opening: BabelNode
  /** The parsed file AST (reused to resolve imports without re-parsing). */
  ast: BabelNode
}

interface BabelNode {
  type: string
  start: number
  end: number
  loc?: { start: { line: number; column: number }; end: { line: number } }
  // JSX-ish fields we touch (loosely typed — we duck-type by `.type`).
  name?: BabelNode | { type: string; name?: string }
  attributes?: BabelNode[]
  value?: BabelNode | null
  expression?: BabelNode
  argument?: BabelNode
  openingElement?: BabelNode
  [k: string]: unknown
}

// Both @babel/parser@8 and react-docgen@8 are ESM-only; this CJS main bundle
// must reach them via dynamic import() (like the Agent SDK), not a static require.
type BabelParser = typeof import('@babel/parser')
let babelPromise: Promise<BabelParser> | null = null
const loadBabel = (): Promise<BabelParser> => (babelPromise ??= import('@babel/parser'))

type ReactDocgen = typeof import('react-docgen')
let docgenPromise: Promise<ReactDocgen> | null = null
const loadDocgen = (): Promise<ReactDocgen> => (docgenPromise ??= import('react-docgen'))

export interface ResolvedSource {
  file: string
  line: number
  column?: number
}

/** Resolve "relpath:line[:col]" against the project root, refusing escapes. */
export function resolveSource(root: string, source: string): ResolvedSource | null {
  // Non-greedy path so "a/b.tsx:7:41" parses as file="a/b.tsx", line=7, col=41
  // (a greedy `.*` would swallow the line into the path and treat col as line).
  const m = /^(.+?):(\d+)(?::(\d+))?$/.exec(source)
  if (!m) return null
  const rel = m[1]
  if (isAbsolute(rel)) return null
  const file = normalize(join(root, rel))
  // Don't read outside the project.
  const within = relative(root, file)
  if (within.startsWith('..') || isAbsolute(within)) return null
  return { file, line: Number(m[2]), ...(m[3] != null ? { column: Number(m[3]) } : {}) }
}

// A safe JSX attribute name: identifier-ish, plus hyphens for data-*/aria-*.
// Anything else (from a hostile prop schema or a spoofed edit) must never be
// spliced into source.
const ATTR_NAME_RE = /^[A-Za-z_][\w-]*$/
export const isValidAttrName = (name: string): boolean => ATTR_NAME_RE.test(name)

function jsxName(node: BabelNode | { type: string; name?: string } | undefined): string {
  if (!node) return ''
  const n = node as BabelNode
  if (n.type === 'JSXIdentifier') return (n as { name?: string }).name ?? ''
  // JSXMemberExpression e.g. <Foo.Bar> → "Foo.Bar"
  if (n.type === 'JSXMemberExpression') {
    return `${jsxName(n.object as BabelNode)}.${jsxName(n.property as BabelNode)}`
  }
  return ''
}

/** Recursively collect every node of a given `.type` in the tree. */
function collectNodes(node: unknown, type: string, out: BabelNode[]): void {
  if (!node || typeof node !== 'object') return
  const n = node as BabelNode
  if (n.type === type) out.push(n)
  for (const key of Object.keys(n)) {
    if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue
    const v = (n as Record<string, unknown>)[key]
    if (Array.isArray(v)) v.forEach((c) => collectNodes(c, type, out))
    else if (v && typeof v === 'object') collectNodes(v, type, out)
  }
}

async function parseFile(code: string): Promise<BabelNode> {
  const { parse } = await loadBabel()
  return parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
    errorRecovery: true
  }) as unknown as BabelNode
}

/**
 * The JSX opening element the stamp refers to. Multiple elements can share a
 * start line (e.g. `<li>Label <Badge/></li>`), so when the stamp carries a
 * column we match it; otherwise we take the innermost element starting on that
 * line (a DOM click resolves to the deepest stamped element), falling back to
 * the smallest element that encloses the line.
 */
async function findElementAtLine(
  code: string,
  line: number,
  column?: number
): Promise<FoundElement | null> {
  const ast = await parseFile(code)
  const openings: BabelNode[] = []
  collectNodes(ast, 'JSXOpeningElement', openings)
  const wrap = (o: BabelNode): FoundElement => ({
    name: jsxName(o.name as BabelNode),
    opening: o,
    ast
  })

  const sameLine = openings.filter((o) => o.loc?.start.line === line)
  if (sameLine.length) {
    if (column != null) {
      const exactCol = sameLine.find((o) => o.loc?.start.column === column)
      if (exactCol) return wrap(exactCol)
      // Nearest element starting at or before the column, else the earliest.
      const atOrBefore = sameLine
        .filter((o) => (o.loc?.start.column ?? 0) <= column)
        .sort((a, b) => (b.loc?.start.column ?? 0) - (a.loc?.start.column ?? 0))[0]
      return wrap(atOrBefore ?? sameLine.sort((a, b) => a.start - b.start)[0])
    }
    // No column: innermost element on the line (highest start offset).
    return wrap([...sameLine].sort((a, b) => b.start - a.start)[0])
  }

  const enclosing = openings
    .filter((o) => (o.loc?.start.line ?? 0) <= line && (o.loc?.end.line ?? 0) >= line)
    .sort((a, b) => b.start - a.start)[0]
  return enclosing ? wrap(enclosing) : null
}

export interface CurrentAttr {
  name: string
  kind: PropKind
  value?: string | number | boolean
  expression?: boolean
  start: number
  end: number
}

/** Read the current attributes off an opening element (literal values only). */
function readAttributes(opening: BabelNode): CurrentAttr[] {
  const attrs: CurrentAttr[] = []
  for (const attr of opening.attributes ?? []) {
    if (attr.type !== 'JSXAttribute') continue // skip spreads
    const nameNode = attr.name as { type: string; name?: string }
    const name = nameNode?.name
    if (!name || !isValidAttrName(name)) continue
    const v = attr.value as BabelNode | null
    if (v == null) {
      attrs.push({ name, kind: 'boolean', value: true, start: attr.start, end: attr.end })
    } else if (v.type === 'StringLiteral') {
      attrs.push({
        name,
        kind: 'string',
        value: (v as { value?: string }).value,
        start: attr.start,
        end: attr.end
      })
    } else if (v.type === 'JSXExpressionContainer') {
      const lit = literalFromExpression(v.expression as BabelNode)
      if (lit) attrs.push({ name, ...lit, start: attr.start, end: attr.end })
      else attrs.push({ name, kind: 'other', expression: true, start: attr.start, end: attr.end })
    } else {
      attrs.push({ name, kind: 'other', expression: true, start: attr.start, end: attr.end })
    }
  }
  return attrs
}

/** Peel TS-cast / `satisfies` wrappers off a literal value, so
 * `variant={'ok' as Variant}` or `size={4 satisfies number}` read as plain
 * literals. (@babel/parser doesn't emit ParenthesizedExpression by default, so
 * `count={(3)}` already arrives as a bare NumericLiteral — no unwrap needed.) */
function unwrapExpr(e: BabelNode | undefined): BabelNode | undefined {
  let cur = e
  while (cur && (cur.type === 'TSAsExpression' || cur.type === 'TSSatisfiesExpression')) {
    cur = cur.expression as BabelNode | undefined
  }
  return cur
}

function literalFromExpression(
  raw: BabelNode | undefined
): { kind: PropKind; value: string | number | boolean } | null {
  const expr = unwrapExpr(raw)
  if (!expr) return null
  const lit = expr as unknown as { value: string | number | boolean }
  if (expr.type === 'StringLiteral') return { kind: 'string', value: lit.value }
  if (expr.type === 'NumericLiteral') return { kind: 'number', value: lit.value }
  if (expr.type === 'BooleanLiteral') return { kind: 'boolean', value: lit.value }
  // A template literal with no ${} interpolations is just a string literal.
  if (expr.type === 'TemplateLiteral') {
    const quasis = (expr as { quasis?: Array<{ value?: { cooked?: string } }> }).quasis ?? []
    const exprs = (expr as { expressions?: unknown[] }).expressions ?? []
    if (exprs.length === 0 && quasis.length === 1) {
      return { kind: 'string', value: quasis[0]?.value?.cooked ?? '' }
    }
  }
  if (
    expr.type === 'UnaryExpression' &&
    (expr as { operator?: string }).operator === '-' &&
    (expr.argument as BabelNode)?.type === 'NumericLiteral'
  ) {
    return { kind: 'number', value: -Number((expr.argument as unknown as { value: number }).value) }
  }
  return null
}

/**
 * Run react-docgen and return the prop schema for the component named `name`.
 * We only accept an exact displayName match (or a sole anonymous default
 * export) — never a *different* component's schema. For the cross-file case,
 * `name` is the *exported* name resolved from the import, so a re-export barrel
 * that also defines an unrelated component can't be mis-attached.
 */
async function schemaFor(code: string, name: string): Promise<PropField[]> {
  try {
    const { parse, builtinResolvers } = await loadDocgen()
    // FindAll (not the default exported-definitions resolver, which throws when a
    // file declares more than one component) so a file that defines + uses a
    // component still resolves.
    const docs = parse(code, {
      filename: 'component.tsx',
      resolver: new builtinResolvers.FindAllDefinitionsResolver()
    }) as Array<{ displayName?: string; props?: Record<string, DocgenProp> }>
    const doc =
      docs.find((d) => d.displayName === name) ??
      (docs.length === 1 && !docs[0].displayName ? docs[0] : undefined)
    if (!doc?.props) return []
    return Object.entries(doc.props)
      .filter(([n]) => isValidAttrName(n))
      .map(([n, p]) => docgenPropToField(n, p))
  } catch {
    return []
  }
}

const MODULE_EXTS = ['.tsx', '.ts', '.jsx', '.js']

/** Is `file` inside the project root (refuse imports that escape it)? */
export function withinRoot(root: string, file: string): boolean {
  const rel = relative(root, file)
  return !rel.startsWith('..') && !isAbsolute(rel)
}

/** Resolve a relative import spec to an on-disk file (trying extensions + /index). */
async function resolveModulePath(
  root: string,
  fromDir: string,
  spec: string
): Promise<string | null> {
  const base = normalize(join(fromDir, spec))
  if (!withinRoot(root, base)) return null // never read outside the project
  const candidates = [
    base,
    ...MODULE_EXTS.map((e) => base + e),
    ...MODULE_EXTS.map((e) => join(base, 'index' + e))
  ]
  for (const c of candidates) {
    if (/\.[a-z]+$/.test(c)) {
      try {
        await readFile(c)
        return c
      } catch {
        /* try next */
      }
    }
  }
  return null
}

/**
 * Find where `component` (the local JSX name) is imported from, resolve the
 * file, and return the *exported* name to match in that file. For a named
 * import we use the original export name (so `{ Button as B }` matches `Button`,
 * and a barrel re-export can't mis-attach); for a default import we fall back to
 * the local name (best effort — default exports' displayName usually agrees).
 */
async function resolveComponentFile(
  root: string,
  usageFile: string,
  ast: BabelNode,
  component: string
): Promise<{ file: string; exportName: string } | null> {
  const imports: BabelNode[] = []
  collectNodes(ast, 'ImportDeclaration', imports)
  for (const imp of imports) {
    const src = (imp.source as { value?: string } | undefined)?.value
    if (typeof src !== 'string' || !src.startsWith('.')) continue // relative only
    for (const s of (imp.specifiers as BabelNode[] | undefined) ?? []) {
      const local = (s.local as { name?: string } | undefined)?.name
      if (local !== component) continue
      if (s.type !== 'ImportSpecifier' && s.type !== 'ImportDefaultSpecifier') continue
      const exportName =
        s.type === 'ImportSpecifier'
          ? ((s.imported as { name?: string } | undefined)?.name ?? component)
          : component
      const file = await resolveModulePath(root, dirname(usageFile), src)
      return file ? { file, exportName } : null
    }
  }
  return null
}

interface DocgenProp {
  required?: boolean
  description?: string
  tsType?: { name?: string; elements?: Array<{ name?: string; value?: string }> }
  type?: { name?: string; value?: unknown }
}

function docgenPropToField(name: string, p: DocgenProp): PropField {
  let kind: PropKind = 'other'
  let options: string[] | undefined
  const ts = p.tsType
  if (ts?.name === 'string') kind = 'string'
  else if (ts?.name === 'number') kind = 'number'
  else if (ts?.name === 'boolean') kind = 'boolean'
  else if (ts?.name === 'union' && Array.isArray(ts.elements)) {
    const lits = ts.elements.filter((e) => e.name === 'literal' && /^["']/.test(e.value ?? ''))
    if (lits.length && lits.length === ts.elements.length) {
      kind = 'enum'
      options = lits.map((e) => (e.value ?? '').replace(/^['"]|['"]$/g, ''))
    }
  } else if (p.type?.name === 'enum' && Array.isArray(p.type.value)) {
    const vals = (p.type.value as Array<{ value?: string }>)
      .map((v) => v.value ?? '')
      .filter((v) => /^['"]/.test(v))
    if (vals.length) {
      kind = 'enum'
      options = vals.map((v) => v.replace(/^['"]|['"]$/g, ''))
    }
  }
  return {
    name,
    kind,
    ...(options ? { options } : {}),
    ...(p.required ? { required: true } : {}),
    ...(p.description ? { description: p.description } : {}),
    fromSchema: true
  }
}

/**
 * Merge a component's prop schema with the values actually set on the element:
 * schema-defined props first (richer — types, enums, descriptions) with any
 * current value overlaid, then attributes present on the element but not in the
 * schema. Shared by the React and Svelte adapters.
 */
export function mergeFields(schema: PropField[], current: CurrentAttr[]): PropField[] {
  const currentByName = new Map(current.map((c) => [c.name, c]))
  const fields: PropField[] = []
  const seen = new Set<string>()
  for (const f of schema) {
    seen.add(f.name)
    const cur = currentByName.get(f.name)
    fields.push({
      ...f,
      ...(cur && !cur.expression ? { value: cur.value, fromSchema: false } : {}),
      ...(cur?.expression ? { expression: true } : {})
    })
  }
  for (const c of current) {
    if (seen.has(c.name)) continue
    fields.push({
      name: c.name,
      kind: c.kind,
      ...(c.value !== undefined ? { value: c.value } : {}),
      ...(c.expression ? { expression: true } : {})
    })
  }
  return fields
}

async function inspectProps(root: string, source: string): Promise<PropInspection | null> {
  const loc = resolveSource(root, source)
  if (!loc) return null
  if (loc.file.endsWith('.svelte')) return inspectSvelteProps(root, source, loc)
  let code: string
  try {
    code = await readFile(loc.file, 'utf8')
  } catch {
    return null
  }
  const found = await findElementAtLine(code, loc.line, loc.column)
  if (!found) return null

  const current = readAttributes(found.opening)

  // Schema only resolves for capitalized components (host tags like <h1> have none).
  const isComponent = /^[A-Z]/.test(found.name)
  let schema = isComponent ? await schemaFor(code, found.name) : []
  let crossFile = false
  // Not defined in this file? Follow the component's import to its definition.
  if (isComponent && schema.length === 0) {
    const def = await resolveComponentFile(root, loc.file, found.ast, found.name)
    if (def) {
      try {
        schema = await schemaFor(await readFile(def.file, 'utf8'), def.exportName)
        crossFile = schema.length > 0
      } catch {
        /* unreadable — fall back to current attributes */
      }
    }
  }

  const fields = mergeFields(schema, current)

  const hasSchema = schema.length > 0
  const note = isComponent
    ? hasSchema
      ? crossFile
        ? `Schema resolved from the imported ${found.name} definition.`
        : undefined
      : 'No react-docgen schema resolved — showing the props currently set.'
    : 'Host element — editing its literal attributes (no component schema).'

  return { component: found.name, source, fields, hasSchema, ...(note ? { note } : {}) }
}

/** Render a JSX attribute literal, e.g. variant="primary" / count={3} / ok={true}. */
function renderAttr(name: string, kind: PropKind, value: string | number | boolean): string {
  if (kind === 'number') return `${name}={${Number(value)}}`
  if (kind === 'boolean') return `${name}={${value ? 'true' : 'false'}}`
  const s = String(value)
  // Safe to use the plain quoted form when the string has no quotes/braces/newlines.
  return /^[^"\\\n<>{}]*$/.test(s) ? `${name}="${s}"` : `${name}={${JSON.stringify(s)}}`
}

async function applyPropEdit(root: string, edit: PropEdit): Promise<PropEditResult> {
  // Never splice an unvalidated name into source — don't trust the renderer
  // payload (defense in depth; inspection already drops non-identifier keys).
  if (!isValidAttrName(edit.name)) {
    return { applied: false, error: 'Invalid prop name.' }
  }
  // 'other' values can't be expressed as a literal here — that's the agent's job.
  if (edit.kind === 'other') {
    return { applied: false, needsAgent: true, agentPrompt: agentPromptFor(edit) }
  }
  const loc = resolveSource(root, edit.source)
  if (!loc) return { applied: false, error: 'Could not resolve the source location.' }
  if (loc.file.endsWith('.svelte')) return applySvelteEdit(root, edit, loc)
  let code: string
  try {
    code = await readFile(loc.file, 'utf8')
  } catch {
    return { applied: false, error: 'Could not read the source file.' }
  }
  const found = await findElementAtLine(code, loc.line, loc.column)
  if (!found) {
    return { applied: false, needsAgent: true, agentPrompt: agentPromptFor(edit) }
  }
  const attrText = renderAttr(edit.name, edit.kind, edit.value)
  const existing = readAttributes(found.opening).find((a) => a.name === edit.name)

  let next: string
  if (existing) {
    next = code.slice(0, existing.start) + attrText + code.slice(existing.end)
  } else {
    const nameNode = found.opening.name as BabelNode
    const insertAt = nameNode.end
    next = code.slice(0, insertAt) + ' ' + attrText + code.slice(insertAt)
  }
  // No-op: the value is already what's on disk — skip the write (and the redundant
  // HMR round-trip). Still report success so the UI confirms.
  if (next === code) return { applied: true }
  try {
    await writeFile(loc.file, next, 'utf8')
  } catch {
    return { applied: false, error: 'Could not write the source file.' }
  }
  return { applied: true }
}

export function agentPromptFor(edit: PropEdit): string {
  const val = typeof edit.value === 'string' ? `"${edit.value}"` : String(edit.value)
  return `In ${edit.source}, set the \`${edit.name}\` prop of the selected element to ${val}.`
}

export function textAgentPrompt(source: string, text: string): string {
  return `In ${source}, change the selected element's text content to “${text.slice(0, 200)}”.`
}

/**
 * Inline text edit: rewrite a stamped element's text content in source. Only
 * elements whose children are plain text (a single JSXText, or empty) and whose
 * new text is splice-safe are applied directly — mixed/expression content,
 * self-closing elements, or `<{}>`-bearing text fall back to the agent.
 */
async function applyTextEdit(
  root: string,
  edit: { source: string; text: string }
): Promise<PropEditResult> {
  const loc = resolveSource(root, edit.source)
  if (!loc) return { applied: false, error: 'Could not resolve the source location.' }
  const newText = edit.text.replace(/\s+/g, ' ').trim()
  // `.svelte` → the Svelte adapter splices via svelte/compiler (agent-fallback for
  // expression/mixed content), mirroring the JSX path below.
  if (loc.file.endsWith('.svelte')) {
    return applySvelteTextEdit(root, { source: edit.source, text: newText }, loc)
  }
  let code: string
  try {
    code = await readFile(loc.file, 'utf8')
  } catch {
    return { applied: false, error: 'Could not read the source file.' }
  }
  const found = await findElementAtLine(code, loc.line, loc.column)
  const agentFallback = (): PropEditResult => ({
    applied: false,
    needsAgent: true,
    agentPrompt: textAgentPrompt(edit.source, newText)
  })
  if (!found) return agentFallback()

  const elements: BabelNode[] = []
  collectNodes(found.ast, 'JSXElement', elements)
  const element = elements.find(
    (e) => (e.openingElement as BabelNode | undefined)?.start === found.opening.start
  )
  if (!element || (found.opening as { selfClosing?: boolean }).selfClosing) return agentFallback()

  const children = (element.children as BabelNode[] | undefined) ?? []
  // Editable only when there are no element/expression children, and the new
  // text can't break out of a JSXText node.
  if (!children.every((c) => c.type === 'JSXText') || !/^[^<>{}]*$/.test(newText)) {
    return agentFallback()
  }

  let next: string
  if (children.length === 0) {
    const insertAt = (found.opening as BabelNode).end
    next = code.slice(0, insertAt) + newText + code.slice(insertAt)
  } else {
    const start = children[0].start
    const end = children[children.length - 1].end
    // Derive surrounding whitespace from the RAW source (not the entity-decoded
    // value, which would rewrite `&nbsp;` etc. as literal bytes). For an
    // all-whitespace child, lead and trail would overlap — zero them.
    const raw = code.slice(start, end)
    const allWs = /^\s*$/.test(raw)
    const lead = allWs ? '' : (raw.match(/^\s*/)?.[0] ?? '')
    const trail = allWs ? '' : (raw.match(/\s*$/)?.[0] ?? '')
    next = code.slice(0, start) + lead + newText + trail + code.slice(end)
  }
  if (next === code) return { applied: true } // no-op: text unchanged, skip the write
  try {
    await writeFile(loc.file, next, 'utf8')
  } catch {
    return { applied: false, error: 'Could not write the source file.' }
  }
  return { applied: true }
}

// --- v6: direct (agent-free) token application -----------------------------

// Main runs in Node (no CSS.supports), so family checks are regex-based.
const NAMED_COLORS = new Set([
  'red', 'blue', 'green', 'black', 'white', 'gray', 'grey', 'orange', 'purple', 'pink',
  'yellow', 'teal', 'cyan', 'magenta', 'transparent', 'currentcolor', 'inherit'
])
function isColorValue(v: string): boolean {
  const s = v.trim().toLowerCase()
  if (/gradient\(/.test(s)) return true
  if (/^(#|rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color\(|var\()/.test(s)) return true
  return NAMED_COLORS.has(s)
}
function isLengthValue(v: string): boolean {
  const s = v.trim()
  // Require a unit/% (a bare number is fontWeight/lineHeight/opacity/zIndex, not a
  // length). var(...) is allowed but T3 also gates on the property name.
  return /^-?\d*\.?\d+(px|rem|em|%|vh|vw|vmin|vmax|pt|ch|ex)$/.test(s) || /^var\(/.test(s)
}

// T3 only swaps a style property when BOTH the property NAME and the VALUE belong
// to the token's family — otherwise a color token could land in fontSize, etc.
const COLOR_STYLE_PROPS = new Set([
  'color', 'background', 'backgroundColor', 'borderColor', 'borderTopColor',
  'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'outlineColor', 'fill',
  'stroke', 'caretColor', 'textDecorationColor', 'columnRuleColor'
])
const LENGTH_STYLE_PROPS = new Set([
  'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'padding',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'margin', 'marginTop',
  'marginRight', 'marginBottom', 'marginLeft', 'gap', 'rowGap', 'columnGap', 'fontSize',
  'lineHeight', 'borderRadius', 'top', 'right', 'bottom', 'left', 'letterSpacing',
  'borderWidth'
])

/** The static key name of a style ObjectProperty (null for computed/spread). */
function stylePropKey(p: BabelNode): string | null {
  if (p.type !== 'ObjectProperty' || (p as { computed?: boolean }).computed) return null
  const k = p.key as BabelNode | undefined
  if (k?.type === 'Identifier') return (k as { name?: string }).name ?? null
  if (k?.type === 'StringLiteral') return (k as unknown as { value?: string }).value ?? null
  return null
}

// T2 — Tailwind color-utility class swap. The color utility families; `text-` is
// shared with font-size, so a `text-<size>` is excluded from the color match.
const COLOR_CLASS_FAMILIES = [
  'bg', 'text', 'border', 'ring', 'fill', 'stroke', 'decoration', 'outline', 'accent',
  'caret', 'divide', 'from', 'via', 'to', 'placeholder', 'shadow'
]
const TW_TEXT_SIZES = new Set([
  'xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl'
])

/** If `cls` is a plain color utility, return its family prefix (e.g. 'text' for
 * `text-gray-500`); null otherwise. Skips variants (`hover:…`) and arbitrary
 * values (`[…]`) — too ambiguous to rewrite safely. */
function colorClassFamily(cls: string): string | null {
  if (cls.includes(':') || cls.includes('[')) return null
  for (const f of COLOR_CLASS_FAMILIES) {
    if (cls.startsWith(`${f}-`)) {
      const suffix = cls.slice(f.length + 1)
      if (f === 'text' && TW_TEXT_SIZES.has(suffix)) return null // text-sm is a font size
      return f
    }
  }
  return null
}

/** The literal-string AST node behind a className attr value (`"…"` or `{'…'}`),
 * or null for an expression/dynamic className we must not rewrite. */
function classNameStringNode(v: BabelNode | null | undefined): BabelNode | null {
  if (!v) return null
  if (v.type === 'StringLiteral') return v
  if (v.type === 'JSXExpressionContainer') {
    const inner = unwrapExpr(v.expression as BabelNode)
    if (inner?.type === 'StringLiteral') return inner
  }
  return null
}

/** How to write a token reference into source: css vars stay var(--name); other
 * sources splice the resolved value (a manifest hex, a Tailwind scale value, …). */
function tokenRef(edit: TokenEdit): string {
  if (edit.tokenSource === 'css') {
    if (/^var\(/.test(edit.token.value)) return edit.token.value
    const n = edit.token.name
    return `var(${n.startsWith('--') ? n : `--${n}`})`
  }
  return edit.token.value
}

function tokenAgentPrompt(edit: TokenEdit): string {
  return `Apply the ${edit.group} token "${edit.token.name}" (${edit.token.value}) to the selected element${edit.source ? ` in ${edit.source}` : ''}.`
}

/** Resolve a component's prop schema (same-file → cross-file import), for T1. */
async function resolveSchema(
  root: string,
  file: string,
  code: string,
  found: FoundElement
): Promise<PropField[]> {
  if (!/^[A-Z]/.test(found.name)) return []
  let schema = await schemaFor(code, found.name)
  if (schema.length === 0) {
    const def = await resolveComponentFile(root, file, found.ast, found.name)
    if (def) {
      try {
        schema = await schemaFor(await readFile(def.file, 'utf8'), def.exportName)
      } catch {
        /* unreadable — no schema */
      }
    }
  }
  return schema
}

/**
 * Apply a design token directly when it maps to an *existing literal*, else hand
 * to the agent. Two unambiguous direct paths (first match wins):
 *  - T1 schema-enum swap: the component has an enum prop whose options include the
 *    token name → set that prop to the token name.
 *  - T3 inline-style swap: the element has a literal `style={{…}}` with exactly one
 *    property whose value is a string literal in the token's family → replace it.
 * Anything ambiguous (no stamp, add-new, multiple candidates) → needsAgent.
 */
async function applyTokenEdit(root: string, edit: TokenEdit): Promise<PropEditResult> {
  const toAgent = (): PropEditResult => ({
    applied: false,
    needsAgent: true,
    agentPrompt: tokenAgentPrompt(edit)
  })
  if (!edit.source) return toAgent()
  const loc = resolveSource(root, edit.source)
  if (!loc) return { applied: false, error: 'Could not resolve the source location.' }
  // Svelte token-splice is a follow-up; route to the agent for now.
  if (loc.file.endsWith('.svelte')) return toAgent()
  let code: string
  try {
    code = await readFile(loc.file, 'utf8')
  } catch {
    return { applied: false, error: 'Could not read the source file.' }
  }
  const found = await findElementAtLine(code, loc.line, loc.column)
  if (!found) return toAgent()

  // T1 — schema enum swap (the token name IS a valid enum option). If more than
  // one enum prop lists it, it's ambiguous → let the agent decide.
  const schema = await resolveSchema(root, loc.file, code, found)
  const enumFields = schema.filter(
    (f) => f.kind === 'enum' && f.options?.includes(edit.token.name)
  )
  if (enumFields.length === 1) {
    return applyPropEdit(root, {
      source: edit.source,
      name: enumFields[0].name,
      kind: 'enum',
      value: edit.token.name
    })
  }

  const isColorGroup = /colou?r/i.test(edit.group)

  // T2 — Tailwind color-utility class swap: for a tailwind color token on an
  // element with a literal className that has EXACTLY ONE color utility, swap that
  // utility's scale to the token (e.g. `text-gray-500` + token 'primary' →
  // `text-primary`). Zero/multiple matches, or a dynamic className → fall through.
  if (edit.tokenSource === 'tailwind' && isColorGroup) {
    const classAttr = (found.opening.attributes ?? []).find(
      (a) => a.type === 'JSXAttribute' && (a.name as { name?: string })?.name === 'className'
    )
    const strNode = classNameStringNode(classAttr?.value as BabelNode | null | undefined)
    if (strNode) {
      const raw = String((strNode as unknown as { value: string }).value)
      const classes = raw.split(/\s+/).filter(Boolean)
      const colorClasses = classes.filter((c) => colorClassFamily(c) != null)
      // The token name becomes a class suffix — require a single safe utility
      // token (no spaces/quotes), so we can't accidentally inject extra classes.
      if (colorClasses.length === 1 && /^[\w/.-]+$/.test(edit.token.name)) {
        const fam = colorClassFamily(colorClasses[0])!
        const swapped = classes
          .map((c) => (c === colorClasses[0] ? `${fam}-${edit.token.name}` : c))
          .join(' ')
        {
          const next =
            code.slice(0, strNode.start) + JSON.stringify(swapped) + code.slice(strNode.end)
          if (next === code) return { applied: true }
          try {
            await writeFile(loc.file, next, 'utf8')
          } catch {
            return { applied: false, error: 'Could not write the source file.' }
          }
          return { applied: true }
        }
      }
    }
  }

  // T3 — inline-style single-property swap, gated on BOTH the property name and
  // the value family (so a color token can't land in fontSize, etc.).
  const propSet = isColorGroup ? COLOR_STYLE_PROPS : LENGTH_STYLE_PROPS
  const valueInFamily = (v: string): boolean => (isColorGroup ? isColorValue(v) : isLengthValue(v))
  const styleAttr = (found.opening.attributes ?? []).find(
    (a) => a.type === 'JSXAttribute' && (a.name as { name?: string })?.name === 'style'
  )
  const styleExpr = unwrapExpr(
    (styleAttr?.value as BabelNode | undefined)?.expression as BabelNode | undefined
  )
  if (styleExpr?.type === 'ObjectExpression') {
    const matches = ((styleExpr as { properties?: BabelNode[] }).properties ?? []).filter((p) => {
      const key = stylePropKey(p)
      const val = p.value as BabelNode | undefined
      return (
        key != null &&
        propSet.has(key) &&
        val?.type === 'StringLiteral' &&
        valueInFamily(String((val as unknown as { value: string }).value))
      )
    })
    if (matches.length === 1) {
      const valNode = matches[0].value as BabelNode
      const next = code.slice(0, valNode.start) + JSON.stringify(tokenRef(edit)) + code.slice(valNode.end)
      if (next === code) return { applied: true }
      try {
        await writeFile(loc.file, next, 'utf8')
      } catch {
        return { applied: false, error: 'Could not write the source file.' }
      }
      return { applied: true }
    }
  }

  // Ambiguous (add-new property/class, className expression, multiple candidates,
  // host element with no schema + no inline style) → the agent decides.
  return toAgent()
}

export function registerPropsIpc(): void {
  ipcMain.handle('props:inspect', (_e, root: string, source: string) => inspectProps(root, source))
  ipcMain.handle('props:apply', (_e, root: string, edit: PropEdit) => applyPropEdit(root, edit))
  ipcMain.handle('props:applyToken', (_e, root: string, edit: TokenEdit) => applyTokenEdit(root, edit))
  ipcMain.handle('text:apply', (_e, root: string, edit: { source: string; text: string }) =>
    applyTextEdit(root, edit)
  )
}
