// Preload for the parity runs in test/repository-owner.mjs: installs the real Swift
// repository owner (fixture binary REPOSITORY_FIXTURE, profile REPOSITORY_PROFILE)
// before a legacy Git suite runs, so the suite's own assertions exercise the Swift
// effects through the unchanged TS entry points. Worktrees may live anywhere under
// the temp dir there. Prints how many repository frames the suite sent.
import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { setRepositoryOwner } from '../../src/main/repository-owner.ts'
import { startRepositoryFixture } from './repository-fixture.mjs'

const fixture = await startRepositoryFixture(process.env.REPOSITORY_FIXTURE, realpathSync(process.env.REPOSITORY_PROFILE),
  { REPOSITORY_WORKTREES_ROOT: realpathSync(tmpdir()) })
const send = fixture.link.sendService
let frames = 0
fixture.link.sendService = frame => { frames++; send(frame) }
setRepositoryOwner(fixture.owner())
// The suite decides when the process ends; the fixture never holds it open.
fixture.child.unref()
for (const stream of [fixture.child.stdin, fixture.child.stdout, fixture.child.stderr]) stream.unref?.()
process.on('exit', () => {
  console.log(`REPOSITORY-PARITY frames=${frames}`)
  try { fixture.child.kill('SIGKILL') } catch {}
})
