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
chat's tools. The default Current chat model engine uses existing credentials. Other
providers receive a limitation notice instead of inaccessible tool instructions.

## Jev engine

Select **Settings → Use project components → UI composition engine → Jev**.
The engine is also saved per device and captured per submitted/queued message.
The normal chat model prepares atomic component candidates with concrete props and
copy; `typesafe-ai/jev` chooses membership, ordering and nesting through
json-render's experimental batch composer. It does not generate freeform TSX or
invent copy. Only a completed, validated tree is exported; errors or incomplete
results never silently fall back to the chat model.

Set `JEV_AI_GATEWAY_API_KEY` (or `AI_GATEWAY_API_KEY`) in the **Praxis process
environment**, then restart Praxis. This is a Vercel AI Gateway credential, separate
from the chat provider login. It stays in main; renderer state and tool results
never contain it. Requests send the UI prompt, prepared component descriptions and
candidate information to the Gateway. Do not place the credential in a target repo.
For development with an ignored, owner-only Praxis `.env.local`, Bun can explicitly
forward its loaded environment when launching, for example:

```sh
bun -e 'const p = Bun.spawn(["bun", "run", "dev"], {env: process.env, stdin: "inherit", stdout: "inherit", stderr: "inherit"}); process.exit(await p.exited)'
```

Each tool invocation is limited to 24 candidates, 32 KB input, two evaluations,
25 seconds overall and 10 seconds per request, with no automatic retries. Stop
cancels an active composition. Core/codegen are pinned to 0.21.0 because the Jev
API is experimental. Turning the feature off disables both engines for later turns.

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

- `bun run test:project-ui-jev`: offline real composer with a deterministic evaluator,
  candidate validation before requests, unavailable results, cancellation and engine preference.
- `bun run test:project-ui-jev-agent`: real Codex → Jev → source → native preview.
  Requires the Gateway key in the test process environment; checks successful Jev
  network evaluations, rather than inferring them from assistant text. The same Bun
  environment-forwarding command above can launch `node test/project-ui-jev-agent.mjs`.

The initial live smoke test composed Card + Text in one evaluation (641 ms,
615 input tokens). A second live check selected relevant content, omitted an
unrequested warning and corrected candidate ordering in two evaluations (624 ms,
1,502 input tokens). The Electron test independently verified a successful Jev call
and inspected the rendered page. This proves integration, not broad layout quality.
