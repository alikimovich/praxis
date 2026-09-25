export interface NativePreferencesBridge {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}
declare global {
  interface Window { praxisNativePreferences?: NativePreferencesBridge }
}
