import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverProviderSkills, withSkillReferences, withSkillMenu } from '../src/main/backends/skill-menu.ts'

const base = mkdtempSync(join(tmpdir(), 'praxis-provider-skills-'))
const root = join(base, 'project')
const home = join(base, 'home')
function skill(dir, name, description) {
  const folder = join(dir, name)
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\nFollow this skill.`)
  return folder
}
try {
  skill(join(root, '.claude/skills'), 'design', 'Project design')
  skill(join(home, '.claude/skills'), 'design', 'User design')
  skill(join(home, '.agents/skills'), 'shared', 'Shared skill')
  skill(join(home, '.codex/skills/.system'), 'builtin', 'Built in')
  skill(join(root, '.gemini/skills'), 'gemini-only', 'Gemini skill')
  const target = skill(join(base, 'external'), 'linked', 'Linked skill')
  mkdirSync(join(root, '.agents/skills'), { recursive: true })
  symlinkSync(target, join(root, '.agents/skills/linked'))
  symlinkSync(join(root, '.agents/skills'), join(root, '.agents/skills/cycle'))
  symlinkSync(join(base, 'missing'), join(root, '.agents/skills/broken'))
  const skills = await discoverProviderSkills(root, 'codex', home, join(home, '.codex'))
  assert.deepEqual(skills.map(s => s.name).sort(), ['animation-controls', 'builtin', 'design', 'linked', 'shared', 'surface-controls'])
  assert.equal(skills.find(s => s.name === 'design').description, 'Project design')
  assert.equal(skills.find(s => s.name === 'shared').source, 'other')
  assert((await discoverProviderSkills(root, 'gemini', home)).some(s => s.name === 'gemini-only'))
  const bundled = skills.find(s => s.name === 'animation-controls')
  assert(bundled.path.endsWith('agent-plugin/skills/animation-controls/SKILL.md'))
  assert(withSkillReferences('/animation-controls tune motion', skills).includes(JSON.stringify(bundled.path)))
  skill(join(root, '.agents/skills'), 'animation-controls', 'Project override')
  const overridden = await discoverProviderSkills(root, 'codex', home, join(home, '.codex'))
  assert.equal(overridden.filter(s => s.name === 'animation-controls').length, 1)
  assert.equal(overridden.find(s => s.name === 'animation-controls').description, 'Project override')
  const prompt = withSkillReferences('Please use /design and /shared', skills)
  assert(prompt.includes(JSON.stringify(join(root, '.claude/skills/design/SKILL.md'))))
  assert(prompt.includes(JSON.stringify(join(home, '.agents/skills/shared/SKILL.md'))))
  assert.equal(withSkillReferences('https://example.com/design /unknown', skills), 'https://example.com/design /unknown')
  assert.equal(withSkillReferences('/designer', skills), '/designer')
  const events = []
  const sent = []
  const wrapped = withSkillMenu({ id: 'codex', startSession: async () => ({ emit: e => events.push(e), send: (...args) => sent.push(args) }) })
  const session = await wrapped.startSession(join(base, 'isolated-worktree'), {}, () => null, { liveRoot: root })
  assert(events[0].commands.some(s => s.name === 'design'))
  assert(events[0].commands.every(s => !('path' in s)))
  const images = [{ data: 'example' }]
  session.send('/design make it simpler', images)
  assert(sent[0][0].includes('Read each SKILL.md'))
  assert.equal(sent[0][1], images)
  console.log('PROVIDER-SKILLS OK — discovery, precedence, symlinks, invocation, eager session menu')
} finally {
  rmSync(base, { recursive: true, force: true })
}
