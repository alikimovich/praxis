import type { SelectedElement, PropInspection, ResolvedControlPanel, TokenSet, StyleReadResult } from '../shared/api'
import type { NativeInspectorState, NativeInspectorField, NativeInspectorAction } from '../shared/native-inspector'
import { STYLE_PROP_META, numericValue, toCssText } from '../shared/css-values'
import { tokensForProp } from '../shared/token-match'
import { controlsPrompt, animationControlsPrompt } from '../shared/controls-prompt'
type Binding = { apply(value: string): Promise<any>; preview?(value: string): Promise<any>; reset?(): Promise<any>; token?(value: string): Promise<any> }
export class NativeInspectorController {
  readonly state: NativeInspectorState = { root: '', generation: 0, visible: false, title: 'Inspector', tab: 'styles', fields: [], actions: [], error: '', busy: false }
  element: SelectedElement | null = null
  inspection: PropInspection | null = null
  controls: ResolvedControlPanel[] = []
  tokens: TokenSet | null = null
  styles: StyleReadResult | null = null
  readonly bindings = new Map<string, Binding>()
  private sequence = 0
  private operation: Promise<void> = Promise.resolve()
  constructor(readonly invoke: (channel: string, ...args: any[]) => Promise<any>, readonly send: (channel: string, ...args: any[]) => Promise<any>, readonly render: (state: NativeInspectorState) => void, readonly agent: (root: string, prompt: string, submit?: boolean) => Promise<void>, readonly setup: () => Promise<void>) {}
  publish() { this.render({ ...this.state, fields: [...this.state.fields], actions: [...this.state.actions] }) }
  async activate(root: string) { this.state.root = root; this.element = null; this.state.visible = false; ++this.state.generation; await this.refresh() }
  async select(element: SelectedElement | null) {
    await this.send('styles:clear-preview', {})
    this.state.busy = false; this.element = element; this.state.visible = !!element; ++this.state.generation
    this.inspection = null; this.styles = null; this.controls = []; this.state.error = ''; this.build(); this.publish()
    if (element) await this.refresh()
  }
  async refresh() {
    const root = this.state.root, element = this.element, generation = ++this.sequence
    if (!root) return
    const files = [element?.source, element?.componentSource].filter(Boolean).map(v => v!.replace(/:\d+(?::\d+)?$/, ''))
    const results = await Promise.allSettled([
      element?.source ? this.invoke('props:inspect', root, element.componentSource || element.source, element.text) : Promise.resolve(null),
      element ? this.invoke('styles:read', Object.keys(STYLE_PROP_META)) : Promise.resolve(null),
      this.invoke('tokens:detect', root),
      this.invoke('controls:list', root)
    ])
    if (generation !== this.sequence || root !== this.state.root || element !== this.element) return
    this.inspection = results[0].status === 'fulfilled' ? results[0].value : null
    this.styles = results[1].status === 'fulfilled' ? results[1].value : null
    this.tokens = results[2].status === 'fulfilled' ? results[2].value : null
    const manifests = results[3].status === 'fulfilled' ? results[3].value : []
    const animationFiles = manifests.filter((p: any) => p.presentation === 'animation').map((p: any) => p.file)
    const controls = await this.invoke('controls:get', root, { files: [...new Set([...files, ...animationFiles])] }).catch(() => [])
    if (generation !== this.sequence || element !== this.element || root !== this.state.root) return
    this.controls = controls
    if (!element && controls.some((p: ResolvedControlPanel) => p.manifest.presentation === 'animation')) { this.state.visible = true; this.state.tab = 'custom' }
    this.build(); this.publish()
  }
  build() {
    const root = this.state.root, element = this.element, inspection = this.inspection
    this.bindings.clear(); this.state.fields = []; this.state.actions = [{ id: 'refresh', label: 'Refresh' }, { id: 'close', label: 'Close' }]
    this.state.title = element ? `${element.tag}${element.id ? '#' + element.id : ''}` : 'Project controls'
    const add = (field: NativeInspectorField, binding?: Binding) => { this.state.fields.push(field); if (binding) this.bindings.set(field.id, binding) }
    if (element && this.state.tab === 'styles') this.state.actions.unshift({ id: 'replay-style', label: 'Replay transition' })
    if (element) this.state.actions.unshift({ id: 'controls', label: 'Create controls…' }, { id: 'animation', label: 'Add animation…' })
    if (element && !element.source) this.state.actions.unshift({ id: 'setup', label: 'Set up editing' })
    if (this.state.tab === 'props' && element) {
      if (!inspection?.hasSchema) add({ id: 'schema', label: 'No editable prop schema', group: 'Properties', kind: 'readonly', value: inspection?.note ?? 'Use chat to change this element, or set up source instrumentation.' })
      else for (const field of inspection.fields) {
        const id = 'prop:' + field.name, source = inspection.source
        add({ id, label: field.name, group: inspection.component, kind: field.kind === 'boolean' ? 'toggle' : field.kind === 'enum' ? 'select' : field.kind === 'number' ? 'number' : 'text', value: String(field.value ?? field.default ?? ''), options: field.options, disabled: field.kind === 'other', detail: field.description ?? (field.expression ? 'Expression: this edit may use the agent.' : ''), reset: true }, {
          apply: value => this.invoke('props:apply', root, { source, name: field.name, kind: field.kind, value: field.kind === 'number' ? finite(value) : field.kind === 'boolean' ? value === 'true' : value }),
          reset: () => this.invoke('props:remove', root, source, field.name)
        })
      }
    } else if (this.state.tab === 'styles' && element) {
      const values = this.styles?.values ?? element.styles
      for (const [prop, meta] of Object.entries(STYLE_PROP_META)) {
        if (meta.flexGridOnly && !/flex|grid/.test(values.display ?? '')) continue
        const tokens = tokensForProp(this.tokens, prop), value = values[prop] ?? '', id = 'style:' + prop
        const cssValue = (value: string) => meta.control === 'number' && /^-?\d+(\.\d+)?$/.test(value.trim()) ? toCssText(prop, finite(value)) : value
        const apply = (value: string, token?: any) => this.invoke('styles:apply', root, { source: element.source, prop, value: cssValue(value), classes: element.classes, authored: this.styles?.specified[prop], token })
        add({ id, label: prop, group: meta.group, kind: meta.control, value: meta.control === 'number' ? String(numericValue(prop, values) ?? value) : value, disabled: !element.source || meta.control === 'readonly', min: meta.min, max: meta.max, step: meta.step, unit: meta.unit, options: meta.options, detail: this.styles?.specified[prop], tokens: tokens.map((t, i) => ({ id: String(i), label: `${t.token.name} · ${t.token.value}` })) }, {
          apply, preview: value => this.send('styles:preview', { prop, value: cssValue(value) }),
          token: value => { const token = tokens[Number(value)]; if (!token) throw new Error('This token is no longer available.'); return apply(token.token.value, { name: token.token.name, group: token.group }) }
        })
      }
    } else if (this.state.tab === 'custom') {
      for (const panel of this.controls) {
        this.state.actions.unshift({ id: `remove:${panel.manifest.id}`, label: `Remove ${panel.manifest.title}` })
        if (panel.manifest.replay) this.state.actions.unshift({ id: `replay:${panel.manifest.id}`, label: `Replay ${panel.manifest.title}` })
        for (const param of panel.params) {
          const id = `custom:${panel.manifest.id}:${param.id}`, apply = param.apply
          const kind = param.kind === 'toggle' ? 'toggle' : param.kind
          add({ id, label: param.label, group: panel.manifest.title, kind, value: String(param.value ?? ''), disabled: !param.valid, detail: param.reason, options: param.options, min: param.min, max: param.max, step: param.step, unit: param.unit }, {
            apply: async raw => {
              const value = param.kind === 'number' ? finite(raw) : param.kind === 'toggle' ? raw === 'true' : raw
              if (apply.strategy === 'literal') return this.invoke('controls:apply-literal', root, panel.manifest.id, param.id, value)
              if (!element?.source) throw new Error('Select this component before editing its controls.')
              if (apply.strategy === 'style') return this.invoke('styles:apply', root, { source: element.source, prop: apply.styleProp, value: String(value), classes: element.classes })
              return this.invoke('props:apply', root, { source: inspection?.source ?? element.componentSource ?? element.source, name: apply.propName, kind: param.kind === 'number' ? 'number' : param.kind === 'toggle' ? 'boolean' : 'string', value })
            }
          })
        }
      }
      if (!this.controls.length) add({ id: 'empty', label: 'Custom controls', group: '', kind: 'readonly', value: 'Create controls for the selected object to expose its source parameters.' })
    }
  }
  async action(action: NativeInspectorAction) {
    if (action.root !== this.state.root || action.generation !== this.state.generation) return
    const root = this.state.root, generation = this.state.generation
    try {
      if (action.action === 'tab') { this.state.tab = ['props', 'styles', 'custom'].includes(action.value ?? '') ? action.value! : 'styles'; this.build(); this.publish(); return }
      if (action.action === 'close') { this.state.visible = false; await this.send('styles:clear-preview', {}); this.publish(); return }
      if (action.action === 'refresh') { await this.refresh(); return }
      if (action.action === 'setup') { await this.setup(); return }
      if (action.action === 'controls' || action.action === 'animation') {
        if (this.element) await this.agent(root, (action.action === 'animation' ? animationControlsPrompt : controlsPrompt)(this.element, this.inspection, action.value, 'claude'), true)
        return
      }
      if (action.action === 'replay-style') { await this.send('styles:replay', { prop: 'opacity', from: '0.5', to: this.styles?.values.opacity || '1' }); return }
      if (action.action.startsWith('replay:')) { const panel = this.controls.find(p => p.manifest.id === action.action.slice(7)); if (panel) await this.send('preview:animation-replay', panel.manifest.component); return }
      if (action.action.startsWith('remove:')) { await this.invoke('controls:remove', root, action.action.slice(7)); await this.refresh(); return }
      const binding = this.bindings.get(action.field ?? '')
      if (!binding || this.state.fields.find(f => f.id === action.field)?.disabled) return
      if (action.action === 'preview') { await binding.preview?.(action.value ?? ''); return }
      const write = async () => {
        if (root !== this.state.root || generation !== this.state.generation) return
        this.state.busy = true; this.state.error = ''; this.publish()
        try {
          const result = action.action === 'reset' ? await binding.reset?.() : action.action === 'token' ? await binding.token?.(action.value ?? '') : await binding.apply(action.value ?? '')
          if (result?.needsAgent && result.agentPrompt) await this.agent(root, result.agentPrompt)
          else if (result && !result.applied) throw new Error(result.error ?? 'The edit was not applied.')
          if (generation === this.state.generation) { await this.send('styles:clear-preview', {}); await this.refresh() }
        } catch (error) { if (generation === this.state.generation) this.state.error = String(error) }
        finally { if (generation === this.state.generation) { this.state.busy = false; this.publish() } }
      }
      this.operation = this.operation.then(write, write); await this.operation
    } catch (error) { if (generation === this.state.generation) { this.state.error = String(error); this.publish() } }
  }
}
function finite(value: string) { const number = Number(value); if (!value.trim() || !Number.isFinite(number)) throw new Error('Enter a valid number.'); return number }
