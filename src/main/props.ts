import { ipcMain } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { dirname, isAbsolute, join, normalize, relative } from 'path'
import type { PropEdit, PropEditResult, PropField, PropInspection, PropKind } from '../shared/api'

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

/** Resolve "relpath:line[:col]" against the project root, refusing escapes. */
function resolveSource(
  root: string,
  source: string
): { file: string; line: number; column?: number } | null {
  const m = /^(.*):(\d+)(?::(\d+))?$/.exec(source)
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
const isValidAttrName = (name: string): boolean => ATTR_NAME_RE.test(name)

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

interface CurrentAttr {
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

function literalFromExpression(
  expr: BabelNode | undefined
): { kind: PropKind; value: string | number | boolean } | null {
  if (!expr) return null
  const lit = expr as unknown as { value: string | number | boolean }
  if (expr.type === 'StringLiteral') return { kind: 'string', value: lit.value }
  if (expr.type === 'NumericLiteral') return { kind: 'number', value: lit.value }
  if (expr.type === 'BooleanLiteral') return { kind: 'boolean', value: lit.value }
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
function withinRoot(root: string, file: string): boolean {
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

async function inspectProps(root: string, source: string): Promise<PropInspection | null> {
  const loc = resolveSource(root, source)
  if (!loc) return null
  let code: string
  try {
    code = await readFile(loc.file, 'utf8')
  } catch {
    return null
  }
  const found = await findElementAtLine(code, loc.line, loc.column)
  if (!found) return null

  const current = readAttributes(found.opening)
  const currentByName = new Map(current.map((c) => [c.name, c]))

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

  const fields: PropField[] = []
  const seen = new Set<string>()
  // Schema-defined props first (richer: types, enums, descriptions), with any
  // current value overlaid.
  for (const f of schema) {
    seen.add(f.name)
    const cur = currentByName.get(f.name)
    fields.push({
      ...f,
      ...(cur && !cur.expression ? { value: cur.value, fromSchema: false } : {}),
      ...(cur?.expression ? { expression: true } : {})
    })
  }
  // Then attributes present on the element but not in the schema.
  for (const c of current) {
    if (seen.has(c.name)) continue
    fields.push({
      name: c.name,
      kind: c.kind,
      ...(c.value !== undefined ? { value: c.value } : {}),
      ...(c.expression ? { expression: true } : {})
    })
  }

  const note = isComponent
    ? schema.length
      ? crossFile
        ? `Schema resolved from the imported ${found.name} definition.`
        : undefined
      : 'No react-docgen schema resolved — showing the props currently set.'
    : 'Host element — editing its literal attributes (no component schema).'

  return { component: found.name, source, fields, ...(note ? { note } : {}) }
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
  try {
    await writeFile(loc.file, next, 'utf8')
  } catch {
    return { applied: false, error: 'Could not write the source file.' }
  }
  return { applied: true }
}

function agentPromptFor(edit: PropEdit): string {
  const val = typeof edit.value === 'string' ? `"${edit.value}"` : String(edit.value)
  return `In ${edit.source}, set the \`${edit.name}\` prop of the selected element to ${val}.`
}

export function registerPropsIpc(): void {
  ipcMain.handle('props:inspect', (_e, root: string, source: string) => inspectProps(root, source))
  ipcMain.handle('props:apply', (_e, root: string, edit: PropEdit) => applyPropEdit(root, edit))
}
