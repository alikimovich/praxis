import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import type { PanelRecipe } from '@alikimovich/content-controls/recipe'
import type { ContentControlDocument, ContentControlPanel } from '../shared/api'
import { enqueueRepoWrite } from './repo-write-queue'

const MAX_BYTES = 512 * 1024
const digest = (text: string): string => createHash('sha256').update(text).digest('hex')
const revisionOf = (text: string, panel: ContentControlPanel): string =>
  digest(`${text}\n${JSON.stringify(panel)}`)
const storeFile = (root: string): string => join(root, '.praxis', 'content-controls.json')

export function validateContentFile(file: unknown): asserts file is string {
  if (
    typeof file !== 'string' ||
    file.length > 250 ||
    !/^[\w/-]+\.json$/.test(file) ||
    file.split('/').some((p) => !p || p.startsWith('.') || p === 'node_modules') ||
    /(^|\/)(package|tsconfig[^/]*)\.json$/.test(file)
  )
    throw new Error(
      'Bind a repo-relative content .json file outside hidden, dependency and configuration files.'
    )
}
async function confined(root: string, file: string): Promise<string> {
  const [base, target] = await Promise.all([realpath(root), realpath(join(root, file))])
  const rel = relative(base, target)
  if (!rel || rel.startsWith('..') || rel.startsWith('/'))
    throw new Error('Content file escapes the project.')
  return target
}
async function contentPath(root: string, file: string): Promise<string> {
  validateContentFile(file)
  const target = await confined(root, file)
  validateContentFile(relative(await realpath(root), target))
  return target
}
async function boundedRead(path: string): Promise<string> {
  if ((await stat(path)).size > MAX_BYTES) throw new Error('Content exceeds 512 KB.')
  return readFile(path, 'utf8')
}
async function checkedRecipe(input: unknown): Promise<PanelRecipe> {
  const { parseRecipe } = await import('@alikimovich/content-controls/recipe')
  if (JSON.stringify(input).length > 32_000) throw new Error('Recipe exceeds 32 KB.')
  return parseRecipe(input)
}
async function readStore(root: string): Promise<ContentControlPanel[]> {
  let text: string
  try {
    text = await boundedRead(await confined(root, '.praxis/content-controls.json'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const data = JSON.parse(text)
  if (data.version !== 1 || !Array.isArray(data.panels) || data.panels.length > 20)
    throw new Error('Invalid content-controls store. Repair it before saving panels.')
  const seen = new Set<string>()
  return Promise.all(
    data.panels.map(async (panel: ContentControlPanel) => {
      validateContentFile(panel.file)
      const recipe = await checkedRecipe(panel.recipe)
      if (panel.id !== recipe.id || seen.has(panel.id)) throw new Error('Invalid panel identity.')
      seen.add(panel.id)
      return { id: recipe.id, file: panel.file, recipe }
    })
  )
}
async function writeStore(root: string, panels: ContentControlPanel[]): Promise<void> {
  const file = storeFile(root)
  await mkdir(dirname(file), { recursive: true })
  // Reject a redirected sidecar before writing any state.
  await confined(root, '.praxis')
  const text = `${JSON.stringify({ version: 1, panels }, null, 2)}\n`
  if (Buffer.byteLength(text) > MAX_BYTES) throw new Error('Content panel store exceeds 512 KB.')
  const tmp = `${file}.${randomUUID()}.tmp`
  try {
    await writeFile(tmp, text, { flag: 'wx' })
    await rename(tmp, file)
  } finally {
    await rm(tmp, { force: true })
  }
}
export async function readContentDocument(
  root: string,
  panel: ContentControlPanel
): Promise<ContentControlDocument> {
  const text = await boundedRead(await contentPath(root, panel.file))
  const value = JSON.parse(text)
  const { validateContent } = await import('@alikimovich/content-controls/recipe')
  const issues = validateContent(panel.recipe, value)
  if (issues.length) throw new Error(issues.join('\n'))
  return { panel, value, revision: revisionOf(text, panel) }
}
export async function listContentControls(root: string): Promise<ContentControlPanel[]> {
  return readStore(root)
}
export async function getContentControls(
  root: string,
  id: string
): Promise<ContentControlDocument> {
  const panel = (await readStore(root)).find((p) => p.id === id)
  if (!panel) throw new Error('Content panel not found.')
  return readContentDocument(root, panel)
}
/** A registered worktree binding may not exist in the live checkout yet. */
export async function getAvailableContentControls(
  root: string,
  id: string
): Promise<ContentControlDocument | null> {
  try {
    return await getContentControls(root, id)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}
export async function defineContentControls(
  root: string,
  liveRoot: string,
  input: { file: string; recipe: unknown }
): Promise<ContentControlPanel> {
  validateContentFile(input.file)
  const recipe = await checkedRecipe(input.recipe)
  const panel = { id: recipe.id, file: input.file, recipe }
  await readContentDocument(root, panel)
  return enqueueRepoWrite(liveRoot, async () => {
    const panels = await readStore(liveRoot)
    const at = panels.findIndex((p) => p.id === panel.id)
    if (at < 0) {
      if (panels.length >= 20) throw new Error('Content panel limit reached (20).')
      panels.push(panel)
    } else panels[at] = panel
    await writeStore(liveRoot, panels)
    return panel
  })
}
export async function saveContentControls(
  root: string,
  id: string,
  revision: string,
  value: unknown
): Promise<ContentControlDocument> {
  return enqueueRepoWrite(root, async () => {
    const current = await getContentControls(root, id)
    if (revision !== current.revision)
      throw new Error(
        'Content changed on disk. Reload the panel before saving; your draft is preserved.'
      )
    const { validateContent } = await import('@alikimovich/content-controls/recipe')
    const issues = validateContent(current.panel.recipe, value)
    if (issues.length) throw new Error(issues.join('\n'))
    // Apply only recipe-owned keys. Unknown document and item fields remain intact.
    const incoming = value as Record<string, unknown>
    const next = structuredClone(current.value)
    for (const section of current.panel.recipe.sections) {
      if (section.fields) for (const field of section.fields) next[field.key] = incoming[field.key]
      else {
        const c = section.collection
        const oldItems = current.value[c.key] as Record<string, unknown>[]
        next[c.key] = (incoming[c.key] as Record<string, unknown>[]).map((item) => {
          const old = oldItems.find((old) => old.id === item.id)
          const result: Record<string, unknown> = { ...(old ?? c.defaults), id: item.id }
          for (const field of c.fields) result[field.key] = item[field.key]
          return result
        })
      }
    }
    const after = JSON.stringify(next, null, 2) + '\n'
    if (Buffer.byteLength(after) > MAX_BYTES) throw new Error('Content exceeds 512 KB.')
    const file = await contentPath(root, current.panel.file)
    const before = await boundedRead(file)
    if (revisionOf(before, current.panel) !== revision)
      throw new Error('Content changed on disk. Reload before saving.')
    const { commitEdit } = await import('./props')
    const result = await commitEdit(root, file, before, after, `content:${id}`)
    if (!result.applied) throw new Error(result.error ?? 'Could not save content.')
    return { panel: current.panel, value: next, revision: revisionOf(after, current.panel) }
  })
}
export async function removeContentControls(root: string, id: string): Promise<void> {
  await enqueueRepoWrite(root, async () =>
    writeStore(
      root,
      (await readStore(root)).filter((p) => p.id !== id)
    )
  )
}
