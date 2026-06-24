import { ipcMain } from 'electron'
import { execFile } from 'child_process'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { join } from 'path'
import { promisify } from 'util'
import type { Annotation, AnnotationInput, PublishResult } from '../shared/api'
import { buildPrBody } from '../shared/pr-body'

/**
 * Annotation sidecar + engineer handoff (v3). Reviewer notes are pinned to
 * elements and stored in `<repo>/.dsgn/annotations.json` — a sidecar the agent
 * is told not to touch (writes under `.dsgn/` are denied in agent.ts). "Publish"
 * turns the dsgn-related working changes + the notes into a branch and a PR.
 */

const execFileP = promisify(execFile)
const dir = (root: string): string => join(root, '.dsgn')
const file = (root: string): string => join(dir(root), 'annotations.json')

let counter = 0
const newId = (): string => `a${Date.now().toString(36)}${(counter++).toString(36)}`

async function readAnnotations(root: string): Promise<Annotation[]> {
  try {
    const raw = await readFile(file(root), 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Annotation[]) : []
  } catch {
    return []
  }
}

/** Atomic write (tmp + rename) so a crash can't leave a half-written file that
 *  readAnnotations would silently treat as "no notes". */
async function writeAnnotations(root: string, list: Annotation[]): Promise<void> {
  await mkdir(dir(root), { recursive: true })
  const tmp = file(root) + '.tmp'
  await writeFile(tmp, JSON.stringify(list, null, 2) + '\n', 'utf8')
  await rename(tmp, file(root))
}

// Main is the only writer, but two IPC calls can interleave at their awaits.
// Serialize all mutations through a promise chain so read-modify-write is atomic.
let writeChain: Promise<unknown> = Promise.resolve()
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = writeChain.then(task, task)
  writeChain = run.catch(() => undefined)
  return run
}

function addAnnotation(root: string, input: AnnotationInput): Promise<Annotation[]> {
  return serialize(async () => {
    const text = input.text.trim()
    if (!text) return readAnnotations(root)
    const list = await readAnnotations(root)
    const annotation: Annotation = {
      id: newId(),
      source: input.source,
      selector: input.selector,
      tag: input.tag,
      text: text.slice(0, 2000),
      createdAt: new Date().toISOString()
    }
    const next = [...list, annotation]
    await writeAnnotations(root, next)
    return next
  })
}

function removeAnnotation(root: string, id: string): Promise<Annotation[]> {
  return serialize(async () => {
    const next = (await readAnnotations(root)).filter((a) => a.id !== id)
    await writeAnnotations(root, next)
    return next
  })
}

async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await execFileP('git', args, { cwd: root, maxBuffer: 10 * 1024 * 1024 })
  return stdout.trim()
}

/** Tracked files changed vs HEAD — clean paths (no porcelain quoting/rename arrows). */
async function changedSince(root: string): Promise<string[]> {
  const out = await git(root, ['-c', 'core.quotePath=false', 'diff', '--name-only', 'HEAD'])
  return out.split('\n').map((l) => l.trim()).filter(Boolean)
}

async function publishToPr(root: string, opts: { title: string }): Promise<PublishResult> {
  const title = opts.title || 'dsgn: design handoff'
  // --- Pre-flight: fail before any mutation. ---
  let original: string
  try {
    await git(root, ['rev-parse', '--is-inside-work-tree'])
    original = await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])
  } catch {
    return { ok: false, error: 'Not a git repository.' }
  }
  if (original === 'HEAD') {
    return { ok: false, error: 'You’re on a detached HEAD — check out a branch first.' }
  }
  try {
    await git(root, ['remote', 'get-url', 'origin'])
  } catch {
    return { ok: false, error: 'No “origin” remote — add one, then publish.' }
  }
  try {
    await execFileP('gh', ['--version'])
  } catch {
    return { ok: false, error: 'GitHub CLI (gh) not found — install it to publish a PR.' }
  }

  const annotations = await readAnnotations(root)
  const changedFiles = await changedSince(root)
  if (!changedFiles.length && !annotations.length) {
    return { ok: false, error: 'Nothing to publish — no changes or notes yet.' }
  }

  const branch = `dsgn/handoff-${Date.now().toString(36)}`
  let committed = false
  try {
    await git(root, ['checkout', '-b', branch])
    // Stage tracked changes + the sidecar only — never sweep in untracked files
    // (local .env, build artifacts, unrelated WIP).
    await git(root, ['add', '-u'])
    await git(root, ['add', '--', '.dsgn'])
    const staged = await git(root, ['diff', '--cached', '--name-only'])
    if (!staged) {
      await git(root, ['checkout', original])
      await git(root, ['branch', '-D', branch])
      return { ok: false, error: 'Nothing to publish — no changes or notes yet.' }
    }
    await git(root, ['commit', '-m', title])
    committed = true
    await git(root, ['push', '-u', 'origin', branch])

    const body = buildPrBody(annotations, changedFiles)
    const { stdout } = await execFileP('gh', ['pr', 'create', '--title', title, '--body', body], {
      cwd: root,
      maxBuffer: 10 * 1024 * 1024
    })
    const url = stdout.trim().split('\n').find((l) => /^https?:\/\//.test(l))
    return { ok: true, ...(url ? { url } : {}) }
  } catch (err) {
    const msg = (err instanceof Error ? err.message : String(err)).split('\n').slice(0, 3).join('\n')
    // Roll back to the user's branch. If we already committed, the work lives on
    // the handoff branch — say so rather than silently leaving them stranded.
    try {
      await git(root, ['checkout', original])
      if (!committed) await git(root, ['branch', '-D', branch])
    } catch {
      /* best-effort */
    }
    return committed
      ? { ok: false, error: `Committed to ${branch}, but couldn’t finish: ${msg}` }
      : { ok: false, error: msg }
  }
}

export function registerAnnotationsIpc(): void {
  ipcMain.handle('annotations:list', (_e, root: string) => readAnnotations(root))
  ipcMain.handle('annotations:add', (_e, root: string, input: AnnotationInput) =>
    addAnnotation(root, input)
  )
  ipcMain.handle('annotations:remove', (_e, root: string, id: string) =>
    removeAnnotation(root, id)
  )
  ipcMain.handle('publish:to-pr', (_e, root: string, opts: { title: string }) =>
    publishToPr(root, opts)
  )
}
