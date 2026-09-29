import { execFile } from 'child_process'
import { promisify } from 'util'
import type { FeedbackResult } from '../shared/api'

/**
 * The legacy-launch twin of the workflow owner's `feedback` (service/WorkflowTools.swift):
 * `gh issue create` run in Trezi's own checkout, so its `origin` remote picks the repo —
 * the same seam the self-updater uses. Under the Swift launch the service files the issue
 * (journaled, reconciled by exact title after an uncertain create) and this never runs.
 * Preflight fails with a friendly message before anything touches gh.
 */

const execFileP = promisify(execFile)

/** A GUI-launched app inherits a minimal PATH, so `git`/`gh` may not resolve. */
const toolPath = (): string =>
  ['/opt/homebrew/bin', '/usr/local/bin', process.env.PATH ?? ''].filter(Boolean).join(':')

const run = (cmd: string, args: string[], cwd: string): Promise<{ stdout: string }> =>
  execFileP(cmd, args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, PATH: toolPath() }
  }) as Promise<{ stdout: string }>

export async function fileFeedbackIssue(repoRoot: string, title: string, body: string): Promise<FeedbackResult> {
  try {
    await run('git', ['-C', repoRoot, 'rev-parse', '--is-inside-work-tree'], repoRoot)
  } catch {
    return { ok: false, error: 'Trezi isn’t a git checkout, so feedback can’t be filed.' }
  }
  try {
    await run('git', ['-C', repoRoot, 'remote', 'get-url', 'origin'], repoRoot)
  } catch {
    return { ok: false, error: 'No “origin” remote on the Trezi checkout.' }
  }
  try {
    await run('gh', ['--version'], repoRoot)
  } catch {
    return { ok: false, error: 'GitHub CLI (gh) not found — install it to send feedback.' }
  }
  try {
    const { stdout } = await run('gh', ['issue', 'create', '--title', title, '--body', body], repoRoot)
    const url = stdout
      .trim()
      .split('\n')
      .find((l) => /^https?:\/\//.test(l))
    return { ok: true, ...(url ? { url } : {}) }
  } catch (err) {
    // The failure text without the (up to 65 KB) body that node echoes in its message.
    const stderr = (err as { stderr?: unknown }).stderr
    const detail = typeof stderr === 'string' ? stderr : err instanceof Error ? err.message : String(err)
    const msg = ['Command failed: gh issue create', ...detail.split('\n')].slice(0, 3).join('\n')
    // gh prints an auth hint to stderr; surface the gist so the user can act.
    const friendly = /gh auth login|authentication|not logged/i.test(msg)
      ? 'GitHub CLI isn’t authenticated — run `gh auth login`, then try again.'
      : msg
    return { ok: false, error: friendly }
  }
}
