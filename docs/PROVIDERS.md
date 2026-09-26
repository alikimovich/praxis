# Provider capabilities

PR publishing uses a separate read-only Codex turn with `gpt-5.6-luna` and low
reasoning effort through the built-in Codex account. It summarizes the committed
merge-base diff after reconciliation, without chat or commit messages. Titles are
bounded to 72 characters and descriptions to 120 words. The turn has a 60-second
timeout; generation or PR-update failures are surfaced for retry, without a
conversation-based fallback. This requires Codex sign-in even for Claude chats.
Large patches are capped at 100,000 characters and marked as truncated.

Praxis has one `ProviderSession` seam, not one identical capability set. A model keeps
the native tools and behavior of its harness; Praxis must gate UI and prompts by declared
capabilities instead of assuming Claude, Codex, gateways, and Gemini are interchangeable.

| Capability | Claude Agent SDK | Codex SDK | Custom gateway | Gemini (experimental) |
| --- | --- | --- | --- | --- |
| Persistent multi-turn context | Yes | Yes | Yes, through Codex | No guaranteed continuity |
| Repository instruction discovery | `CLAUDE.md` + Claude skills | Codex-native instructions + Praxis rules | Same as Codex | Limited |
| Skills menu before the first turn | Yes | Yes | Yes, through Codex | Yes |
| Provider-native coding tools | Yes | Yes | Depends on model through Codex | Limited |
| Praxis preview location/screenshots | Yes | Yes | Yes, image support depends on endpoint | No |
| On-demand native chat islands (`chat_island`) | Yes | Yes | Yes, through Codex | No |
| Open mini code editor / highlight exact source | Yes | Yes | Yes, through Codex | No |
| Praxis worktree control tools | No | Yes | Yes, through Codex | No |
| Praxis question cards | Yes | No | No | No |
| Praxis approve/deny cards | Yes | No SDK approval event | No SDK approval event | No |
| Image input | Yes | Not wired | Not wired | Not wired |
| Resume provider thread | Yes | Not wired | Not wired | No |
| Detached background agents (comments + visual edits) | Yes | Yes | Yes, through Codex | Disabled |
| Custom endpoint | No | Built-in ChatGPT seat | Yes (`/responses`) | No |

“No” often means Praxis has not built the bridge, not that the underlying model can
never support the feature. Codex and gateway sessions receive a session-scoped local MCP
server with `workspace_state` and `prepare_conflict_resolution`: the former reads the
landing coordinator rather than guessing from the private checkout, while the latter
routes the existing three-way resolver through Praxis's repository queue. It deliberately
does not expose raw Git or discard/reset operations. Interactive tuning uses
`chat_island`, scoped to the originating chat and assistant turn. The legacy
`define_controls` and `open_controls` tools are no longer registered; the socket
bridge rejects those actions. Islands validate source anchors in the agent's
checkout and become editable after the source lands in the live project.
Preview location and screenshot tools share the native capture implementation across
Claude and Codex; screenshots are returned as MCP image content. Design calculators remain Claude-only;
question cards, resume, image transport, and background-agent support are separately
declared because they have different lifecycle and security requirements.

Preview comments use the originating chat's provider: Claude subscriptions run
the `sonnet` alias (latest Sonnet), Codex subscriptions run `gpt-5.6-sol`, and
Gateway/custom connections keep the chat's exact model and connection. The choice
is captured when submitted, including queued comments, without changing the chat.
Comments inherit reasoning effort and start a fresh provider session in an isolated
worktree. Native cards expose provider status; startup failures are reported instead
of silently retrying in the main chat. Non-repositories and unsupported backends
retain the interactive fallback, pinned to the originating chat.
Committed visual edits inherit the originating chat's selected provider/model.
AI fallbacks from text, props, styles, custom controls, and layer moves start detached children immediately on Claude and Codex
(including custom endpoints). The main draft and transcript stay intact; successful
results auto-land and refresh the preview. Failed or interrupted results never
auto-land. A provider without background support or a folder without Git worktree
support preserves the instruction in the composer and explains the fallback.
The rail always shows the harness/model the child actually received.

Until capability negotiation exists in `src/shared/api.ts`, the product should avoid
promising unsupported actions in backend-agnostic copy. Open-model connections inherit
the Codex harness's strengths and gaps; changing the model id does not grant Claude's
design calculators. Preview observation is available through the shared MCP bridge,
but image understanding depends on the endpoint model. It also retains Praxis worktree-control tools
because those belong to the harness, not the selected endpoint model.

## Required browser verification

All providers receive the same built-in agent-browser operating rule. For web UI
changes and browser testing, agents must check CLI availability in their execution
environment and use it when available. Responsive/layout checks cover phone,
tablet, and desktop viewports, with screenshots and interaction checks. Each task
uses its own named browser session. Missing CLI/browser support is reported;
installation requires user permission. An explicit user tool choice takes priority.

