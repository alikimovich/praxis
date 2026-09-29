import { agentWorkspaceEvidence, agentWorkspaceState, resolveParkedChat } from './chat-isolation'
import { runChatIslandTool } from './chat-islands'
import { openAgentCode } from './code-tools'
import { runContentControlTool } from './content-control-tools'
import { observeAgentPreview } from './preview-observation-tools'
import { openAgentPreview } from './preview-tools'
import { runProjectUiTool } from './project-ui'
import { ProviderError, providerOwner } from './provider-owner'
import type { TreziAgentToolAction } from './trezi-agent-tools'

/**
 * Trezi's session-scoped agent tools that act on app state (the preview, islands,
 * content controls, the editor, workspace landing), run in Bun for one chat. The
 * Codex MCP bridge and helper-hosted sessions dispatch here; Claude's in-process
 * tools call the same functions. Pure calculators are not here: they need nothing
 * from Bun and run wherever the provider runs.
 */
export interface ToolScope {
  /** The session's working directory (a chat worktree, or the live root). */
  root: string
  liveRoot: string
  emitKey: string
  background: boolean
  connectionId?: string
  notify: (channel: string, payload: unknown) => void
}

export async function runTreziTool(action: TreziAgentToolAction, args: unknown, s: ToolScope): Promise<unknown> {
  if (action === 'preview_location' || action === 'preview_screenshot') return observeAgentPreview(action)
  if (action === 'project_ui_catalog' || action === 'compose_project_ui')
    return runProjectUiTool(s.root, s.emitKey, action, args as never, s.connectionId)
  if (action === 'content_controls') return runContentControlTool(s.root, s.liveRoot, s.emitKey, args as never, s.notify, s.connectionId)
  if (action === 'chat_island')
    return s.background ? { error: 'Background edits cannot create chat islands.' } : runChatIslandTool(s.emitKey, s.root, args as never, s.connectionId)
  if (action === 'open_preview') return openAgentPreview(s.liveRoot, s.emitKey, args as never, s.notify, s.background)
  if (action === 'open_code')
    return s.background
      ? { error: 'Background edits cannot navigate the user editor.' }
      : openAgentCode(s.root, s.liveRoot, s.emitKey, args as never, s.notify)
  if (s.background)
    return { ok: false, guidance: 'This background edit lands automatically. Do not change the parent chat workspace.' }
  if (action === 'workspace_state') return agentWorkspaceEvidence(s.emitKey, s.liveRoot)
  const before = agentWorkspaceState(s.emitKey)
  if (before.state === 'live' || before.state === 'isolated') {
    return { ok: false, ...before, guidance: 'There is no parked Trezi batch to prepare.' }
  }
  const prepared = await resolveParkedChat(s.emitKey)
  const state = agentWorkspaceState(s.emitKey)
  return {
    ...prepared,
    ...state,
    guidance: prepared.ok
      ? prepared.conflicted.length
        ? 'Resolve every conflict marker in the listed files, then finish the turn normally.'
        : 'Trezi combined and landed both sides without requiring manual resolution.'
      : `Trezi could not prepare the conflict: ${prepared.error ?? 'unknown error'}`
  }
}

/**
 * Runs a tool only if the provider owner grants it to this session (S10). A refusal
 * (a tool outside the grant, a closed session, oversized arguments) comes back as the
 * tool's `{ error }` result, like any other tool failure the model can read.
 */
export async function authorizedTool<T>(grant: string | undefined, tool: string, args: unknown, run: () => Promise<T>): Promise<T | { error: string }> {
  if (grant) {
    try {
      await providerOwner().authorize(grant, tool, args)
    } catch (error) {
      return { error: error instanceof ProviderError || error instanceof Error ? error.message : String(error) }
    }
  }
  return run()
}
