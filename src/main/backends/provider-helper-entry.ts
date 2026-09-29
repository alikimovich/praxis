/**
 * Provider helper process entry (S10/S15): runs one built-in adapter in a supervised
 * helper speaking the helper protocol (`helper-host.ts`). The Swift owner spawns this
 * with stdio only and a scrubbed environment (`ProviderHelper.swift`).
 */
import { claudeProvider } from './claude'
import { codexProvider } from './codex'
import { geminiProvider } from './gemini'
import { runProviderHelper } from './helper-host'
import { withSkillMenu } from './skill-menu'

runProviderHelper({
  claude: claudeProvider,
  codex: withSkillMenu(codexProvider),
  gemini: withSkillMenu(geminiProvider)
})
