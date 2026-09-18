---
name: animation-controls
description: Surface live animation controls inside the previewed web app, independent of Praxis element selection. Use when asked to surface animation controls, add animation sliders or a DialKit-style tuning panel, or keep motion controls visible while selecting other objects.
---

# Animation controls in the preview

Build a small tuning panel in the user's **previewed project**. It must work with
nothing selected and remain available when Praxis selection changes or clears.
The selected element, if any, is context for finding the animation, not the
panel's owner or lifetime. For a named animation, inspect its implementation;
only ask which animation when the request and source leave multiple plausible targets.

## Implement the panel

- Preserve existing motion and defaults. Surface the values the animation actually
  consumes; do not add new motion unless asked. Keep the existing animation engine.
- Reuse the project's tuning panel if it has one. Otherwise use DialKit with the
  adapter for the project's framework. Read the installed version's documentation
  before wiring APIs; start at [DialKit's agent guide](https://www.dialkit.dev/agent).
  Add needed dependencies using the project's package manager and update its lockfile.
  For an environment DialKit cannot support, build a small equivalent dev panel
  using the project's own UI primitives; do not change the app's framework.
- Mount the panel root once in a stable app/layout boundary, outside conditional
  animated content. Register its values in a stable owner so replaying/remounting
  the animated child does not unregister the panel or reset the user's tuning.
  Use a descriptive title and stable identity; reuse the existing registration on
  follow-up requests instead of creating duplicate panels.
- Wire controls directly to runtime animation values. Use useful bounds and units
  for timing, delay, distance, scale, stagger, and the spring/easing model already
  in use. Do not show inert knobs, or controls for parameters the animation ignores.
- Include Replay for one-shot motion. Restart just that animation, preserving the
  controls and unrelated application state. Keep reduced-motion behavior intact.
- Place the panel visibly within the preview viewport with collapse/reopen and
  usable overflow on narrow screens. It must not intercept clicks outside itself.
  Mark custom fallback panel roots with `data-praxis-controls` so Praxis leaves
  their inputs clickable in Select mode (DialKit roots are already recognized).
  Scope it to development unless the user asks for a production tuning interface;
  hiding controls must leave the original production animation working. Vanilla
  DialKit does not infer the build mode: guard its root with the project's actual
  development flag (for example Vite's `import.meta.env.DEV`). Do not rely on
  `createDialRoot()` defaults to hide it in production.

## Praxis integration

Do not call `define_controls` or `open_controls` to satisfy this workflow: those
open the selection-owned inspector. Do not require source stamps, ask the user
to select an object, or bind the panel to Praxis's selection store. Requests
explicitly about the Props/Styles/Custom inspector still use that existing workflow.

Edit ordinary project source, not `.praxis/`. Praxis owns the project's dev server
and dependency refresh after landing; do not start another server. Keep preview
navigation on the current project. A DOM panel in the target app works in both
Praxis's native preview and its browser preview without extra Electron plumbing.

## Verify and hand off

Check the running project with selection empty, then select a different object
and clear it: the same panel and values must remain. Change a control and verify
that the animation changes; test Replay twice and collapse/reopen. Check a narrow
viewport and the project's build, including production defaults without the panel.
Use the available preview/browser tools under Praxis's normal verification rules.

Explain where the panel lives and which parameters it changes. Distinguish live
browser tuning from saved source defaults. When asked to keep chosen values,
apply them to the real animation defaults; do not claim that a slider alone saved
source code.
