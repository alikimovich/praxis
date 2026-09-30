import type { ModelChoice, ProviderConnection, ProviderLoginReport } from '../shared/api'
import type { NativeSheetAction, NativeSheetField, NativeSheetSection, NativeSheetState } from '../shared/native-sheet'
import { parsePreferredModelState, preferredSelectValue, setFixedPreference, settingsFromChoice, setLastUsedMode } from '../shared/preferred-model'
import { loginSummary } from './chat-login'
import type { NativePreferences } from './preferences'
import type { NativeSheetController } from './sheets-runtime'
const ids = (text: string) => [...new Set(text.split(/[\s,]+/).filter(Boolean))]
const origin = (url: string) => { try { return new URL(url).origin } catch { return null } }
/** Remembers the last selected Settings section. The settings keys themselves are unchanged. */
export const SETTINGS_SECTION_KEY = 'trezi:settings-section:v1'
const PROVIDERS = 'Claude and Codex use your existing sign-ins. Add another provider to use its models in chats.'
const sections = (): NativeSheetSection[] => [
  { id: 'general', label: 'General', symbol: 'gearshape', detail: 'Changes save automatically.' },
  { id: 'providers', label: 'AI Providers', symbol: 'sparkles', detail: PROVIDERS },
  { id: 'experimental', label: 'Experimental', symbol: 'testtube.2', detail: 'Changes save automatically. UI generation options apply to your next message.' }
]
const defaultChoices = (choices: ModelChoice[]) => [{ value: 'last-used', label: 'Use last selected model' }, ...choices.map(c => ({ value: c.value, label: `${c.group} · ${c.label}` }))]
/** The AI Providers pane: its fields are drafts, submitted only by the pane's own actions. */
interface Pane { detail: string; fields: Omit<NativeSheetField, 'section' | 'draft'>[]; actions: NativeSheetState['actions'] }
export class NativeSettingsController {
  private choices: ModelChoice[] = []
  private connections: ProviderConnection[] = []
  /** The provider the editor or the remove confirmation is about. */
  private target?: ProviderConnection
  constructor(readonly sheets: NativeSheetController, readonly preferences: NativePreferences, readonly notify: () => void) {}
  private get invoke() { return this.sheets.invoke }
  /** One Settings window: General, AI Providers and Experimental in a sidebar. Autosaved. */
  async open() {
    const generation = this.sheets.generation
    const [choices, connections]: [ModelChoice[], ProviderConnection[]] = await Promise.all([this.invoke('providers:choices'), this.invoke('providers:list')])
    if (generation !== this.sheets.generation) return
    this.choices = choices; this.connections = connections; this.target = undefined
    let raw: unknown
    try { raw = JSON.parse(this.preferences.get('trezi:preferred-model') ?? 'null') } catch {}
    const preferred = parsePreferredModelState(raw)
    const all = sections(), saved = this.preferences.get(SETTINGS_SECTION_KEY)
    const providers = this.list()
    this.sheets.present({
      title: 'Settings', detail: '', sections: all, section: all.find(s => s.id === saved)?.id ?? 'general',
      fields: [
        { id: 'default', section: 'general', label: 'Default model', help: 'New chats start with this model.', kind: 'choice', value: preferredSelectValue(preferred), choices: defaultChoices(choices) },
        { id: 'projectUi', section: 'experimental', label: 'Gen UI', help: 'Generate UI using your project’s existing components and styles. Experimental; supports React and Svelte.', kind: 'choice', value: this.preferences.get('trezi:project-ui:v1') ?? 'false', choices: [{ value: 'false', label: 'Off' }, { value: 'true', label: 'On' }] },
        { id: 'engine', section: 'experimental', label: 'UI layout method', help: 'Chat model uses your selected chat model to arrange components. Jev uses a separate layout model and requires an AI Gateway API key.', visibleWhen: { field: 'projectUi', value: 'true' }, kind: 'choice', value: this.preferences.get('trezi:project-ui-engine:v1') ?? 'agent', choices: [{ value: 'agent', label: 'Chat model' }, { value: 'jev', label: 'Jev layout engine' }] },
        ...providers.fields.map(field => ({ ...field, section: 'providers', draft: true }))
      ],
      autosave: true, actions: providers.actions
    }, action => this.handle(action), section => { void this.preferences.set(SETTINGS_SECTION_KEY, section).catch(() => {}) })
  }
  private async handle(action: NativeSheetAction) {
    if (action.action === 'save') return this.save(action)
    if (action.action === 'back') return this.reload(action.id)
    if (action.action === 'add') { this.target = undefined; this.show(action.id, this.editor()); return }
    if (action.action === 'edit' || action.action === 'delete') {
      const connection = this.connections.find(c => c.id === action.values.connection)
      if (!connection) throw new Error('Choose a provider first.')
      this.target = connection
      this.show(action.id, action.action === 'edit' ? this.editor(connection) : this.removal(connection))
      return
    }
    if (action.action === 'remove') {
      if (this.target) await this.invoke('providers:remove', this.target.id)
      return this.reload(action.id)
    }
    if (action.action === 'connect' || action.action === 'save-provider') return this.submit(action)
    if (action.action.startsWith('claude')) return this.claudeAction(action)
  }
  /** Claude's sign-in (LKM-119): open its pane, "Check login", save or remove the `claude setup-token` token. */
  private async claudeAction(action: NativeSheetAction) {
    if (action.action === 'claude') return this.claude(action.id)
    if (action.action === 'claude-check') {
      const report: ProviderLoginReport = await this.invoke('providers:check-login', 'claude')
      return this.claude(action.id, report)
    }
    const remove = action.action === 'claude-remove'
    const token = remove ? '' : action.values.token?.trim() ?? ''
    if (!remove && !token) throw new Error('Paste the token that claude setup-token printed.')
    const result = await this.invoke('providers:seat-token-save', token)
    if (!result.ok) throw new Error(result.error ?? 'Could not save the token.')
    return this.claude(action.id, undefined, result.hasToken ? 'Token saved. New Claude chats use it.' : 'Token removed.')
  }
  /** The token goes to the service and never comes back into a sheet. */
  private async claude(id: string, report?: ProviderLoginReport, message?: string) {
    const { hasToken }: { hasToken: boolean } = await this.invoke('providers:seat-token-status')
    this.show(id, {
      detail: 'Claude chats use the Claude CLI’s sign-in. If a chat says it is not logged in, run `claude auth login` in Terminal, or run `claude setup-token` and paste the token it prints here. The token is encrypted with your Keychain and given only to Claude chats.',
      fields: [
        { id: 'token', label: 'Subscription token', help: hasToken ? 'Saved. Paste a new token to replace it.' : 'From claude setup-token.', kind: 'secure', value: '', placeholder: hasToken ? 'Saved' : 'Paste token' },
        ...(report ? [{ id: 'report', label: loginSummary(report), kind: 'readonly' as const, value: report.detail }] : [])
      ],
      actions: [
        { id: 'back', label: 'Back', section: 'providers' }, { id: 'claude-check', label: 'Check login', section: 'providers' },
        ...(hasToken ? [{ id: 'claude-remove', label: 'Remove token', destructive: true, section: 'providers' }] : []),
        { id: 'claude-save', label: 'Save token', primary: true, section: 'providers' }
      ]
    }, message)
  }
  private async save(action: NativeSheetAction) {
    const choice = this.choices.find(c => c.value === action.values.default)
    if (action.values.default !== 'last-used' && !choice) throw new Error('Select an available model.')
    if (!['true', 'false'].includes(action.values.projectUi) || !['agent', 'jev'].includes(action.values.engine)) throw new Error('Invalid setting.')
    // One atomic batch, built from the committed state when it is sent (a chat may
    // have recorded a newer last-used model since the sheet opened). Autosave
    // keeps the draft and closing waits for this to settle.
    await this.preferences.apply(current => {
      let saved: unknown
      try { saved = JSON.parse(current['trezi:preferred-model'] ?? 'null') } catch {}
      const state = parsePreferredModelState(saved)
      return [
        ['trezi:preferred-model', JSON.stringify(choice ? setFixedPreference(state, settingsFromChoice(choice)) : setLastUsedMode(state))],
        ['trezi:project-ui:v1', action.values.projectUi],
        ['trezi:project-ui-engine:v1', action.values.engine]
      ]
    })
    this.notify()
    if (this.sheets.current) this.sheets.current.state.message = 'Settings saved.'
  }
  /** Swap the AI Providers pane in place: same window, same section, the other panes untouched. */
  private show(id: string, pane: Pane, message?: string) {
    const sheet = this.sheets.current
    if (!sheet || sheet.state.id !== id) return
    sheet.state.fields = [...sheet.state.fields.filter(f => f.section !== 'providers'), ...pane.fields.map(field => ({ ...field, section: 'providers', draft: true }))]
    sheet.state.actions = pane.actions
    const section = sheet.state.sections?.find(s => s.id === 'providers')
    if (section) section.detail = pane.detail
    sheet.state.message = message
    this.sheets.refresh()
  }
  /** Back to the provider list; new or removed providers also change the default-model choices. */
  private async reload(id: string) {
    const [choices, connections]: [ModelChoice[], ProviderConnection[]] = await Promise.all([this.invoke('providers:choices'), this.invoke('providers:list')])
    const sheet = this.sheets.current
    if (!sheet || sheet.state.id !== id) return
    this.choices = choices; this.connections = connections; this.target = undefined
    const field = sheet.state.fields.find(f => f.id === 'default')
    if (field) field.choices = defaultChoices(choices)
    this.show(id, this.list())
  }
  private list(): Pane {
    const connections = this.connections
    return {
      detail: PROVIDERS,
      fields: connections.length
        ? [{ id: 'connection', label: 'Provider', kind: 'choice', value: connections[0].id, choices: connections.map(c => ({ value: c.id, label: `${c.label} · ${c.models.length} models · ${c.hasKey ? 'API key saved' : 'No API key'}` })) }]
        : [{ id: 'connections', label: 'Added providers', kind: 'readonly', value: 'None' }],
      actions: [{ id: 'add', label: 'Add provider…', section: 'providers' }, { id: 'claude', label: 'Claude…', section: 'providers' }, ...(connections.length ? [{ id: 'edit', label: 'Edit…', section: 'providers' }, { id: 'delete', label: 'Remove…', section: 'providers' }] : [])]
    }
  }
  private removal(connection: ProviderConnection): Pane {
    return {
      detail: PROVIDERS,
      fields: [{ id: 'remove-confirm', label: `Remove ${connection.label}?`, help: 'Remove this provider and its saved API key from Trezi. Chats using it will switch to a default model.', kind: 'readonly', value: '' }],
      actions: [{ id: 'back', label: 'Back', section: 'providers' }, { id: 'remove', label: 'Remove provider', primary: true, destructive: true, section: 'providers' }]
    }
  }
  private editor(connection?: ProviderConnection): Pane {
    return {
      detail: `${connection ? `Edit ${connection.label}` : 'Add a provider'}: enter its API base URL and key, then load its models or enter model IDs below. The provider must support the Responses API.`,
      fields: [
        { id: 'label', label: 'Provider name', kind: 'text', value: connection?.label ?? 'AI Gateway', placeholder: 'Required' },
        { id: 'url', label: 'API base URL', kind: 'text', value: connection?.baseUrl ?? 'https://ai-gateway.vercel.sh/v1', placeholder: 'https://' },
        connection?.hasKey
          ? { id: 'key', label: 'API key', help: 'Leave blank to keep the current key.', kind: 'secure', value: '', placeholder: 'Saved' }
          : { id: 'key', label: 'API key', kind: 'secure', value: '', placeholder: 'Required' },
        { id: 'models', label: 'Model IDs (one per line)', kind: 'multiline', value: connection?.models.join('\n') ?? '' }
      ],
      actions: [{ id: 'back', label: 'Back', section: 'providers' }, { id: 'connect', label: 'Load models', section: 'providers' }, { id: 'save-provider', label: connection ? 'Update provider' : 'Add provider', primary: true, section: 'providers' }]
    }
  }
  private async submit(action: NativeSheetAction) {
    const connection = this.target
    const { values } = action
    const baseUrl = values.url?.trim() ?? '', apiKey = values.key?.trim() ?? ''
    const endpointOrigin = origin(baseUrl)
    if (!endpointOrigin) throw new Error('Enter the provider’s API base URL, including https://.')
    if (!apiKey && (!connection || origin(connection.baseUrl) !== endpointOrigin)) throw new Error('Enter an API key for this provider URL.')
    const key = apiKey ? { apiKey } : {}
    if (action.action === 'connect') {
      const result = await this.invoke('providers:catalog', { baseUrl, ...(connection ? { id: connection.id } : {}), ...key })
      if (!result.ok && !result.unsupported) throw new Error(result.error ?? 'Could not load models. Check the URL and API key.')
      const sheet = this.sheets.current
      if (!sheet || sheet.state.id !== action.id) return
      const field = sheet.state.fields.find(f => f.id === 'models')
      if (!field) return
      field.kind = result.unsupported ? 'multiline' : 'multichoice'
      field.label = result.unsupported ? 'Model IDs (one per line)' : 'Models for chats'
      field.choices = [...new Set<string>([...result.models, ...ids(values.models ?? '')])].map(value => ({ value, label: value }))
      sheet.state.message = result.unsupported ? 'This provider does not list its models. Enter their IDs, one per line.' : 'Choose the models you want to use in chats, then save this provider.'
      return
    }
    const models = ids(values.models ?? '')
    if (!values.label?.trim() || !models.length) throw new Error('Enter a provider name and choose or enter at least one model.')
    const result = await this.invoke('providers:save', {
      ...(connection ? { id: connection.id } : {}), label: values.label.trim(), baseUrl,
      preset: endpointOrigin === 'https://ai-gateway.vercel.sh' ? 'gateway' : 'custom',
      wireApi: 'responses', models, ...key
    })
    if (!result.ok) throw new Error(result.error ?? 'Could not save this provider.')
    await this.reload(action.id)
  }
}
