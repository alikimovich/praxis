import type { AgentOptions } from '../../shared/api'
import type { ModelProvider } from './types'
import { claudeProvider } from './claude'
import { codexProvider } from './codex'
import { geminiProvider } from './gemini'
import { helperProvider } from './helper-session'
import { withSkillMenu } from './skill-menu'

const codexWithSkills = withSkillMenu(codexProvider)
const geminiWithSkills = withSkillMenu(geminiProvider)

/** In-process adapters (legacy launch and unit tests without a helper command). */
function inProcessProvider(options: AgentOptions): ModelProvider {
  if (options.connectionId) return codexWithSkills
  switch (options.provider) {
    case 'codex':
      return codexWithSkills
    case 'gemini':
      return geminiEnabled() ? geminiWithSkills : claudeProvider
    case 'claude':
    case undefined:
    default:
      return claudeProvider
  }
}

/** Supervised helpers (default Swift launch): adapters run in a provider helper process. */
function supervisedProvider(options: AgentOptions): ModelProvider {
  if (options.connectionId) return helperProvider('codex')
  switch (options.provider) {
    case 'codex':
      return helperProvider('codex')
    case 'gemini':
      return geminiEnabled() ? helperProvider('gemini') : helperProvider('claude')
    case 'claude':
    case undefined:
    default:
      return helperProvider('claude')
  }
}

export type { ModelProvider, ProviderSession, PendingPrompt } from './types'

/**
 * Pick the backend for a session from `options.provider` (the renderer sets it;
 * default = Claude). A backend is reachable only when the renderer explicitly
 * selects it, so the default runtime is byte-identical to pre-v7.
 *
 * HARNESS AND ENDPOINT ARE ORTHOGONAL (v10). `provider` names the HARNESS — who runs
 * the agent loop — while `connectionId` names an ENDPOINT the user added (an
 * OpenAI-compatible host: Vercel AI Gateway, Groq, a custom deployment) that supplies
 * the base URL, the key and the model. Only the Codex harness can drive such an
 * endpoint today, so a set `connectionId` routes to Codex **regardless of what
 * `provider` says** — the model picker builds its entries from `ModelChoice`, and an
 * entry carrying a `connectionId` is by construction a Codex-harness entry, but a
 * stale renderer state or a resumed session could still pair one with `provider:
 * 'claude'`. Routing to Claude there would run the turn on the Claude subscription
 * and silently ignore the endpoint the user picked.
 *
 * Auth follows the same split: the two built-in seats log in with the user's own
 * subscription (Claude `setup-token`, Codex "sign in with ChatGPT"), while a
 * connection uses the user's own API key — encrypted at rest with safeStorage and
 * confined to main. No key is ever committed in-repo.
 *
 * Gemini is EXPERIMENTAL and UNWIRED: unlike Claude/Codex it has NO SDK in
 * package.json (it shells out to an external `gemini` CLI that most installs
 * lack), so selecting it by default is a runtime trap. It is therefore gated
 * behind an explicit opt-in — set TREZI_EXPERIMENTAL_GEMINI=1 (or `true`) to
 * enable `provider: 'gemini'`. Without the flag a 'gemini' request falls back to
 * Claude, exactly like an unknown provider. Claude and Codex are unaffected.
 */
function geminiEnabled(): boolean {
  const v = process.env.TREZI_EXPERIMENTAL_GEMINI
  return v === '1' || v === 'true'
}

export function pickProvider(options: AgentOptions): ModelProvider {
  // Inside a helper subprocess: run the real adapter in-process for that helper only.
  if (process.env.TREZI_PROVIDER_HELPER === '1') return inProcessProvider(options)
  // Swift-supervised Bun: built-in seats run in provider helpers, not in the app backend.
  if (process.env.TREZI_SERVICE_SUPERVISED === '1') return supervisedProvider(options)
  return inProcessProvider(options)
}
