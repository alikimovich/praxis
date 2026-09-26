---
name: animation-controls
description: Surface Praxis's own animation controls beside the preview, independent of element selection. Use when asked to surface animation controls, add animation sliders or a DialKit-style tuning panel, or keep motion controls available while selecting other objects.
---

# Native animation controls

Use Praxis's existing sliders, toggles, colors, selects, and easing editor in a
persistent project-owned animation panel. DialKit is a behavior reference, not a
dependency. Do not install DialKit or build a control-panel UI inside the project.
No object needs to be selected. Selection only helps identify the animation.

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

## Wire real parameters

Read the animation implementation and preserve its engine, defaults, layout, and
reduced-motion behavior. Do not add motion unless asked. Extract useful values to
named constants in the source file, directly consumed by the running animation.
For spring controls, the existing engine must consume the parameters at runtime;
changing constants behind a precomputed curve is not a working control.

Call `define_controls` with `manifest.presentation: "animation"`. Give it the
repo-relative `file`, stable `component` identity unique among project animation
panels, descriptive `title`, and bounded
parameters. Every parameter must use `apply.strategy: "literal"`: the unique
anchor ends immediately before the editable value. Prop/style strategies depend
on selection and are rejected for animation panels. Main validates and persists
the manifest; never write `.praxis/` yourself. Reuse the same file/component to
update an existing panel rather than duplicating it.

These controls write source through Praxis's existing edit/Undo flow; HMR updates
the preview. They are not unsaved browser-only values. Ensure the project picks
up changed values without losing the animation's normal behavior.

## Replay

For one-shot animations, add a listener for the `praxis:animation-replay` window
CustomEvent. Its `event.detail` is a string equal to the manifest's `component`.
Only replay this animation when it matches. Use the current parameter values,
preserve unrelated application state, and clean up listeners on unmount/HMR so
repeat replays do not accumulate handlers. Then set `manifest.replay: true`.
This hook is ordinary project code; the Replay button and all tuning UI live in
Praxis. Do not expose arbitrary code evaluation or depend on DOM selection.

## Verify and explain

Check with nothing selected, another object selected, and selection cleared. The
same native panel must remain. Change a control, verify its source value and real
motion, replay twice, collapse/reopen, and verify Undo. Run the project build;
no third-party tuning package or panel UI should be added to production output.
Praxis owns the dev server; do not start a competing server. Code edited in a
private worktree becomes tunable after landing; invalid anchors remain disabled.

If `define_controls` is unavailable, explain that this provider cannot register
native controls; do not silently install a tuning dependency as a fallback.
Requests explicitly about the selection's inspector keep its existing workflow
(omit presentation and use `open_controls` if needed).

## Optional Jev selection

Prepare focused, real source-backed params and pass `engine: "auto"`
and the user request as `prompt` alongside the manifest in `define_controls`. Jev
selects and orders the controls before registration. Preserve its returned choice;
When no Gateway key is configured, the tool retains your prepared params and reports
`engine: "agent"` with a fallback reason. Explain that Jev was not used. Other failures
remain errors; repair the cause without claiming registration succeeded. Use
`engine: "agent"` when the user explicitly wants the chat model alone.
Content-copy and collection requests use `content_controls` catalog/define instead.
