---
name: surface-controls
description: Generate interactive controls inside the Praxis chat for animations, shadows, typography, styling and component values. Use when asked to show, expose, add or surface editing or tuning controls. Excludes controls intended for the target app's end users.
---

# Surface controls inside chat

Requested controls must appear as an interactive island in the conversation.
Use `chat_island`; do not open a separate inspector/content panel or install a
control-panel dependency in the target project. Selection is optional context.

## Inspect and bind

1. Call `chat_island` with `action: "catalog"`.
2. Read the implementation. Preserve its behavior and reuse existing tunable
   constants. If necessary, extract clean literals in one source file and wire
   them into the actual implementation. Do not invent unused parameters.
3. Prepare `manifest` with file, component, title and literal params, and `blocks`
   with id, title, kind and parameter IDs. A group bundles related fields; a point
   takes exactly two bounded numbers for x/y. Parameters must have unique anchors
   ending immediately before their values, e.g. `const SHADOW_ELEVATION = `.
4. Call `chat_island` with `action: "define"`, the manifest/blocks, `engine: "auto"`
   and the user's original request as `prompt`. Require a successful result with
   an island ID. The host attaches it to this chat and enables it after landing.

## Match the implementation

- Springs expose the engine's actual stiffness/damping/mass or duration/bounce.
  Changing constants behind a precomputed curve is not a working spring control.
- Tweens expose duration/delay and a Bézier field; combined motion uses groups
  for its individual tracks and shared parameters.
- Shadows can expose elevation, opacity, softness and light angle, or a 2D light
  point. The project must deterministically compute actual multilayer shadows
  from those values. Reuse parameters already exposed by an earlier agent turn.
- Typography and style controls use literals consumed by the selected component.
- Layer add/remove, timelines and arbitrary expressions are not supported by the
  first island catalog. Explain the limit; use supported fields and follow-up
  source edits. Do not substitute a separate editor for the requested chat island.

Keep all controls in Praxis. Do not add motion, change animation engines or alter
reduced-motion behavior unless requested. Never write `.praxis/` yourself.

## Updates, Replay and verification

Use `action: "read"` to inspect existing islands, then pass the returned `id` and
`revision` when updating one. Preserve compatible parameter IDs and current values.
Jev selects and orders prepared blocks. Missing Gateway credentials retain the
prepared layout and report `engine: "agent"` plus a fallback reason. Report the
actual engine; network/authentication/invalid-output errors require repair or retry.

For Replay, wire a `praxis:animation-replay` CustomEvent listener whose detail
matches this component; preserve unrelated state and clean it up on unmount/HMR.
Then set manifest presentation to animation and replay to true. Omit Replay when
no valid target exists.

Controls commit source on release/field commit; dragging does not call a model.
Verify source and preview changes plus Undo. Source created in a worktree waits
for successful landing; parked/failed changes do not activate. If this provider
lacks `chat_island`, explain that limitation rather than invoking an older panel
tool. Praxis owns the dev server; do not start another server.
