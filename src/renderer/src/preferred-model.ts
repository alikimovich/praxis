import { preferenceStorage } from './preference-storage'
import type { ChatAgentSettings } from '../../shared/chat-settings'
import { PREFERRED_MODEL_KEY, parsePreferredModelState, resolvePreferredSettings, rememberLastUsed, type PreferredModelState } from '../../shared/preferred-model'
export * from '../../shared/preferred-model'
const readRaw = (): unknown => {
  try {
    const raw = preferenceStorage.getItem(PREFERRED_MODEL_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const writeState = (state: PreferredModelState): void => {
  try {
    preferenceStorage.setItem(PREFERRED_MODEL_KEY, JSON.stringify(state))
  } catch {
    /* private mode / no storage */
  }
}

export const readPreferredModelState = (): PreferredModelState =>
  parsePreferredModelState(readRaw())

export const preferredChatAgentSettings = (): ChatAgentSettings =>
  resolvePreferredSettings(readPreferredModelState())

export const writePreferredModelState = (state: PreferredModelState): void => {
  writeState(parsePreferredModelState(state))
}

/** Record a picker change as last-used (does not change a 'fixed' mode). */
export const recordLastUsedSettings = (used: ChatAgentSettings): void => {
  writeState(rememberLastUsed(readPreferredModelState(), used))
}
