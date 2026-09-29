// Preload for the suite runs in test/editing-owner.mjs: installs the real Swift editing
// owner with the repository and source owners it works with (fixture binary
// EDITING_FIXTURE, profile EDITING_PROFILE) before a legacy island/controls/content
// suite runs, so the suite's own assertions exercise Swift island decisions, sidecar
// commits and source proposals through the unchanged TS entry points.
import { realpathSync } from 'node:fs'
import { setEditingOwner } from '../../src/main/editing-owner.ts'
import { setRepositoryOwner } from '../../src/main/repository-owner.ts'
import { setSourceOwner } from '../../src/main/source-owner.ts'
import { startEditingFixture } from './editing-fixture.mjs'

const fixture = await startEditingFixture(process.env.EDITING_FIXTURE, realpathSync(process.env.EDITING_PROFILE))
const send = fixture.link.sendService
let frames = 0
fixture.link.sendService = frame => { if (frame.service === 'editing') frames++; send(frame) }
const { repository, source, editing } = fixture.owners()
setRepositoryOwner(repository)
setSourceOwner(source)
setEditingOwner(editing)
// The suite decides when the process ends; the fixture never holds it open.
fixture.child.unref()
for (const stream of [fixture.child.stdin, fixture.child.stdout, fixture.child.stderr]) stream.unref?.()
process.on('exit', () => {
  console.log(`EDITING-PARITY editing=${frames}`)
  try { fixture.child.kill('SIGKILL') } catch {}
})