Preview observation is on demand and shows the current user view, not necessarily
the calling chat’s private worktree. Codex screenshot tool output is separate from
composer image attachments, which remain unwired. Restart existing provider sessions
to pick up the new tool configuration and instructions.

This is prompt-level enforcement, not a runtime tool-call gate. Existing sessions
need to be recreated to receive updated rules. A preview still serving code from
before a private worktree edit cannot verify that edit; the agent must report it as
pending instead of bypassing Praxis's landing lifecycle or claiming success.

## Skills menu and Codex runtime

Praxis bundles Codex SDK/CLI 0.154.0 or newer; updating the global `codex` binary
alone does not update the runtime used by Praxis. Run `bun install` and rebuild
after pulling a dependency update.

Codex, custom endpoints, and experimental Gemini discover project and user skills
in `.agents/skills`, their native `.codex/skills` or `.gemini/skills`, and
`.claude/skills` for compatibility with Praxis-installed packs. Codex honors
`CODEX_HOME` for its user skills. Project entries shadow same-named user entries;
symlinked installs and Codex system skills are included. Menus populate before
the first turn, independently of authentication. Invoking `/name` supplies the
selected skill file path in the prompt so the harness can read its instructions.
Claude keeps its native SDK command discovery.

## Switching models within a chat

Changing a model or provider in a nonempty chat requires confirmation: replaying
its recorded conversation consumes additional input tokens on the next message.
Cancel preserves the current choice. Empty chats do not need this confirmation,
and model/provider controls are disabled while a response or switch is running.

Every picker change starts a fresh session for that chat, preserving its private
worktree and transcript. Its first user turn includes the prior user/assistant
text and tool summaries once; later turns rely on the new provider's own context.
This handoff stays out of the displayed/saved transcript and does not reuse a
previous provider's SDK session id. Past image bytes and full tool outputs are
not present in the transcript and are not replayed. Large histories may reach the
selected model's context limit; Praxis does not silently truncate the conversation.

## New-project setup conversations

New Project offers the deterministic React/Vite starter or an empty Git repository
for Next.js, Svelte, or a custom environment. Discussion choices submit a short
planning request to the selected provider. Shared Praxis rules ask for unresolved
project/environment choices before scaffolding; an explicit choice is not asked
again. Claude can use its question cards; Codex and gateways ask in ordinary chat.
The model's conversational behavior remains prompt-guided. Creating the empty
repository itself does not install packages or choose a framework.

Preview refresh is provider-independent once edits land: manifest/lockfile changes
install dependencies in the live checkout, framework config changes restart the
managed web preview, and both re-detect the current launch settings. The provider's
terminal event alone does not prove that private edits reached the live checkout.

Composer queues are managed by Praxis for every provider. They submit separate
turns in order, preserving the originating chat, file/image attachments, and
selection context. They do not depend on provider-native steering support; image
interpretation remains subject to the capability table above.

The bundled `surface-controls` skill requires `chat_island` for on-demand tuning
controls inside the conversation. Claude and Codex/custom endpoints support this
route; Gemini must explain that native registration is unavailable. Existing
literal constants can be bound directly without rewriting the project. Optional
Replay dispatches `praxis:animation-replay` with the component name as its string
detail. Source edits use island Undo/Reset and HMR; a separate inspector or project
panel is not a substitute for a requested chat island.

`open_code` opens the docked editor at a repo-relative file and an inclusive line
range. Main validates the file boundary (including symlinks) and captures the exact
source text from the agent checkout. The active project/chat reveals it only when
that text exists in the live checkout, retrying after landing. Dirty editor drafts
defer navigation until saved or discarded. Detached agents cannot navigate the
editor. The transport also works in browser mode.

`open_preview` accepts a project-root path with optional query/hash for Claude
and Codex/custom endpoints. It uses the native preview navigation
and waits for the active turn's landing and a running web preview. Requests are
scoped to the active project/chat and discarded on a switch, failed turn, or parked
landing; detached agents cannot navigate. External origins and simulator routes
are unsupported. The tool reports a request, not proof that the page loaded.
Gemini does not expose this tool.

The Codex MCP helper uses an absolute path and working directory rooted at the
Praxis installation, independent of the target checkout. Before starting a session,
Praxis checks the real helper’s tool inventory and authenticated workspace socket.
The server is required on every Codex turn/resume, so initialization failures stop
the turn instead of silently dropping inline controls and preview tools. This check
does not call a model. These session-scoped tools are not installed into separate
Codex or Claude application chats.

