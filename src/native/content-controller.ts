import { inspectContent } from '@alikimovich/content-controls/recipe'
import type { ContentControlDocument } from '../shared/api'
import type { NativeInspectorAction, NativeInspectorField, NativeInspectorState } from '../shared/native-inspector'
import type { EditingOwner } from '../main/editing-owner'
type Drafts = Pick<EditingOwner, 'contentDrafts' | 'saveContentDraft' | 'clearContentDraft'>
/** `base`: the document revision the draft was edited against (a restored draft keeps its own). */
type Session = { document: ContentControlDocument; base: string; draft: Record<string, any>; generation: number; root: string; visible: boolean; busy: boolean; error: string; dirty: boolean; undo: Record<string, any>[]; lastField: string | null; actions: Map<string, () => void>; fields: Map<string, { target: Record<string, any>; key: string; type: string }> }
/**
 * Recipe validation and revision checking are owned by backend services. An unsaved
 * draft is kept by the editing owner (S12) and restored after a restart; a draft
 * whose document changed meanwhile opens as a conflict: saving it is refused, since it
 * stays bound to the revision it was edited against.
 */
export class NativeContentController {
  readonly sessions = new Map<string, Session>()
  private sequence = 0
  private persisting = new Map<string, ReturnType<typeof setTimeout>>()
  constructor(readonly invoke: (channel: string, ...args: any[]) => Promise<any>, readonly render: (id: string, state: NativeInspectorState) => void,
    readonly drafts?: Drafts, readonly delay = 300) {}
  /** Debounced: the draft as it is now, or its removal once it matches the document again. */
  private persist(key: string, session: Session) {
    if (!this.drafts) return
    clearTimeout(this.persisting.get(key))
    const timer = setTimeout(() => {
      this.persisting.delete(key)
      if (this.sessions.get(key) !== session) return
      const panel = session.document.panel.id
      void (session.dirty ? this.drafts!.saveContentDraft(session.root, panel, session.base, session.draft)
        : this.drafts!.clearContentDraft(session.root, panel)).catch(error => { session.error = String(error); this.publish(key, session) })
    }, this.delay)
    timer.unref?.(); this.persisting.set(key, timer)
  }
  /** Settles pending draft writes now (tests, shutdown). */
  async flush() {
    const keys = [...this.persisting.keys()]
    for (const key of keys) { clearTimeout(this.persisting.get(key)); this.persisting.delete(key) }
    await Promise.all(keys.map(async key => {
      const session = this.sessions.get(key)
      if (!session || !this.drafts) return
      const panel = session.document.panel.id
      await (session.dirty ? this.drafts.saveContentDraft(session.root, panel, session.base, session.draft) : this.drafts.clearContentDraft(session.root, panel))
    }))
  }
  async open(root: string, id: string, reload = false) {
    const key = root + '\n' + id, existing = this.sessions.get(key)
    if (existing && !reload) { existing.visible = true; this.publish(key, existing); return }
    const document: ContentControlDocument | null = await this.invoke('content-controls:get', root, id)
    if (!document) throw new Error('This content file has not landed in the live checkout yet. Try again after the change finishes.')
    const session: Session = { document, base: document.revision, root, draft: structuredClone(document.value), generation: ++this.sequence, visible: true, busy: false, error: '', dirty: false, undo: [], lastField: null, actions: new Map(), fields: new Map() }
    if (reload) { clearTimeout(this.persisting.get(key)); this.persisting.delete(key); await this.drafts?.clearContentDraft(root, id) }
    else {
      const saved = (await this.drafts?.contentDrafts(root).catch(() => []))?.find(d => d.panel === id)
      if (saved) {
        session.draft = structuredClone(saved.value); session.base = saved.revision; session.dirty = true
        if (saved.revision !== document.revision) session.error = 'This unsaved draft was edited against an older version of the content, which changed since. Saving it is refused; Reload discards the draft.'
      }
    }
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
      if (action.action === 'remove') { await this.invoke('content-controls:remove',session.root,session.document.panel.id); session.visible=false; this.publish(key,session); this.sessions.delete(key); clearTimeout(this.persisting.get(key)); this.persisting.delete(key); await this.drafts?.clearContentDraft(session.root, session.document.panel.id); return }
      if (action.action === 'undo') { const previous = session.undo.pop(); if (previous) { session.draft = previous; session.dirty = JSON.stringify(previous) !== JSON.stringify(session.document.value); session.lastField = null; session.generation=++this.sequence; this.persist(key, session); this.publish(key,session) }; return }
      if (action.action === 'save') {
        const issues = inspectContent(session.document.panel.recipe, session.draft)
        if (issues.length) throw new Error(issues.map(issue=>`${issue.path}: ${issue.message}`).join('\n'))
        session.busy=true; this.publish(key,session)
        // Bound to the draft's own base: a stale restored draft is refused, never saved over newer content.
        session.document=await this.invoke('content-controls:save',session.root,session.document.panel.id,session.base,session.draft)
        session.base=session.document.revision; session.dirty=false; session.error=''
        this.persist(key, session)
      } else if (session.actions.has(action.action)) {
        session.undo.push(structuredClone(session.draft)); session.undo = session.undo.slice(-30); session.lastField = null; session.actions.get(action.action)!(); session.dirty=true; session.generation=++this.sequence; this.persist(key, session)
      } else {
        const field=session.fields.get(action.field ?? '')
        if (!field || !['draft','apply'].includes(action.action)) return
        const firstEdit = session.lastField !== action.field
        if (firstEdit) { session.undo.push(structuredClone(session.draft)); session.undo = session.undo.slice(-30); session.lastField = action.field ?? null }
        const raw=action.value ?? ''
        if (field.type==='number') { const number=Number(raw); field.target[field.key] = !raw.trim() || !Number.isFinite(number) ? raw : number }
        else field.target[field.key]=field.type==='toggle' ? raw==='true' : raw
        session.dirty=true; session.error=''; this.persist(key, session)
        // Do not round-trip a whole form on each text keystroke.
        if(action.action==='draft') { if (firstEdit) this.publish(key,session); return }
      }
    } catch(error) { session.error=String(error) }
    finally { session.busy=false }
    this.publish(key,session)
  }
}
