import type { AgentOptions } from '../../shared/api'
import type { ModelProvider } from './types'
import { claudeProvider } from './claude'
import { codexProvider } from './codex'
import { geminiProvider } from './gemini'

export type { ModelProvider, ProviderSession, PendingPrompt } from './types'

/**
 * Pick the backend for a session from `options.provider` (the renderer sets it;
 * default = Claude). All backends authenticate with the user's own subscription
 * login. Non-Claude providers are reachable only when the renderer explicitly
 * selects them, so the default runtime is byte-identical to pre-v7.
 *
 * Gemini is EXPERIMENTAL and UNWIRED: unlike Claude/Codex it has NO SDK in
 * package.json (it shells out to an external `gemini` CLI that most installs
 * lack), so selecting it by default is a runtime trap. It is therefore gated
 * behind an explicit opt-in — set DSGN_EXPERIMENTAL_GEMINI=1 (or `true`) to
 * enable `provider: 'gemini'`. Without the flag a 'gemini' request falls back to
 * Claude, exactly like an unknown provider. Claude and Codex are unaffected.
 */
function geminiEnabled(): boolean {
  const v = process.env.DSGN_EXPERIMENTAL_GEMINI
  return v === '1' || v === 'true'
}

export function pickProvider(options: AgentOptions): ModelProvider {
  switch (options.provider) {
    case 'codex':
      return codexProvider
    case 'gemini':
      return geminiEnabled() ? geminiProvider : claudeProvider
    case 'claude':
    case undefined:
    default:
      return claudeProvider
  }
}