The SDK session explicitly allows the validated `open_preview`, `open_code` navigation and `chat_island` tools via
its per-tool approval configuration, matching Claude's in-process allowlist. Other
MCP tools and shell approval policy keep their existing configuration.

## Framework setup context

Next setup is separate from generic React/Vite setup. The agent receives the
installed Next version (or an explicit missing-version state), selected script,
bundler, router layout, and helper hashes. Helpers are synchronized into the agent
checkout before the provider receives the turn. Setup asks for config integration,
not bulk component annotations. A TypeScript checker supplements unresolved
react-docgen schemas when an individual component is inspected.

Next's development adapter wraps the final config export, preserving functions,
async exports, existing wrappers and webpack callbacks. Conflicting Turbopack
rules require deliberate composition. Optional MDX uses a development-only remark
plugin supplied as an absolute path string. Production leaves the original config
unchanged; loaders and the remark transform independently disable outside dev.
Setup waits for landing and new-document stamp observations before reporting success.

## Automatic text reconciliation

Successful interactive turns use the shared landing coordinator to merge independent
text edits and, for overlapping text, send one reconciliation continuation to the
same provider session. This applies to Claude, Codex/custom endpoints, and the
experimental Gemini seam without adding provider-specific tools. The configured
permissions still apply. Stop, failure, an unavailable session, or unresolved markers
leave the work recoverable with the manual Resolve/Discard fallback. Detached agents
retain their existing landing policy.

## Project component composition

Claude and Codex expose the read-only `project_ui_catalog` and `compose_project_ui`
tools. Main enables them per chat only when a submitted message explicitly opts
in through Settings → Use project components. Gemini receives a limitation notice.
The tools use the current worktree and return source for ordinary edits and landing;
see [PROJECT_UI.md](PROJECT_UI.md). Settings can select the current chat model or
Jev as the composition engine. With Jev, Claude/Codex prepares candidate props and
copy, and a separate Gateway evaluation selects the composition. Jev requires a
main-process Gateway credential, reusing the encrypted connection saved in Settings,
and never silently falls back to another engine. The selected Gateway connection
wins; otherwise the sole saved Gateway is used. Environment overrides and ambiguous
connection handling are documented in PROJECT_UI.md.

Claude and Codex/custom endpoints expose `content_controls` (catalog/define) and
Jev selection in `chat_island`. Their `auto`/`jev` modes fall back to the chat
model’s validated candidates only when no Gateway key is configured, returning
the actual engine and fallback reason. The bundled `surface-controls` skill is
portable across providers; experimental Gemini explains its missing tools. See
[CONTENT_CONTROLS.md](CONTENT_CONTROLS.md).

Codex's routine skill-description context-budget advisory is omitted from chat
activity. Skill availability and provider context limits are unchanged. Other
item-level warnings remain visible with their full text, once per item per turn.

## Native chat islands

Interactive Claude and Codex/custom-endpoint sessions expose `chat_island` with
catalog, define and read actions. Definitions bind literal values in the session's
source tree and attach to its native conversation. Detached/background children
cannot create islands. The default auto engine uses saved Gateway credentials for
Jev to select/order whole prepared blocks; missing credentials use the agent's
layout with explicit fallback reporting. Runtime failures are not hidden.

Control-capable providers receive the same selection/verification guidance that
`chat_island` returns in its catalog, maintained in
`src/shared/chat-island-guidance.ts`. The bundled surface-controls skill reads
that catalog and applies it to source inspection, parameter semantics, replay and
preview/Undo checks. This is agent guidance, not automatic proof of runtime
reactivity; the host independently validates literal bindings and transactions.
The catalog remains available to existing sessions after an app update, while
new provider sessions receive the updated initial operating rules.

Native interactions call Bun source services directly and do not invoke a model.
Current values and island revisions enter the next provider turn as application
context, separately from the visible user transcript. See [CHAT-ISLANDS.md](CHAT-ISLANDS.md)
for the catalog, limits and verification status.

## Chat timing and control preparation

The shared transcript captures assistant timestamps at their first streamed chunk
and turn completion on the initiating user entry after landing/reconciliation.
Native chat shows elapsed turn time and message/commentary timestamp tooltips;
legacy records without completion metadata omit duration.

Control surfacing publishes a disabled source-validated draft before Jev finishes
selecting/ordering its blocks. Drafts are ephemeral and removed on failure or
cancellation; only completed definitions persist. Controls still activate after
successful landing. Redefining an island from an earlier turn creates a new ID
and attaches it to the current response; same-turn definitions still update in
place. Callers must use the returned ID/revision for subsequent updates.
Operating rules v23 and the surface-controls skill prioritize
existing bindings and early definition, without inventing unrequested effects or
running redundant builds when no source was changed. Required project checks still
apply to code changes. Existing provider sessions need fresh instructions to pick
up these guidance changes.
