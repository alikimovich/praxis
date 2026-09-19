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

export const PROJECT_UI_ENGINE_KEY = 'praxis:project-ui-engine:v1'
export function readProjectUiEngine(): 'agent' | 'jev' {
  try {
    return localStorage.getItem(PROJECT_UI_ENGINE_KEY) === 'jev' ? 'jev' : 'agent'
  } catch {
    return 'agent'
  }
}
export function writeProjectUiEngine(engine: 'agent' | 'jev'): void {
  localStorage.setItem(PROJECT_UI_ENGINE_KEY, engine)
}
