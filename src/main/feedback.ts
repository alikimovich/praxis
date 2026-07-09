import { execFile } from 'child_process'
import { promisify } from 'util'
import { app, ipcMain, type BrowserWindow } from 'electron'
import type { FeedbackInput, FeedbackResult } from '../shared/api'
import { buildFeedbackBody, buildFeedbackTitle } from '../shared/feedback-body'

/**
 * In-app feedback (LKM-27) → a GitHub issue on Praxis's OWN repo. The app is
 * distributed as a git checkout (`app.getAppPath()`), so `gh issue create` run
 * there targets the right repo via its `origin` remote — the same seam the
 * self-updater uses (update-ipc.ts). Detection/preflight mirrors annotations.ts's
 * publish path: fail with a friendly message before doing anything.
 *
 * GitHub exposes no API/gh way to upload an image attachment, so an opted-in
 * screenshot rides along inside the issue body as a downscaled base64 data URI
 * (see feedback-body.ts) rather than a rendered attachment.
 */

const execFileP = promisify(execFile)

/**
 * A GUI-launched Electron inherits a minimal PATH, so `git`/`gh` may not resolve.
 * Prepend the common toolchain locations, like update-ipc.ts's spawnPath.
 */
const toolPath = (): string =>
  ['/opt/homebrew/bin', '/usr/local/bin', process.env.PATH ?? ''].filter(Boolean).join(':')

const run = (cmd: string, args: string[], cwd: string): Promise<{ stdout: string }> =>
  execFileP(cmd, args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, PATH: toolPath() }
  }) as Promise<{ stdout: string }>

/** Downscale + re-encode a full-window capture so its data URI stays small. */
async function captureWindow(win: BrowserWindow | null): Promise<string | null> {
  if (!win) return null
  try {
    const img = await win.webContents.capturePage()
    if (!img || img.isEmpty()) return null
    // A retina window capture is huge; 900px-wide JPEG keeps the data URI small
    // enough to survive GitHub's 65536-char issue-body cap.
    const { width } = img.getSize()
    const scaled = width > 900 ? img.resize({ width: 900 }) : img
    const jpeg = scaled.toJPEG(60)
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`
  } catch {
    return null
  }
}

async function submitFeedback(
  repoRoot: string,
  input: FeedbackInput
): Promise<FeedbackResult> {
  const body = (input.body ?? '').trim()
  if (!body) return { ok: false, error: 'Please describe your feedback first.' }

  // Preflight — fail before touching gh.
  try {
    await run('git', ['-C', repoRoot, 'rev-parse', '--is-inside-work-tree'], repoRoot)
  } catch {
    return { ok: false, error: 'Praxis isn’t a git checkout, so feedback can’t be filed.' }
  }
  try {
    await run('git', ['-C', repoRoot, 'remote', 'get-url', 'origin'], repoRoot)
  } catch {
    return { ok: false, error: 'No “origin” remote on the Praxis checkout.' }
  }
  try {
    await run('gh', ['--version'], repoRoot)
  } catch {
    return { ok: false, error: 'GitHub CLI (gh) not found — install it to send feedback.' }
  }

  const title = buildFeedbackTitle(body)
  const issueBody = buildFeedbackBody({
    body,
    conversation: input.conversation ?? null,
    screenshot: input.screenshot ?? null
  })

  try {
    const { stdout } = await run(
      'gh',
      ['issue', 'create', '--title', title, '--body', issueBody],
      repoRoot
    )
    const url = stdout
      .trim()
      .split('\n')
      .find((l) => /^https?:\/\//.test(l))
    return { ok: true, ...(url ? { url } : {}) }
  } catch (err) {
    const msg = (err instanceof Error ? err.message : String(err))
      .split('\n')
      .slice(0, 3)
      .join('\n')
    // gh prints an auth hint to stderr; surface the gist so the user can act.
    const friendly = /gh auth login|authentication|not logged/i.test(msg)
      ? 'GitHub CLI isn’t authenticated — run `gh auth login`, then try again.'
      : msg
    return { ok: false, error: friendly }
  }
}

/**
 * Register the feedback IPC. `getWindow` yields the main window (for the
 * screenshot capture); the issue is filed against Praxis's own checkout.
 */
export function registerFeedbackIpc(getWindow: () => BrowserWindow | null): void {
  const repoRoot = app.getAppPath()
  ipcMain.handle('feedback:capture', () => captureWindow(getWindow()))
  ipcMain.handle('feedback:submit', (_e, input: FeedbackInput) =>
    submitFeedback(repoRoot, input)
  )
}
