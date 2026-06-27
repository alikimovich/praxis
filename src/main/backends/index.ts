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
 */
export function pickProvider(options: AgentOptions): ModelProvider {
  switch (options.provider) {
    case 'codex':
      return codexProvider
    case 'gemini':
      return geminiProvider
    case 'claude':
    case undefined:
    default:
      return claudeProvider
  }
}
