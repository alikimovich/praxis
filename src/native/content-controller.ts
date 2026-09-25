import { inspectContent } from '@alikimovich/content-controls/recipe'
import type { ContentControlDocument } from '../shared/api'
import type { NativeInspectorAction, NativeInspectorField, NativeInspectorState } from '../shared/native-inspector'
type Session = { document: ContentControlDocument; draft: Record<string, any>; generation: number; root: string; visible: boolean; busy: boolean; error: string; dirty: boolean; undo: Record<string, any>[]; lastField: string | null; actions: Map<string, () => void>; fields: Map<string, { target: Record<string, any>; key: string; type: string }> }
/** Recipe validation and revision checking stay in the same shared backend as Electron. */
export class NativeContentController {
  readonly sessions = new Map<string, Session>()
  private sequence = 0
  constructor(readonly invoke: (channel: string, ...args: any[]) => Promise<any>, readonly render: (id: string, state: NativeInspectorState) => void) {}
  async open(root: string, id: string, reload = false) {
    const key = root + '\n' + id, existing = this.sessions.get(key)
    if (existing && !reload) { existing.visible = true; this.publish(key, existing); return }
    const document: ContentControlDocument | null = await this.invoke('content-controls:get', root, id)
    if (!document) throw new Error('This content file has not landed in the live checkout yet. Try again after the change finishes.')
    const session: Session = { document, root, draft: structuredClone(document.value), generation: ++this.sequence, visible: true, busy: false, error: '', dirty: false, undo: [], lastField: null, actions: new Map(), fields: new Map() }
    this.sessions.set(key, session); this.publish(key, session)
  }
  publish(key: string, session: Session) {
    const fields: NativeInspectorField[] = [], actions = [...(session.undo.length ? [{id:'undo',label:'Undo draft change'}] : []), {id:'save',label:'Save to source'}, {id:'reload',label:'Reload (discard draft)'}, {id:'remove',label:'Remove editor'}, {id:'close',label:'Close'}]
    session.fields.clear(); session.actions.clear()
    const addFields = (recipes: any[], target: Record<string, any>, group: string, prefix: string) => {
      for (const recipe of recipes) {
        const id = `${prefix}:${recipe.key}`
        session.fields.set(id, { target, key: recipe.key, type: recipe.type })
        fields.push({ id, group, label: recipe.label, kind: recipe.type === 'textarea' ? 'multiline' : recipe.type, value: String(target[recipe.key] ?? ''), options: recipe.options, min: recipe.min, max: recipe.max, step: recipe.step, detail: recipe.description })
      }
    }
    const button = (id: string, label: string, group: string, action: () => void) => { fields.push({id, label, group, kind:'action', value:id}); session.actions.set(id, action) }
    for (const section of session.document.panel.recipe.sections) {
      if (section.fields) addFields(section.fields, session.draft, section.title, section.id)
      else {
        const collection = section.collection
        const items = session.draft[collection.key]
        if (!Array.isArray(items)) { session.error = `${collection.key} must be a collection. Reload from source after fixing its shape.`; continue }
        items.forEach((item, index) => {
          const prefix = `${section.id}:${index}`, group = `${section.title} · ${String(item[collection.itemLabelKey] || index + 1)}`
          addFields(collection.fields, item, group, prefix)
          button(prefix+':delete', 'Remove item', group, () => items.splice(index,1))
          if (index > 0) button(prefix+':up', 'Move up', group, () => { [items[index-1],items[index]]=[items[index],items[index-1]] })
          if (index < items.length - 1) button(prefix+':down', 'Move down', group, () => { [items[index+1],items[index]]=[items[index],items[index+1]] })
        })
        button(section.id+':add', collection.addLabel || 'Add item', section.title, () => items.push({ id: crypto.randomUUID(), ...structuredClone(collection.defaults) }))
      }
    }
    this.render(key, { root: session.root, generation: session.generation, visible: session.visible, title: session.document.panel.recipe.title + (session.dirty ? ' •' : ''), tab:'content', fields, actions, error:session.error, busy:session.busy })
  }
  async action(key: string, action: NativeInspectorAction) {
    const session = this.sessions.get(key)
    if (!session || session.root !== action.root || session.generation !== action.generation || session.busy) return
    try {
      if (action.action === 'close') { session.visible = false; this.publish(key,session); return }
      if (action.action === 'reload') { await this.open(session.root,session.document.panel.id,true); return }
      if (action.action === 'remove') { await this.invoke('content-controls:remove',session.root,session.document.panel.id); session.visible=false; this.publish(key,session); this.sessions.delete(key); return }
      if (action.action === 'undo') { const previous = session.undo.pop(); if (previous) { session.draft = previous; session.dirty = JSON.stringify(previous) !== JSON.stringify(session.document.value); session.lastField = null; session.generation=++this.sequence; this.publish(key,session) }; return }
      if (action.action === 'save') {
        const issues = inspectContent(session.document.panel.recipe, session.draft)
        if (issues.length) throw new Error(issues.map(issue=>`${issue.path}: ${issue.message}`).join('\n'))
        session.busy=true; this.publish(key,session)
        session.document=await this.invoke('content-controls:save',session.root,session.document.panel.id,session.document.revision,session.draft)
        session.dirty=false; session.error=''
      } else if (session.actions.has(action.action)) {
        session.undo.push(structuredClone(session.draft)); session.undo = session.undo.slice(-30); session.lastField = null; session.actions.get(action.action)!(); session.dirty=true; session.generation=++this.sequence
      } else {
        const field=session.fields.get(action.field ?? '')
        if (!field || !['draft','apply'].includes(action.action)) return
        const firstEdit = session.lastField !== action.field
        if (firstEdit) { session.undo.push(structuredClone(session.draft)); session.undo = session.undo.slice(-30); session.lastField = action.field ?? null }
        const raw=action.value ?? ''
        if (field.type==='number') { const number=Number(raw); field.target[field.key] = !raw.trim() || !Number.isFinite(number) ? raw : number }
        else field.target[field.key]=field.type==='toggle' ? raw==='true' : raw
        session.dirty=true; session.error=''
        // Do not round-trip a whole form on each text keystroke.
        if(action.action==='draft') { if (firstEdit) this.publish(key,session); return }
      }
    } catch(error) { session.error=String(error) }
    finally { session.busy=false }
    this.publish(key,session)
  }
}
