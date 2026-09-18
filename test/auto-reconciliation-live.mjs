/** Real Codex turn + concurrent live edit, followed by automatic reconciliation. */
import assert from 'node:assert/strict'
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const repo = mkdtempSync(join(tmpdir(), 'praxis-reconcile-live-'))
const userData = mkdtempSync(join(tmpdir(), 'praxis-reconcile-ud-'))
const git = (...args) =>
  execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim()
let app
try {
  git('init', '-q', '-b', 'main')
  git('config', 'user.name', 'Test')
  git('config', 'user.email', 'test@example.com')
  writeFileSync(join(repo, '.gitignore'), 'node_modules\n.env\n')
  writeFileSync(join(repo, 'labels.txt'), 'Labels: ORIGINAL\n')
  git('add', '.')
  git('commit', '-qm', 'initial')
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(root, 'out/main/index.js')],
    cwd: root,
    env: { ...process.env, PRAXIS_USER_DATA: userData }
  })
  const win = await app.firstWindow()
  await win.waitForSelector('.empty__open', { timeout: 15000 })
  await win.evaluate(async (path) => {
    window.testEvents = []
    window.api.agent.onEvent((event) => window.testEvents.push(event))
    await window.api.agent.openProject(path, {
      provider: 'codex',
      permissionMode: 'bypassPermissions'
    })
    await window.api.agent.send(
      'Edit labels.txt, replacing ORIGINAL with CHAT. Keep the Labels: prefix. If concurrent edits later introduce other labels, preserve all labels together. Only edit this text file. No questions.'
    )
  }, repo)
  // send's acknowledgement follows the private base snapshot, before the model edit.
  writeFileSync(join(repo, 'labels.txt'), 'Labels: LIVE\n')
  await win.waitForFunction(
    () => window.testEvents.some((e) => e.type === 'landing-finished'),
    null,
    { timeout: 180000 }
  )
  const events = await win.evaluate(() => window.testEvents)
  const errors = events
    .filter((e) => e.type === 'error')
    .map((e) => e.message)
    .join('\n')
  if (
    /not logged in|login|sign in|unauthorized|credential|usage limit/i.test(errors) &&
    !events.some((e) => e.type === 'reconciliation-started')
  ) {
    console.log('AUTO-RECONCILIATION LIVE SKIP — provider unavailable:', errors)
  } else {
    assert(!errors, errors)
    assert.equal(
      events.filter((e) => e.type === 'reconciliation-started').length,
      1,
      'exactly one automatic continuation'
    )
    assert(!events.some((e) => e.type === 'isolation' && e.state === 'parked'), 'no Resolve card')
    const text = readFileSync(join(repo, 'labels.txt'), 'utf8')
    assert(text.includes('LIVE') && text.includes('CHAT') && !text.includes('<<<<<<<'), text)
    assert.equal(git('status', '--porcelain'), '', 'reconciled changes are committed')
    console.log(
      'AUTO-RECONCILIATION LIVE OK — real Codex continuation preserved both edits without Resolve'
    )
  }
} finally {
  await app?.close()
  rmSync(repo, { recursive: true, force: true })
  rmSync(userData, { recursive: true, force: true })
}
