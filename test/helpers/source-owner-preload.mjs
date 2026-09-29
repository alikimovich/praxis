// Preload for the parity runs in test/source-owner.mjs: installs the real Swift source
// owner and the repository owner whose lanes serialize it (fixture binary
// SOURCE_FIXTURE, profile SOURCE_PROFILE) before a legacy source-editing suite runs,
// so the suite's own assertions exercise Swift commits, Undo and file operations
// through the unchanged TS entry points. Prints how many source frames it sent.
import { realpathSync } from 'node:fs'
import { setRepositoryOwner } from '../../src/main/repository-owner.ts'
import { setSourceOwner } from '../../src/main/source-owner.ts'
import { startSourceFixture } from './source-fixture.mjs'

const fixture = await startSourceFixture(process.env.SOURCE_FIXTURE, realpathSync(process.env.SOURCE_PROFILE))
const send = fixture.link.sendService
let frames = 0
fixture.link.sendService = frame => { if (frame.service === 'source') frames++; send(frame) }
const { repository, source } = fixture.owners()
setRepositoryOwner(repository)
setSourceOwner(source)
// The suite decides when the process ends; the fixture never holds it open.
fixture.child.unref()
for (const stream of [fixture.child.stdin, fixture.child.stdout, fixture.child.stderr]) stream.unref?.()
process.on('exit', () => {
  console.log(`SOURCE-PARITY frames=${frames}`)
  try { fixture.child.kill('SIGKILL') } catch {}
})
