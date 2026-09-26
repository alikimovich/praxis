import type { ModelChoice, ProviderConnection } from '../shared/api'
import { parsePreferredModelState, preferredSelectValue, setFixedPreference, settingsFromChoice, setLastUsedMode } from '../shared/preferred-model'
import type { nativePreferences } from './preferences'
import type { NativeSheetController } from './sheets-runtime'
const ids = (text: string) => [...new Set(text.split(/[\s,]+/).filter(Boolean))]
const origin = (url: string) => { try { return new URL(url).origin } catch { return null } }
export class NativeSettingsController {
  constructor(readonly sheets: NativeSheetController, readonly preferences: ReturnType<typeof nativePreferences>, readonly notify: () => void) {}
  private get invoke() { return this.sheets.invoke }
  async open() {
    const generation = this.sheets.generation
    const choices: ModelChoice[] = await this.invoke('providers:choices')
    if (generation !== this.sheets.generation) return
    let raw: unknown
    try { raw = JSON.parse(this.preferences.get('praxis:preferred-model') ?? 'null') } catch {}
    const preferred = parsePreferredModelState(raw)
    this.sheets.present({
      title: 'Settings', detail: 'Changes save automatically. The default model applies to new chats; UI generation options apply to your next message.',
      fields: [
        { id: 'default', label: 'Default model', kind: 'choice', value: preferredSelectValue(preferred), choices: [{ value: 'last-used', label: 'Use last selected model' }, ...choices.map(c => ({ value: c.value, label: c.group + ' · ' + c.label }))] },
        { id: 'projectUi', label: 'Build UI from project components', kind: 'choice', value: this.preferences.get('praxis:project-ui:v1') ?? 'false', choices: [{ value: 'false', label: 'Off' }, { value: 'true', label: 'On' }] },
        { id: 'engine', label: 'UI layout method', kind: 'choice', value: this.preferences.get('praxis:project-ui-engine:v1') ?? 'agent', choices: [{ value: 'agent', label: 'Chat model' }, { value: 'jev', label: 'Jev layout engine' }] }
      ],
      autosave: true, actions: [{ id: 'connections', label: 'AI providers…' }]
    }, async action => {
      if (action.action === 'connections') { await this.connections(); return }
      const choice = choices.find(c => c.value === action.values.default)
      if (action.values.default !== 'last-used' && !choice) throw new Error('Select an available model.')
      if (!['true', 'false'].includes(action.values.projectUi) || !['agent', 'jev'].includes(action.values.engine)) throw new Error('Invalid setting.')
      this.preferences.set('praxis:preferred-model', JSON.stringify(choice ? setFixedPreference(preferred, settingsFromChoice(choice)) : setLastUsedMode(preferred)))
      this.preferences.set('praxis:project-ui:v1', action.values.projectUi)
      this.preferences.set('praxis:project-ui-engine:v1', action.values.engine)
      this.notify()
      if (this.sheets.current) this.sheets.current.state.message = 'Settings saved.'
    })
  }
  async connections() {
    const generation = this.sheets.generation
    const connections: ProviderConnection[] = await this.invoke('providers:list')
    if (generation !== this.sheets.generation) return
    this.sheets.present({
      title: 'AI providers',
      detail: 'Claude and Codex use your existing sign-ins. Add another provider to use its models in chats.',
      fields: connections.length ? [{ id: 'connection', label: 'Provider', kind: 'choice', value: connections[0].id, choices: connections.map(c => ({ value: c.id, label: c.label + ' · ' + c.models.length + ' models · ' + (c.hasKey ? 'API key saved' : 'No API key') })) }] : [],
      actions: [{ id: 'back', label: 'Back' }, { id: 'add', label: 'Add provider…', primary: true }, ...(connections.length ? [{ id: 'edit', label: 'Edit…' }, { id: 'delete', label: 'Remove…' }] : [])]
    }, async action => {
      if (action.action === 'back') { await this.open(); return }
      if (action.action === 'add') { this.edit(); return }
      const connection = connections.find(c => c.id === action.values.connection)
      if (!connection) throw new Error('Choose a provider first.')
      if (action.action === 'edit') this.edit(connection)
      else this.sheets.present({
        title: 'Remove ' + connection.label + '?', detail: 'Remove this provider and its saved API key from Praxis. Chats using it will switch to a default model.',
        fields: [], actions: [{ id: 'back', label: 'Back' }, { id: 'delete', label: 'Remove provider', primary: true, destructive: true }]
      }, async action => {
        if (action.action === 'delete') await this.invoke('providers:remove', connection.id)
        if (this.sheets.current?.state.id === action.id) await this.connections()
      })
    })
  }
  edit(connection?: ProviderConnection) {
    this.sheets.present({
      title: connection ? 'Edit ' + connection.label : 'Add provider',
      detail: 'Enter a provider URL and API key, then load its models or enter model IDs below. The provider must support the Responses API.',
      fields: [
        { id: 'label', label: 'Provider name', kind: 'text', value: connection?.label ?? 'AI Gateway' },
        { id: 'url', label: 'API base URL', kind: 'text', value: connection?.baseUrl ?? 'https://ai-gateway.vercel.sh/v1' },
        { id: 'key', label: connection?.hasKey ? 'API key (leave blank to keep the current key)' : 'API key', kind: 'secure', value: '' },
        { id: 'models', label: 'Model IDs (one per line)', kind: 'multiline', value: connection?.models.join('\n') ?? '' }
      ],
      actions: [{ id: 'back', label: 'Back' }, { id: 'connect', label: 'Load models' }, { id: 'save', label: connection ? 'Update provider' : 'Add provider', primary: true }]
    }, async action => {
      if (action.action === 'back') { await this.connections(); return }
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
        const field = sheet.state.fields.find(f => f.id === 'models')!
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
      if (this.sheets.current?.state.id === action.id) await this.connections()
    })
  }
}
