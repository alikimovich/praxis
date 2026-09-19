# Project component composition

Settings → **Use project components** enables experimental React UI composition.
It is off by default and saved on this device (browser mode stores the preference
in that browser). A new message captures the current setting, including when queued.
An in-progress or already queued turn retains its captured setting. Turning it off
preserves generated files and returns subsequent messages to ordinary source editing.

With Claude or Codex (including Codex-backed custom endpoints), a UI request follows:

1. `project_ui_catalog` statically scans the chat's current worktree for exported
   React components, their literal prop schemas, children support, and CSS tokens.
2. The agent reads source and usage examples to retain theme providers, layouts,
   fonts, styles and component conventions.
3. `compose_project_ui` validates a static json-render composition and returns TSX
   importing the project's actual components. It does not write files.
4. The agent applies and integrates that source using ordinary editing tools.
   Existing permission checks, worktree landing, preview refresh and revert apply.

Both tools are gated in main by the destination chat's explicit turn option. The
setting crosses the same desktop/browser send bridge; it cannot enable a different
chat's tools. No provider migration or new model credentials are needed. Other
providers receive a limitation notice instead of inaccessible tool instructions.

## Current scope

React `.tsx`/`.jsx` exports with statically resolvable string, number, boolean and
literal-union props. Default and named exports are supported. `children` enables
composition, and the reserved `Text` element exports escaped literal text without
adding a wrapper. Output is ordinary TSX, with no json-render runtime dependency in
the target project. Existing application behavior still needs ordinary source edits.

Discovery is bounded to 3,000 entries, 150 source files, 40 components and seven
nested directory levels; it skips symlinks, hidden directories, dependencies,
build outputs and tests. It reads at most 12 stylesheets and 35 CSS declarations
per sheet. Limits and unsupported required props are reported. It does not execute
project source, infer a complete design system or automatically resolve every
imported/conditional prop type. Components requiring callback/object adapters,
render props, dynamic JSON state/actions, named slots, server-only composition,
Svelte and other framework export are outside this first version. Read actual
usage before placing a component in a server/client boundary.

Strict export checks reject unknown components/props, nonliteral values, invalid
variants, cycles, missing/shared/unreachable nodes, unsupported children, hidden or
escaping output paths, and output replacing a component used by the composition.
The exporter returns an error for unsupported cases; the agent can explain the
limit and use ordinary editing. The on/off control is a generation preference,
not a restriction on the agent's existing general-purpose editing abilities.

## Verification

- `bun run test:project-ui`: static discovery, real React server rendering of
  generated source, escaping, invalid spec rejection, per-chat gating and settings.
- `bun run test:project-ui-settings`: actual Settings toggle, default-off behavior,
  persistence of both on and off across app restarts, screenshots.
- `test/praxis-agent-tools.mjs`: real Codex stdio/socket transport for both tools.
- `bun run test:project-ui-agent`: real Codex turn from Settings through tools,
  source integration and the project preview. Missing auth/usage availability is
  reported as a skip, not a pass.
