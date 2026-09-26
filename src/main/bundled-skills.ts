import { join } from 'node:path'
import { type DiscoveredSkill, discoverSkillsInDirectory } from './skills'

// Both src/main (unit tests) and out/native are two levels deep.
export const BUNDLED_SKILLS_DIR = join(__dirname, '../../agent-plugin/skills')

export const SURFACE_CONTROLS_SKILL = join(BUNDLED_SKILLS_DIR, 'surface-controls/SKILL.md')

/** Only portable skills: other bundled skills require Claude-only preview tools. */
export async function discoverPortableSkills(): Promise<DiscoveredSkill[]> {
  return (await discoverSkillsInDirectory(BUNDLED_SKILLS_DIR, 'other')).filter(
    (skill) => skill.name === 'surface-controls'
  )
}
