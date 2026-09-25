import type { Diagnosis } from '../shared/api'
import type { NativeSheetController } from './sheets-runtime'
export class NativeSupportSheets {
  constructor(readonly sheets: NativeSheetController, readonly capture: () => Promise<string | null>, readonly openExternal: (url: string) => Promise<unknown>) {}
  async feedback() {
    const generation = this.sheets.generation
    const chat = this.sheets.chat.chats.get(this.sheets.chat.active)
    const conversation = chat?.messages.filter(m => m.text.trim()).map(m => `${m.role === 'user' ? 'You' : 'Praxis'}: ${m.text.trim()}`).join('\n\n') ?? ''
    const screenshot = await this.capture().catch(() => null)
    if (generation !== this.sheets.generation) return
    this.sheets.present({ title: 'Send feedback', detail: 'File a GitHub issue on the Praxis repository. Choose whether to include the current window and conversation.',
      fields: [
        { id: 'body', label: 'Feedback', kind: 'multiline', value: '' },
        ...(screenshot ? [{ id: 'preview', label: 'Screenshot preview', kind: 'image' as const, value: screenshot }, { id: 'screenshot', label: 'Attach screenshot', kind: 'choice' as const, value: 'yes', choices: [{ value: 'yes', label: 'Include' }, { value: 'no', label: 'Do not include' }] }] : []),
        ...(conversation ? [{ id: 'conversation', label: 'Attach current conversation', kind: 'choice' as const, value: 'yes', choices: [{ value: 'yes', label: 'Include' }, { value: 'no', label: 'Do not include' }] }, { id: 'transcript', label: 'Conversation preview', kind: 'readonly' as const, value: conversation }] : [])
      ], actions: [{ id: 'cancel', label: 'Cancel' }, { id: 'send', label: 'Send feedback', primary: true }]
    }, async action => {
      if (!action.values.body?.trim()) throw new Error('Describe your feedback first.')
      const result = await this.sheets.invoke('feedback:submit', { body: action.values.body, screenshot: action.values.screenshot === 'yes' ? screenshot : null, conversation: action.values.conversation === 'yes' ? conversation : null })
      if (!result.ok) throw new Error(result.error ?? 'Could not send feedback.')
      if (this.sheets.current?.state.id !== action.id) return
      this.sheets.present({ title: 'Feedback sent', detail: 'Your feedback was filed on GitHub.', fields: [], actions: [{ id: 'cancel', label: 'Close' }, ...(result.url ? [{ id: 'view', label: 'View issue' }] : [])] }, async () => { if (result.url) await this.openExternal(result.url) })
    })
  }
  diagnose(key: string) {
    const entry = this.sheets.workspace.state.projects.find(p => p.key === key)
    if (!entry) return
    const status = this.sheets.workspace.state.status
    const error = status.kind === 'error' ? status.message : 'The preview is not working as expected.'
    this.sheets.present({ title: 'Preview problem', detail: error, fields: [], actions: [{ id: 'cancel', label: 'Close' }, { id: 'retry', label: 'Retry' }, { id: 'diagnose', label: 'Diagnose…', primary: true }] }, async action => {
      if (action.action === 'retry') { await this.sheets.workspace.command({ type: 'restart', key }); if (this.sheets.current?.state.id === action.id) this.sheets.close(); return }
      const diagnosis: Diagnosis | null = await this.sheets.invoke('diagnose:run', entry.root, error, entry.launchSpec?.command ?? '')
      if (this.sheets.current?.state.id !== action.id) return
      if (!diagnosis) throw new Error('No diagnosis is available. Check your provider login or review Activity for the original error.')
      this.sheets.present({ title: 'Suggested fix', detail: diagnosis.summary,
        fields: [{ id: 'steps', label: 'Proposed changes', kind: 'readonly', value: [diagnosis.detail, ...diagnosis.steps.map(s => `${s.scope}: ${s.text}${s.command ? '\n' + s.command : ''}`)].filter(Boolean).join('\n\n') }],
        actions: [{ id: 'dismiss', label: 'Dismiss' }, ...(diagnosis.steps.some(s => s.scope === 'repo') ? [{ id: 'apply', label: 'Prepare repo fix', primary: true }] : [])]
      }, async choice => {
        if (choice.action === 'apply') {
          if (!this.sheets.workspace.state.projects.includes(entry)) throw new Error('Reopen this project before preparing its fix.')
          const steps = diagnosis.steps.filter(s => s.scope === 'repo')
          await this.sheets.chat.command({ type: 'seed', chat: entry.activeSessionKey, text: `Fix this so the project runs: ${diagnosis.summary}\n` + steps.map(s => `- ${s.text}${s.command ? ' (e.g. ' + s.command + ')' : ''}`).join('\n') })
        }
        await this.sheets.invoke('diagnose:record', entry.root, diagnosis.signature, choice.action === 'apply' ? 'applied' : 'dismissed')
        if (this.sheets.current?.state.id === choice.id) this.sheets.close()
      })
    })
  }
}
