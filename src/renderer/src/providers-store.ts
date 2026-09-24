import { create } from 'zustand'
import type { ModelChoice, ProviderConnection } from '../../shared/api'

/**
 * v10 user-added model endpoints, renderer side. Kept OUT of `store.ts` (already
 * oversized — see docs/TASKS.md) because it's a self-contained slice: the saved
 * connections, the flat `ModelChoice[]` the chat's model picker renders, and the
 * Settings dialog's open flag (the same single-global-flag pattern as
 * `useFeedback`/`useGithub`, so the app menu, the picker's "Manage providers…"
 * row and anything else can raise the one dialog App renders).
 *
 * Nothing here ever holds an API key: main only ever hands back `hasKey`, and the
 * dialog keeps a typed key in component state for exactly as long as the form is
 * open. `choices` is built in MAIN (built-in seats first, then one group per
 * connection) so the renderer never hardcodes a model list.
 */
interface ProvidersState {
  connections: ProviderConnection[]
  /** Everything the chat's model picker offers, in main's order (groups are runs). */
  choices: ModelChoice[]
  /** True once a refresh has completed at least once (drives the picker's fallback). */
  loaded: boolean
  loading: boolean
  /** The one Settings dialog (Cmd+, / the picker's "Manage providers…" row). */
  settingsOpen: boolean
  setSettingsOpen: (settingsOpen: boolean) => void
  /**
   * Re-read both lists from main. Called after every save/remove so the picker
   * updates immediately. Best-effort: an IPC failure leaves the previous lists in
   * place rather than blanking the picker mid-session.
   */
  refresh: () => Promise<void>
  /** Fetch once, lazily — safe to call from every mount. */
  ensureLoaded: () => void
}

export const useProviders = create<ProvidersState>((set, get) => ({
  connections: [],
  choices: [],
  loaded: false,
  loading: false,
  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  refresh: async () => {
    set({ loading: true })
    try {
      const [connections, choices] = await Promise.all([
        window.api.providers.list(),
        window.api.providers.choices()
      ])
      set({ connections, choices, loaded: true })
    } catch {
      // Keep whatever we had; the picker falls back to echoing the current value.
    } finally {
      set({ loading: false })
    }
  },
  ensureLoaded: () => {
    const s = get()
    if (s.loaded || s.loading) return
    void s.refresh()
  }
}))

export * from '../../shared/provider-choices'

// Exposed for the Playwright test harness (and handy for live debugging).
;(window as unknown as { __praxisProviders?: typeof useProviders }).__praxisProviders = useProviders
