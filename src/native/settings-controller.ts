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
      title: 'Settings', detail: 'Default choices for new chats. Existing chats retain their own model and permissions.',
      fields: [
        { id: 'default', label: 'Default model', kind: 'choice', value: preferredSelectValue(preferred), choices: [{ value: 'last-used', label: 'Last used model' }, ...choices.map(c => ({ value: c.value, label: c.group + ' · ' + c.label }))] },
        { id: 'projectUi', label: 'Project UI', kind: 'choice', value: this.preferences.get('praxis:project-ui:v1') ?? 'false', choices: [{ value: 'false', label: 'Off' }, { value: 'true', label: 'On' }] },
        { id: 'engine', label: 'Project UI engine', kind: 'choice', value: this.preferences.get('praxis:project-ui-engine:v1') ?? 'agent', choices: [{ value: 'agent', label: 'Agent' }, { value: 'jev', label: 'Jev' }] }
      ],
      actions: [{ id: 'cancel', label: 'Close' }, { id: 'connections', label: 'Connections…' }, { id: 'save', label: 'Save', primary: true }]
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
      title: 'Provider connections',
      detail: 'Claude and Codex subscriptions are built in. Add an endpoint to use its models through Codex.',
      fields: connections.length ? [{ id: 'connection', label: 'Connection', kind: 'choice', value: connections[0].id, choices: connections.map(c => ({ value: c.id, label: c.label + ' · ' + c.models.length + ' models · ' + (c.hasKey ? 'key saved' : 'no key') })) }] : [],
      actions: [{ id: 'back', label: 'Back' }, { id: 'add', label: 'Add…', primary: true }, ...(connections.length ? [{ id: 'edit', label: 'Edit…' }, { id: 'delete', label: 'Delete…' }] : [])]
    }, async action => {
      if (action.action === 'back') { await this.open(); return }
      if (action.action === 'add') { this.edit(); return }
      const connection = connections.find(c => c.id === action.values.connection)
      if (!connection) throw new Error('Select a connection.')
      if (action.action === 'edit') this.edit(connection)
      else this.sheets.present({
        title: 'Delete ' + connection.label + '?', detail: 'This removes the saved endpoint and its API key. Chats using its models fall back to their default.',
        fields: [], actions: [{ id: 'back', label: 'Back' }, { id: 'delete', label: 'Delete', primary: true, destructive: true }]
      }, async action => {
        if (action.action === 'delete') await this.invoke('providers:remove', connection.id)
        if (this.sheets.current?.state.id === action.id) await this.connections()
      })
    })
  }
  edit(connection?: ProviderConnection) {
    this.sheets.present({
      title: connection ? 'Edit ' + connection.label : 'Add provider',
      detail: 'Use an endpoint supporting the Responses API. Connect loads its model catalog. Enter model IDs manually if it does not provide a catalog.',
      fields: [
        { id: 'label', label: 'Name', kind: 'text', value: connection?.label ?? 'AI Gateway' },
        { id: 'url', label: 'Base URL', kind: 'text', value: connection?.baseUrl ?? 'https://ai-gateway.vercel.sh/v1' },
        { id: 'key', label: connection?.hasKey ? 'API key (leave blank to keep saved key)' : 'API key', kind: 'secure', value: '' },
        { id: 'models', label: 'Models', kind: 'multiline', value: connection?.models.join('\n') ?? '' }
      ],
      actions: [{ id: 'back', label: 'Back' }, { id: 'connect', label: 'Connect' }, { id: 'save', label: 'Save', primary: true }]
    }, async action => {
      if (action.action === 'back') { await this.connections(); return }
      const { values } = action
      const baseUrl = values.url?.trim() ?? '', apiKey = values.key?.trim() ?? ''
      const endpointOrigin = origin(baseUrl)
      if (!endpointOrigin) throw new Error('Enter a valid base URL.')
      if (!apiKey && (!connection || origin(connection.baseUrl) !== endpointOrigin)) throw new Error('Enter an API key for this endpoint.')
      const key = apiKey ? { apiKey } : {}
      if (action.action === 'connect') {
        const result = await this.invoke('providers:catalog', { baseUrl, ...(connection ? { id: connection.id } : {}), ...key })
        if (!result.ok && !result.unsupported) throw new Error(result.error ?? 'Could not connect.')
        const sheet = this.sheets.current
        if (!sheet || sheet.state.id !== action.id) return
        const field = sheet.state.fields.find(f => f.id === 'models')!
        field.kind = result.unsupported ? 'multiline' : 'multichoice'
        field.choices = [...new Set<string>([...result.models, ...ids(values.models ?? '')])].map(value => ({ value, label: value }))
        sheet.state.message = result.unsupported ? 'No model catalog is available. Enter model IDs manually.' : 'Connected. Select the models to offer in your chats.'
        return
      }
      const models = ids(values.models ?? '')
      if (!values.label?.trim() || !models.length) throw new Error('Enter a name and select at least one model.')
      const result = await this.invoke('providers:save', {
        ...(connection ? { id: connection.id } : {}), label: values.label.trim(), baseUrl,
        preset: endpointOrigin === 'https://ai-gateway.vercel.sh' ? 'gateway' : 'custom',
        wireApi: 'responses', models, ...key
      })
      if (!result.ok) throw new Error(result.error ?? 'Could not save connection.')
      if (this.sheets.current?.state.id === action.id) await this.connections()
    })
  }
}
