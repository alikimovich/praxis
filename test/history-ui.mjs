/**
 * v5-D "previous agents" renderer UI — drives the stores directly (the
 * chat-render.mjs pattern), no Claude creds. Seeds a project + a fake history
 * record, then asserts the rail's previous-sessions list renders and the
 * SessionReview modal opens with the record's branch / PR / files / transcript.
 *
 * The backend capture/persist is covered cred-free by agent-history.mjs; this is
 * purely the rendered DOM from seeded store state.
 *
 * Run with: bun run test:historyui
 */
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const artifacts = join(root, 'test', 'artifacts')
mkdirSync(artifacts, { recursive: true })

let app
try {
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(root, 'out', 'main', 'index.js')],
    cwd: root
  })
  const win = await app.firstWindow()
  await win.waitForSelector('.empty__open', { timeout: 15000 })
  await win.evaluate(() => window.__dsgnWorkspace.getState().openOrActivate('/tmp/dsgn-test-project'))
  await win.waitForSelector('.composer__input', { timeout: 15000 })
  const assert = (cond, msg) => {
    if (!cond) throw new Error(msg)
  }

  // Seed an open project (so the rail renders it as active) + a past session in
  // useHistory keyed by that project's projectKey.
  const key = await win.evaluate(() => {
    const ws = window.__dsgnWorkspace.getState()
    ws.reset()
    const k = ws.openOrActivate('/fake/proj', { name: 'proj' })
    window.__dsgnStore.getState().setActiveChat(k)
    const now = Date.now()
    window.__dsgnHistory.setState({
      byKey: {
        [k]: [
          {
            id: 'h1',
            projectKey: k,
            projectRoot: '/fake/proj',
            projectName: 'proj',
            startedAt: now - 3_600_000,
            endedAt: now - 3_500_000,
            branch: 'dsgn/history-x',
            prUrl: 'https://github.com/x/y/pull/1',
            filesTouched: ['src/App.tsx'],
            transcript: [
              { role: 'user', text: 'make the header blue', at: now - 3_600_000 },
              { role: 'status', text: 'Edit · src/App.tsx', at: now - 3_550_000 },
              { role: 'assistant', text: 'Done — header is now blue.', at: now - 3_500_000 }
            ]
          }
        ]
      }
    })
    return k
  })
  assert(key, 'workspace should produce a project key')

  // The rail shows the past session row with a relative time + status dot.
  await win.waitForSelector('.rail__session', { timeout: 5000 })
  const label = (await win.textContent('.rail__session-label'))?.trim() ?? ''
  assert(/ago/.test(label), `session row should show a relative time (got "${label}")`)
  assert(
    (await win.$('.rail__sdot--pr')) !== null,
    'a PR-tagged session should get the --pr status dot'
  )
  await win.screenshot({ path: join(artifacts, 'history-rail.png') })

  // Click the row → the review modal opens with branch chip, PR link, files, transcript.
  await win.click('.rail__session-open')
  await win.waitForSelector('.review', { timeout: 5000 })
  const meta = (await win.textContent('.review__meta')) ?? ''
  assert(meta.includes('dsgn/history-x'), `review should show the branch chip (got "${meta}")`)
  assert(meta.toLowerCase().includes('pr'), 'review should show the PR link chip')
  assert(meta.includes('1 file'), `review should show files-touched count (got "${meta}")`)
  const tx = (await win.textContent('.review__transcript')) ?? ''
  assert(tx.includes('make the header blue'), 'transcript shows the user prompt')
  assert(tx.includes('header is now blue'), 'transcript shows the assistant reply')
  assert(
    (await win.$('.review__line--user')) && (await win.$('.review__line--assistant')),
    'transcript renders role-tagged lines'
  )
  await win.screenshot({ path: join(artifacts, 'history-review.png') })

  // Escape closes the modal.
  await win.keyboard.press('Escape')
  await win.waitForFunction(() => !document.querySelector('.review'), { timeout: 5000 })

  // Delete the row → it leaves the rail (drives useHistory.remove; the main-side
  // sessions:remove is a harmless no-op on a fake id).
  await win.click('.rail__session-x')
  await win.waitForFunction(() => !document.querySelector('.rail__session'), { timeout: 5000 })

  console.log('HISTORY-UI OK — rail lists previous agents, review modal renders, delete removes')
} catch (err) {
  console.error('HISTORY-UI FAILED:', err?.message ?? err)
  process.exitCode = 1
} finally {
  await app?.close()
}
