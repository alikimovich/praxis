import type { ProviderLoginReport } from '../shared/api'
import type { NativeSheetAction, NativeSheetField, NativeSheetState } from '../shared/native-sheet'
import { loginSummary } from './chat-login'
import type { NativeSheetController } from './sheets-runtime'
/** The Claude pane of AI Providers, in the shape the Settings controller swaps in. */
interface Pane { detail: string; fields: Omit<NativeSheetField, 'section' | 'draft'>[]; actions: NativeSheetState['actions'] }
type Show = (id: string, pane: Pane) => void
/** The token goes to the service and never comes back into a sheet. */
async function pane(sheets: NativeSheetController, report?: ProviderLoginReport): Promise<Pane> {
  const { hasToken }: { hasToken: boolean } = await sheets.invoke('providers:seat-token-status')
  return {
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
  }
}
/** Claude's sign-in (LKM-119): open its pane, "Check login", save or remove the `claude setup-token` token. */
export async function claudeAction(sheets: NativeSheetController, action: NativeSheetAction, show: Show) {
  let report: ProviderLoginReport | undefined, message: string | undefined
  if (action.action === 'claude-check') report = await sheets.invoke('providers:check-login', 'claude')
  else if (action.action !== 'claude') {
    const remove = action.action === 'claude-remove'
    const token = remove ? '' : action.values.token?.trim() ?? ''
    if (!remove && !token) throw new Error('Paste the token that claude setup-token printed.')
    const result = await sheets.invoke('providers:seat-token-save', token)
    if (!result.ok) throw new Error(result.error ?? 'Could not save the token.')
    message = result.hasToken ? 'Token saved. New Claude chats use it.' : 'Token removed.'
  }
  show(action.id, await pane(sheets, report))
  if (message && sheets.current?.state.id === action.id) { sheets.current.state.message = message; sheets.refresh() }
}
