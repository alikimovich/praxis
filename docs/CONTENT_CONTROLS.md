# Content controls in the preview

Ask chat: “Surface controls for the homepage headline and projects.” Claude and
Codex (including custom Codex endpoints) discover the content-controls catalog,
read the page, and prepare a version-1 recipe bound to a JSON content file. If
content is inline, chat first extracts it and wires the page to that JSON through
the normal worktree/landing flow. Praxis renders the editor beside the preview;
it does not install editor UI or dependencies in the target project.

The editor is independent of selection. Text, multiline text, numbers, toggles,
selects and stable-ID collections come from `@alikimovich/content-controls`.
Collections support adding, removing and moving items. Drafts survive collapse;
Undo and Reset operate on drafts. **Save to source** writes the document through
Praxis edit history, after checking that the loaded revision still matches disk.
A conflicting save preserves the draft; Reload explicitly discards it. App-level
Undo reverts saved edits. Switching projects or restarting the app discards unsaved
drafts. A new JSON binding waits for its source to land in the live checkout.
Missing files do not reject IPC: the editor retries for 30 seconds and on chat
landing events, then offers reload/removal if the source remains unavailable.
Existing drafts are never replaced by those events. Recipes persist in `.praxis/content-controls.json` and reopen with the project.

Only recipe-owned fields change on Save; unrelated document and existing item
fields are retained. JSON files must be inside the project, outside hidden paths,
node_modules and package/TypeScript configuration. Real paths are checked to reject
symlink escapes. Documents and the store are bounded to 512 KB, recipes to 32 KB,
and projects to 20 panels. Store mutations and content saves use the repository
writer queue. Corrupt stores fail without being overwritten.

The binding currently targets a JSON object: flat scalar fields and flat arrays of
objects with stable string IDs. Rich text, uploads, nested bindings and direct
AST content writes are not included. The agent must ensure the actual page consumes
the JSON and responds to HMR or reload; registering an editor does not prove that
binding. Gemini does not expose these tools yet.

## Jev decisions

Ask “Use Jev to choose controls for this content/animation/component.” The chat
model prepares concrete, source-backed candidates. `content_controls` with
`action:define`, `engine:jev` and the request as `prompt` lets Jev select and order
recipe sections. Put a field in its own section when it should be independently
selectable. `define_controls` accepts the same engine/prompt options to select and
order validated animation/component parameters, retaining their original write
bindings. The chat model prepares control types and their source instrumentation; Jev
chooses membership and order from those concrete candidates.

Jev uses the existing main-process Gateway credential described in
[PROJECT_UI.md](PROJECT_UI.md). It is independent of the opt-in project-component
composition setting. Requests have at most two evaluations and a 25-second deadline.
Interruption cancels active evaluation. Missing credentials, unavailable decisions
and invalid output fail without registering a substitute panel. No credential
enters the renderer or target project.

Desktop uses the native-preview inset so editors cannot be obscured by its
WebContentsView. Browser mode uses the same content editor and root-scoped commands;
existing animation-inspector browser parity remains separate.

## Dependency and verification

The built 0.1 package is vendored under `vendor/content-controls`, with source
revision provenance. It is a file dependency, so source installs need no sibling
checkout or unpublished registry package. Refresh its build and package metadata
together from the content-controls repository. Runtime React remains Praxis's own
React 18 instance; the editor and Motion are lazy-loaded.

- `bun test/content-controls.mjs`: validation, persistence and actual Jev composer
  with deterministic evaluator fixtures.
- `node test/content-controls-ui.mjs` after build: content/collection editing,
  native preview updates, draft retention, stale-write refusal and Undo.
- `node test/content-controls-agent.mjs` after build: real Codex registration and
  worktree landing and source save, with verified Jev requests through an encrypted
  saved connection when Gateway credentials are available to seed the test.
- `bun test/praxis-agent-tools.mjs`: actual MCP transport and tool discovery.
