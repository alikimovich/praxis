// Preload for the parity runs in test/conversation-owner.mjs: installs the real Swift
// conversation owner, and the repository and source owners a chat's landing goes
// through (fixture binary CONVERSATION_FIXTURE, profile CONVERSATION_PROFILE), before a
// legacy chat suite runs, so the suite's own assertions exercise Swift spawn admission,
// History writes, Git landings and Undo records through the unchanged TS entry points.
// Prints how many conversation frames it sent.
import { mock } from 'bun:test'
import { mkdirSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { setConversationOwner } from '../../src/main/conversation-owner.ts'
import { setRepositoryOwner } from '../../src/main/repository-owner.ts'
import { setSourceOwner } from '../../src/main/source-owner.ts'
import { startConversationFixture } from './conversation-fixture.mjs'

// No model-catalog discovery (it would run the Codex CLI): these runs make no provider calls.
mock.module('../../src/main/providers.ts', () => ({ registerProviderIpc: () => {} }))
mkdirSync(process.env.CONVERSATION_PROFILE, { recursive: true })
// Worktrees may live anywhere under the temp dir there, as in the repository parity runs.
const fixture = await startConversationFixture(process.env.CONVERSATION_FIXTURE, realpathSync(process.env.CONVERSATION_PROFILE),
  { REPOSITORY_WORKTREES_ROOT: realpathSync(tmpdir()) })
const send = fixture.link.sendService
const frames = { conversation: 0, repository: 0, source: 0 }
fixture.link.sendService = frame => { frames[frame.service] = (frames[frame.service] ?? 0) + 1; send(frame) }
const { conversation, repository, source } = fixture.owners()
setConversationOwner(conversation)
setRepositoryOwner(repository)
setSourceOwner(source)
// The suite decides when the process ends; the fixture never holds it open.
fixture.child.unref()
for (const stream of [fixture.child.stdin, fixture.child.stdout, fixture.child.stderr]) stream.unref?.()
process.on('exit', () => {
  console.log(`CONVERSATION-PARITY frames=${frames.conversation} repository=${frames.repository} source=${frames.source}`)
  try { fixture.child.kill('SIGKILL') } catch {}
})
