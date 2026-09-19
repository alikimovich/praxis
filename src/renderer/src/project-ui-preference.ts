export const PROJECT_UI_KEY = 'praxis:project-ui:v1'
export function readProjectUiPreference(): boolean {
  try {
    return localStorage.getItem(PROJECT_UI_KEY) === 'true'
  } catch {
    return false
  }
}
export function writeProjectUiPreference(enabled: boolean): void {
  localStorage.setItem(PROJECT_UI_KEY, String(enabled))
}
