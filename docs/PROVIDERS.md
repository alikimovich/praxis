# Provider capabilities

Praxis has one `ProviderSession` seam, not one identical capability set. A model keeps
the native tools and behavior of its harness; Praxis must gate UI and prompts by declared
capabilities instead of assuming Claude, Codex, gateways, and Gemini are interchangeable.

| Capability | Claude Agent SDK | Codex SDK | Custom gateway | Gemini (experimental) |
| --- | --- | --- | --- | --- |
| Persistent multi-turn context | Yes | Yes | Yes, through Codex | No guaranteed continuity |
| Repository instruction discovery | `CLAUDE.md` + Claude skills | Codex-native instructions + Praxis rules | Same as Codex | Limited |
| Skills menu before the first turn | Yes | Yes | Yes, through Codex | Yes |
| Provider-native coding tools | Yes | Yes | Depends on model through Codex | Limited |
| Praxis preview MCP tools | Yes | No | No | No |
| Register custom controls / open desktop inspector | Yes | Yes | Yes, through Codex | No |
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
does not expose raw Git or discard/reset operations. The same bridge now exposes
`define_controls` and `open_controls`, including to detached visual-edit children.
Registration validates anchors in the agent worktree and saves the manifest on the
live root. Opening is scoped to the active project, uses real preview selection,
and retries after landing; ambiguous file matches require an exact source stamp.
Preview observation/calculator tools remain Claude-only;
question cards, resume, image transport, and background-agent support are separately
declared because they have different lifecycle and security requirements.

Preview comments and committed visual edits inherit the originating chat's
selected provider/model settings. AI fallbacks from text, props, styles, custom
controls, and layer moves start detached children immediately on Claude and Codex
(including custom endpoints). The main draft and transcript stay intact; successful
results auto-land and refresh the preview. Failed or interrupted results never
auto-land. A provider without background support or a folder without Git worktree
support preserves the instruction in the composer and explains the fallback.
The rail always shows the harness/model the child actually received.

Until capability negotiation exists in `src/shared/api.ts`, the product should avoid
promising unsupported actions in backend-agnostic copy. Open-model connections inherit
the Codex harness's strengths and gaps; changing the model id does not grant Claude's
in-process preview/design tools. It does retain the two Praxis worktree-control tools
because those belong to the harness, not the selected endpoint model.

## Required browser verification

All providers receive the same built-in agent-browser operating rule. For web UI
changes and browser testing, agents must check CLI availability in their execution
environment and use it when available. Responsive/layout checks cover phone,
tablet, and desktop viewports, with screenshots and interaction checks. Each task
uses its own named browser session. Missing CLI/browser support is reported;
installation requires user permission. An explicit user tool choice takes priority.

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
