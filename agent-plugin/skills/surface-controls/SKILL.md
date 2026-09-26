---
name: surface-controls
description: Surface native Praxis controls for page content, collections, component properties, styling or animations. Use when asked to show, expose, add or surface editing or tuning controls. Excludes controls explicitly intended for the target app's end users.
---

# Surface controls in Praxis

Read the requested content or component's actual source first. Selection is helpful
context, not a prerequisite. Preserve existing values and behavior. Use Praxis's
controls tools; never implement an editor UI or install a tuning dependency in the
target project to satisfy a request for Praxis controls.

## Interactive islands in chat

For controls requested in the conversation, prefer `chat_island`. Call
`action: "catalog"`, inspect the actual source, expose literal constants consumed
by the project, then `action: "define"` with `manifest`, `blocks`, `engine: "auto"`
and the original `prompt`. A `group` lists parameter IDs; a `point` block requires
exactly two bounded number IDs (x/y), useful for light direction. Groups may expose
spring physics, tween easing, typography or individual shadow-layer values.
For shadow lighting, implement the deterministic mapping from light coordinates
to the project's shadow values; the island never evaluates arbitrary code.
Jev chooses and orders whole prepared blocks, preserving compound bindings.

Read an existing island with `action: "read"`, then pass its `id` and `revision`
when updating it. Controls write on gesture release/field commit, have Reset/Undo,
and wait for successful landing. Dynamic layer add/remove and runtime-live preview
scrubbing are not available yet; expose fixed layer groups or revise them through
a follow-up agent edit. Preserve the current behavior and explain engine fallback.
The inspector workflow below remains for explicit inspector/persistent-panel requests.

## Choose the binding

- **Copy and collections:** call `content_controls` with `action: "catalog"` for the
  live recipe contract. Bind a repo-relative JSON object consumed by the page.
  If the content is inline, extract it and wire the consumer before registration.
  Preserve unrelated fields and stable item IDs. Call `action: "define"` with the
  file and a version-1 recipe. A scalar uses a field; a list uses a collection.
- **Animation tuning:** read [animation-controls](../animation-controls/SKILL.md).
  Wire literal parameters into the actual motion and use `define_controls` with
  `manifest.presentation: "animation"`. Add scoped Replay only where appropriate.
- **Component properties and styles:** use `define_controls` with source-backed
  parameters. Choose numeric ranges/steps, toggles, colors, selects or easing to
  match the value. Use literal bindings when possible; prop/style bindings require
  a resolvable element. For an existing selection inspector, call `open_controls`
  with its source stamp or source file and the desired tab instead of duplicating it.

For mixed requests, register the appropriate separate panels. Reuse recipe IDs or
file/component identities when updating existing controls. The tools persist
manifests; never write `.praxis/` yourself. If a binding cannot be represented,
explain the unsupported part and surface the supported controls without inventing
nonfunctional controls. If this provider lacks the tools, explain that limitation.

## Jev and the no-key fallback

Prepare a focused set of useful controls with complete, valid bindings. Pass
`engine: "auto"` and the original request as `prompt` to either registration tool.
Jev selects and orders the prepared candidates when a Gateway key is configured.
Without a key, the tool registers your prepared controls with `engine: "agent"`
and a `fallback` reason. No extra key or permission is needed for this fallback.
Report the actual engine; never claim Jev ran when the tool used the chat model.
Use `engine: "agent"` if the user explicitly requests that engine or no Jev call.
`engine: "jev"` also supports the missing-key fallback. Authentication failures,
ambiguous connections, timeouts and invalid Jev output remain actionable errors;
do not conceal them as successful Jev results.

## Finish the workflow

Require a successful registration result. Repair invalid recipes or anchors and
retry; do not call a failed registration complete. Source created in a private
worktree becomes editable after it lands. A missing live file is a waiting state,
not a reason to create duplicate panels. If changes are parked, explain that they
must be applied before the panel can edit them.

Verify the control changes the source and actual preview, and that Undo works.
Content editors keep drafts until Save; parameter controls write through the
existing edit flow. Preserve unsaved drafts. Praxis owns the dev server, so do not
start another server. Report what was surfaced and any verification still pending.
