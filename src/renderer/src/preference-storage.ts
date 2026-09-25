import '../../shared/native-preferences'
/** Workspace has its own native store; this adapter migrates UI preferences. */
export const preferenceStorage = {
  getItem: (key: string) => key === 'praxis:workspace' ? window.localStorage.getItem(key) : (window.praxisNativePreferences ?? window.localStorage).getItem(key),
  setItem: (key: string, value: string) => {
    if (window.praxisNativePreferences && key === 'praxis:workspace') return
    ;(window.praxisNativePreferences ?? window.localStorage).setItem(key, value)
  },
  removeItem: (key: string) => (window.praxisNativePreferences ?? window.localStorage).removeItem(key)
}
