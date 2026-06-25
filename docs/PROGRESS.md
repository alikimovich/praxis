# PROGRESS LOG

Newest first. Append a dated entry when you finish a chunk of work.

## 2026-06-24 — Framework-aware setup (detect before generating)

- Fixed the core setup bug: dsgn assumed React and wrote a Babel JSX plugin
  (`dsgn-source-plugin.cjs`) to the repo **root** of any project — useless in a
  SvelteKit repo (no Babel pass, no JSX) and it would have reported success
  anyway. Setup is now **framework-first**.
- `src/main/setup.ts` `detect()` reads `package.json` deps **first** and branches:
  `@sveltejs/kit`/`svelte` → Svelte (markup-preprocessor strategy, with
  `svelteMajor`), `react`/`@vitejs/plugin-react(-swc)`/`next` → React (Babel
  plugin), `solid-js` → Solid (Babel — also JSX), `vue` → Vue (inspector
  strategy, **no bespoke file** — reuse its ecosystem), else `unknown` → none.
- Artifacts are **scoped to `.dsgn/`** (not the repo root): `.dsgn/dsgn-source.cjs`
  (React/Solid) or `.dsgn/dsgn-svelte-stamp.mjs` (Svelte preprocessor using
  `svelte/compiler`, 1-based line / 0-based col to match `props-svelte.ts`). Both
  are **structurally dev-gated** (`NODE_ENV === 'production'` → empty visitor /
  no-op), idempotent, and removable via a new `setup:uninstall` (also sweeps the
  legacy root plugin).
- `acceptSetup` now builds **framework-correct** agent instructions (React
  `interface Props`, Svelte 5 `$props()` vs Svelte 4 `export let`, Vue
  `defineProps<Props>()`) and **stops with a clear message** for unknown/Vue
  rather than handing React steps to a non-React repo.
- **Verification (no silent success):** `acceptSetup` arms `verifying`; the next
  readiness report confirms stamps fired — `>0` → "Setup verified", `0` → a hard
  warning that the instrumentation didn't fire.
- New `test/setup-detect.mjs`: per-framework detect/scaffold/uninstall, idempotency,
  dev-gating, legacy-cleanup — through real IPC. `ready-gating.mjs` updated to the
  `.dsgn/` path. `SetupResult` reshaped (`framework: Frontend`, `strategy`,
  `svelteMajor`, `files[]`; dropped `pluginFile`).

## 2026-06-24 — Preview runs on its own free port (7777+), bound to 127.0.0.1

- dsgn now **always spawns the dev server on a free port it picks** (first free at/above
  7777) **bound to 127.0.0.1**, via `--port/--host` flags (vite/sveltekit/next) or
  `PORT`/`HOST` env (CRA/unknown). This kills the framework-default collisions
  (5173/3000), the IPv4/IPv6 `localhost` mismatch, and the attach-to-a-stale-server
  confusion in one move — the attach-on-open probe is dropped (always a fresh,
  isolated server).
- **Not 6666:** the IRC ports (6665-6669, 6679, 6697) are on the browser/WHATWG-fetch
  blocked-ports list, so Chromium AND the Node `fetch` readiness probe refuse them —
  a preview there can't load even though the server binds (curl works, which masked it).
  `findFreePort` skips the whole blocked-ports list; base is 7777.
- Readiness now probes the assigned port directly (primary) with the printed-URL parse
  as fallback. `findFreePort`/`isPortFree`/`BLOCKED_PORTS` unit-tested; open-preview
  asserts the preview lands on a port ≥ 7777. `bun run verify` green (13 tests).

## 2026-06-24 — Stop the in-flight agent turn + setup streams progress

- A **Stop** affordance interrupts the running agent turn (`agent.interrupt()` → the
  SDK emits `result`→`done`, clearing `isRunning` and any setup `busy`).
- The on-open **Setup** card now streams its agent turn into the chat (so you can
  watch and stop it) and is guarded: `busy` stays true until the turn finishes
  (cleared by the `done`/`error` handler), a scaffold failure clears `busy`, and
  it won't re-trigger while a turn is running. `verify` green (13 tests).

## 2026-06-24 — Inline text editing

- **Double-click a stamped, text-only element in the preview** (in Select mode) to edit its
  text in place; Enter/blur writes the new text straight to source, Escape cancels.
- Engine (`applyTextEdit` in `props.ts`): finds the JSX element at the stamp, and when its
  children are plain text (a single JSXText, or empty) and the new text is splice-safe
  (`/^[^<>{}]*$/`), rewrites the text child in source preserving leading/trailing whitespace.
  Expression/mixed content (`{title}`, nested elements), self-closing elements, or `.svelte`
  files fall back to the agent (`needsAgent`).
- Wiring: the preview preload drives the inline `contentEditable` edit and emits the commit;
  main relays it (sender-checked) to the renderer, which applies via `text:apply` with the
  current project root (agent-seeds on `needsAgent`).
- `test/text-edit.mjs`: a plain-text `<h1>` is rewritten in source; an expression child
  (`{props.label}`) → agent. ✅ `bun run verify` green.
- **Adversarial review (5 findings, all fixed):** the `editing` flag could strand select mode —
  now `setActive(false)` and `pagehide` end the edit, and a detached node self-heals on the next
  mouse move (HMR mid-edit); a write failure now routes the edit to the agent instead of being
  silently dropped; surrounding whitespace is derived from the raw source (so `&nbsp;` etc. aren't
  rewritten as literal bytes) with the all-whitespace overlap zeroed.

## 2026-06-24 — Activity console (visibility into the open-project flow)

- A collapsible **Activity console** (titlebar "Logs" toggle) shows the whole open
  sequence with timestamps: detect result, attach-vs-spawn decision, raw dev-server
  output, readiness, preview load, agent session start, Ready — and any error
  (errors auto-open it). Docked full-width above the panes; the native preview
  reflows via its ResizeObserver. `useLog` store (capped at 500 lines) +
  `ConsolePanel.tsx`; `App.attempt` emits the step lines, `devserver:log` feeds the
  raw output. Also strips the ANSI codes (so the URL line reads cleanly). This is
  the trail that would've made the lkmv.ch hang obvious at a glance.
- Gave the "Open project" button a `btn--open` class — adding the "Logs" `btn` made
  `.btn` ambiguous and broke the tests' open-click. open-preview now also asserts the
  console captured Detected/Dev server/Preview loaded/Ready. `bun run verify` green (12 tests).

## 2026-06-23 — Readiness gating, floating prop panel, on-open setup

A project that isn't dsgn-ready no longer pretends to be editable — and dsgn offers to fix it.

- **Gating**: prop editing is now gated on a resolved react-docgen schema (`PropInspection.hasSchema`).
  Selecting an element auto-inspects (App effect, race-guarded by source); a schema-backed
  component opens the editor, an unready one (host element / untyped / unstamped) shows a
  prompt-only hint with a "set up the project" link.
- **Floating prop panel** (`PropPanel.tsx`): the editor moved out of the chat to a panel on the
  preview's right edge — component name, source, and every prop with a typed control + its
  description. Because the preview is a *native* view (DOM can't float above it), the panel
  reserves a right-edge strip via `preview.setPanelInset` and the native bounds shrink while
  it's open.
- **On-open setup** (`SetupCard` + `src/main/setup.ts`): the preview preload reports whether
  the app is source-stamped; if not, dsgn posts a chat offer to set it up. Accept → dsgn writes
  the dev-only stamping Babel plugin deterministically, then asks the agent to wire it in and
  type the components (the hybrid).
- New `test/ready-gating.mjs`: scaffold writes the plugin (idempotent), a no-schema element is
  prompt-only (no panel), a schema-backed one opens the panel, and the offer renders.
  ✅ `bun run verify` green (10 tests).
- **Adversarial review (4 findings, all fixed):** dismissing the offer no longer blanks the
  chat (dismiss clears `needed`); the readiness probe re-samples (600/1500/3000ms) so a slow
  SPA isn't falsely flagged; `acceptSetup` is try/finally so busy can't stick; the gating test
  now also asserts the positive panel case. No safety issues in the scaffold or preview-bounds.

## 2026-06-23 — Dev-server: attach-to-running + IPv4/IPv6-safe preview

Fixes "opening a project I already run doesn't work" (hit on lkmv.ch):

- **Attach instead of duplicate.** If the project's dev server is already serving
  (probe the known framework's default port — Vite/SvelteKit 5173, Next/CRA 3000 —
  on both 127.0.0.1 and [::1], require status < 400), dsgn previews THAT instead of
  spawning a competitor. Two dev servers on one project clash (e.g. SvelteKit's
  `.svelte-kit/`) and the duplicate 500s. Only known frameworks attach; 'unknown'
  always spawns (so it never grabs an unrelated app on 5173/3000). Attached servers
  aren't owned, so Stop/quit won't kill them.
- **IPv4/IPv6-safe URLs.** A spawned `vite dev` often binds IPv6-only (`[::1]`) while
  the preview resolves `localhost` to IPv4 (`127.0.0.1`) → blank preview. The runner
  now resolves the printed URL to whichever concrete loopback actually answers and
  loads that.
- **Moved dsgn's own renderer off 5173** (→ 5180) so it stops colliding with every
  Vite/SvelteKit project's default port.
- Extracted pure helpers to `src/main/devserver-net.ts` with a unit test
  (`test/devserver-net.mjs`): host variants, attach policy (unknown → no probe,
  500 → don't attach, IPv6 fallback). `bun run verify` green (11 tests; open-preview
  now serves over 127.0.0.1). Updated tests that hardcoded `localhost`.

## 2026-06-23 — Svelte / SvelteKit support (prop editing → framework-agnostic)

- Prop editing is now **framework-agnostic by dispatch**: `props.ts` routes by
  source extension — `.svelte` → new `src/main/props-svelte.ts`, everything else →
  the unchanged React/JSX engine. Both share helpers (resolveSource, mergeFields,
  withinRoot, isValidAttrName) and return identical PropInspection/PropEditResult.
- `props-svelte.ts` parses with `svelte/compiler` (ESM, dynamic-imported): finds
  the element at line:col, reads literal attributes, resolves a component schema
  cross-file from `export let` (Svelte 4) or `$props()` + `interface Props` (Svelte 5),
  and applies literal edits by splicing the `.svelte` source.
- Added a **Svelte stamping recipe** to `docs/DESIGN.md`. Test
  `test/prop-edit-svelte.mjs` (svelte-app fixture) covers the cross-file `$props` schema,
  literal apply, host attrs, and same-line/column disambiguation.
- **Adversarial review (1 real bug, fixed):** `resolveSource`'s greedy regex parsed
  `"path:line:col"` as `file="path:line", line=col` — a latent bug on the shared path.
  Now non-greedy; plus a defense-in-depth attr-name re-validation in `applySvelteEdit`.

## 2026-06-23 — Design-token detection + palette

- `src/main/tokens.ts` auto-detects a project's design tokens, probing three sources in
  priority order so the right one is chosen per repo: **`.dsgn/tokens.json`** manifest →
  **`tailwind.config.*`** (parsed *statically* with babel — literal theme values only, the
  config is never executed) → **CSS custom properties** (a depth/file-bounded scan of the
  repo's CSS, grouped by name prefix). First source with tokens wins.
- Renderer: tokens load on project open into `useTokens`; the inspector gains a "Tokens"
  toggle showing the detected palette (swatches for colors, the source labeled). Clicking a
  token seeds the chat to apply it to the selected element — reusing the agent path rather
  than a fragile per-framework style editor.
- `test/tokens.mjs` proves the priority (manifest wins over a present Tailwind config) and
  each parser (nested Tailwind colors flatten, CSS `var()` aliases skipped) through real IPC,
  plus the palette UI. ✅ `bun run verify` green (8 tests).
- **Adversarial review (7 verified findings, all fixed):**
  - **Tailwind parser correctness** (the two that justified gating the merge): `theme.extend`
    tokens were dropped whenever a base category also existed (the most common Tailwind
    pattern), and the theme search matched *any* nested `theme:` (a plugin/preset could leak
    bogus tokens). Now scoped to the config's actual export and merges base + extend (extend
    wins). Both locked with fixture regression tests.
  - **Prompt-injection regression**: the token-apply path interpolated raw page-derived
    element fields, bypassing the `oneLine` sanitizer used everywhere else — now routed
    through it (+ bounded token name/value); tested with an injected-newline id.
  - Token detect is guarded against a project-switch race; `isColor` covers named colors /
    gradients (via `CSS.supports`); the palette caps tokens per group; tests cover the
    `source: 'none'` state and the seeded-prompt contract.

## 2026-06-23 — Cross-file prop-schema resolution

- The prop editor now resolves a component's schema even when it's imported from another
  file: if there's no same-file react-docgen match, `props.ts` finds the component's relative
  import in the usage file, resolves the module path (tries `.tsx/.ts/.jsx/.js` + `/index`,
  refusing anything outside the project root), and runs react-docgen on the definition file.
- Matches on the **exported** name from the import (`{ Button as B }` → `Button`), so a
  re-export barrel that also defines another component can't mis-attach its schema
  (flagged + fixed in review). Edits still target the usage site, never the definition.
- `test/prop-edit.mjs` extended: `<Button>` used in `Card.tsx` but defined in `Button.tsx`
  resolves Button's enum/string schema with the live usage value. ✅ `bun run verify` green.

## 2026-06-23 — v3 engineer handoff: annotations + Publish→PR

- **Annotations sidecar** (`src/main/annotations.ts`): reviewer notes pinned to elements,
  stored in `<repo>/.dsgn/annotations.json` (list/add/remove via IPC). The agent is denied
  writes anywhere under `.dsgn/` (a guard in `agent.ts` `canUseTool`), so it can't clobber
  the handoff.
- **Pins**: the preview preload draws numbered pins over annotated elements (located by
  selector, repositioned on scroll/resize/HMR); clicking a pin focuses its note in the panel.
- **Renderer**: `useAnnotations` store; an "Add note" composer in the inspector; a
  `NotesPanel` listing notes (with delete) and a **Publish PR** button. Notes load on open,
  pins stay in sync, both clear on project switch/stop.
- **Publish** (`publishToPr`): creates a branch, commits the working changes + notes, pushes,
  and `gh pr create`s with a generated body (notes as a checklist + changed files). Args go
  through `execFile` (no shell). Common failures (no gh / no remote / nothing to publish) are
  surfaced.
- Test `test/annotations.mjs` drives the flow through real IPC: a note saved via the inspector
  persists to the `.dsgn` sidecar, shows in the panel, and removes cleanly. ✅ `bun run verify`
  green (7 tests).
- **Adversarial review (14 verified findings, all fixed):**
  - **Publish was unsafe** — `git add -A` swept the whole working tree (unrelated WIP /
    untracked secrets) into the PR. Now: pre-flight gates (is-repo, not detached, has origin,
    gh present) before any mutation; stage only tracked changes + the `.dsgn` sidecar
    (`add -u`, no untracked sweep); roll back to the original branch on failure (and report
    where the work landed if already committed); clean changed-file list via
    `diff --name-only HEAD` (no porcelain rename-arrow / quoting bugs).
  - The `.dsgn` guard now also blocks **Bash** commands touching the sidecar (was edit-tools
    only; noted that Auto/bypass mode skips `canUseTool` entirely).
  - Annotation writes are serialized (promise-chain mutex) + atomic (tmp + rename), so
    concurrent add/remove can't lose a note and a crash can't truncate the file.
  - `buildPrBody` extracted to a pure `src/shared/pr-body.ts` with a unit test (escapes
    backticks, caps the file list, flattens newlines).
  - Renderer: a failed note save keeps the text (no silent loss); pin-focus scrolls the note
    into view; publish state resets on project switch; pins build once and only reposition
    (no per-scroll churn); the pin interval is cleared on pagehide.

## 2026-06-23 — Prop/token editor (react-docgen + hybrid apply)

- `src/main/props.ts`: given an element's `data-dsgn-source` ("relpath:line"), parse the
  source file with `@babel/parser`, find the JSX element on that line, read its current
  literal attributes, and run **react-docgen** (FindAllDefinitions resolver) for the
  component's prop schema (types, enums, required, descriptions). Both deps are ESM-only,
  so they're dynamic-`import()`ed like the Agent SDK.
- **Hybrid apply**: simple literal props (string/number/boolean/enum) are written straight
  to source via a targeted string splice (formatting-preserving, no codegen dep) → the dev
  server hot-reloads; non-literal/`other` values return `needsAgent` and the renderer seeds
  the agent instead. Path is hardened: `resolveSource` rejects absolute paths and anything
  resolving outside the project root.
- Renderer: an "Edit props" toggle in the inspector reveals `PropEditor`, which renders
  typed controls (text/number/checkbox/enum-select) from the inspection and applies on
  change/blur; `useSession.projectRoot` carries the root needed to resolve sources.
- Test `test/prop-edit.mjs` drives the engine through real IPC (no dev server/auth):
  inspect resolves the schema + live values, apply writes `variant="warn"` to the fixture,
  and the UI renders the typed rows. ✅ `bun run verify` green; also hardened the
  select-element test's retry budget against load-induced flake.
- **Adversarial review (5 verified findings, all fixed):**
  - **Same-line elements** (`<Badge>` inline in an `<li>`/`<p>`) resolved to the *wrong*
    element — the exact-line match returned the first/outermost. Now column-aware (the stamp
    plugin emits `line:col`) and, without a column, picks the innermost element on the line.
    Regression-tested.
  - **Prop-name injection**: an unvalidated name was spliced raw into source. Names are now
    validated against an attribute-name allowlist at every layer (schema, current attrs, and
    the apply IPC boundary).
  - **Wrong schema** attached to imported child components (the `docs[0]` fallback) — now only
    falls back for an anonymous single component, else shows the "no schema" note.
  - Failed applies are **surfaced** in the editor (and the control resets to the file value)
    instead of silently dropping. `projectRoot` is cleared on project (re)open.

## 2026-06-23 — Permission approve/deny cards + Auto mode (SDK)

- `canUseTool` (main) now drives a real approval flow: for any tool the SDK gates, it emits
  a `permission-request` and awaits the user's decision via a per-session pending map,
  resolving the SDK callback on allow/deny — and denying cleanly on abort / epoch change /
  session replace / quit so a torn-down turn never leaves the SDK blocked. Read-only tools
  (Read/Glob/Grep/LS/NotebookRead) are auto-allowed so "Ask" mode stays usable.
- **Permission-mode selector** in the toolbar → `query.setPermissionMode` live, mode also
  passed at project-open so it sticks: **Ask** (`default`), **Auto-accept edits**
  (`acceptEdits`), **Auto: approve all** (`bypassPermissions`). "Auto" is genuine SDK
  bypass — under it the SDK never calls `canUseTool`, so no cards appear.
- Renderer: `usePermissions` store (mode + pending queue, deduped by id); `PermissionCards`
  renders approve/deny cards above the composer; App routes `permission-request`/`-resolved`
  events. `chat-render` test seeds a card, approves it, and asserts the three modes incl.
  `bypassPermissions`. ✅ `bun run verify` green.
- **Adversarial review (8 verified findings, all fixed):**
  - **`bypassPermissions` needs `allowDangerouslySkipPermissions: true`** in the query options
    or the CLI refuses to bypass — so "Auto" silently still prompted. Added the ack flag
    (only takes effect when the user picks Auto; default stays Ask). `agent-e2e` now opens in
    Auto, which both unblocks the unattended edit and live-verifies real bypass.
  - Switching to a more-permissive mode now **releases prompts already on screen** (drains
    `pending` as allow + emits `permission-resolved`); opening another project clears stale
    cards; `set-permission-mode` awaits the SDK before committing, and the toolbar reverts if
    the SDK refuses. `interrupt` drains pending so cards can't orphan. Status line emits only
    after the abort/epoch gate. Each pending now tracks its tool name (for acceptEdits).

## 2026-06-23 — v2 adversarial review + hardening

- Ran a multi-agent review workflow over the v2 diff (security/IPC, lifecycle, renderer/UX,
  test integrity); 11 verified findings, all fixed:
  - **Untrusted page input**: the previewed page controls every picked-element field.
    `describeSelectionForPrompt` now strips control chars/newlines (an injected
    `data-dsgn-source` can't open a new instruction paragraph), validates `source` to a
    `path:line` shape, and caps lengths (code-point/surrogate-safe); the preload also caps
    every field at capture. Full tool-approval gating is still the tracked roadmap item
    (permission cards) — the auto-approving agent is the real backstop to add next.
  - **Forged picks**: the preload now ignores non-`isTrusted` events, so a hostile page
    can't synthesize a click to inject a pick. The test correspondingly switched to a
    *trusted* `webContents.sendInputEvent` click (more faithful than synthetic dispatch).
  - **Stale selection**: opening another project now disarms select mode + clears the pick
    (was leaking a previous repo's source path into the composer); Escape-cancel clears the
    pick too.
  - **Auth banner** now auto-clears once the agent makes progress (was stuck until manually
    dismissed even after the user fixed auth).
  - **Lifecycle**: overlay re-arm is URL-gated (no crosshair on the "no project" placeholder)
    and `preview:reset` clears `selectModeActive` so main/renderer can't desync.
  - **Dead CSS**: `.btn--active` was shadowed by the later base `.btn` rule (equal
    specificity, source order) — the active toggle never rendered blue. Fixed via
    `.btn.btn--active`; the select test now asserts the active background is blue so it
    can't silently regress.

## 2026-06-23 — v2 first slice: click-to-select → source → chat

- **Select overlay** (`src/preview/preload.ts`): a sandboxed preload injected into the
  preview `WebContentsView`. Shadow-DOM hover highlight + click pick; captures tag,
  short CSS path, `data-dsgn-source` stamp (nearest-ancestor), text, rect, and a curated
  set of computed styles. Escape exits select mode. Built as a second preload entry
  (`electron.vite.config.ts` rollup input → `out/preload/preview.js`).
- **IPC**: renderer → main → preview `preview:set-select-mode`; preview → main → renderer
  `preview:element-picked` / `select-cancelled`, with a sender check so only the preview
  view can emit picks. Select mode is re-armed after each preview navigation.
- **UI**: a "Select" toggle in the titlebar (running only), an `Inspector` card above the
  composer (tag, resolved source or "no stamp" note, style chips), and a one-click
  "Ask dsgn to change this…" that seeds the composer with the element + source reference
  so the agent edits the right place. New `useSelection` store.
- **Convention**: `docs/DESIGN.md` documents the `data-dsgn-source` stamp + a reference
  Vite/Babel plugin (dev-only). Shared `SelectedElement` type so preload + renderer can't
  drift; added `tsconfig.preview.json` so the preview preload is type-checked.
- **Polish — first-run auth onboarding**: `isAuthError` heuristic flips an amber banner
  pointing at `claude setup-token` instead of burying a raw 401 in chat.
- **Tests**: `test/select-element.mjs` drives the full path (open fixture → enable select →
  dispatch a click in the preview webContents → assert inspector + source → assert composer
  hand-off) against a new `selectable-app` fixture; `chat-render` now also asserts the auth
  banner. ✅ `bun run verify` green (smoke, open-preview, chat-render, select-element);
  agent-e2e SKIPs cleanly without creds. Artifacts `06`/`07`/`08`.

## 2026-06-23 — Logging, cross-machine handoff, self-testing

- Added `CLAUDE.md` + `docs/{CONTEXT,PROGRESS,TASKS}.md` so progress/context/tasks
  live in-repo and travel via git (continue on any machine after `git pull`).
- Added `test/agent-e2e.mjs`: a REAL Claude turn that opens an editable fixture,
  asks the agent to change a heading, and asserts the file changed. SKIPs without
  auth, FAILs if the turn ran but didn't edit. Added `bun run verify`.
- ✅ Ran `bun run verify` with credentials present: **AGENT-E2E OK** — the agent
  edited the fixture via a live turn. Confirms end-to-end agent works and the SDK
  CLI subprocess spawns correctly inside Electron (prior runtime risk resolved).

## 2026-06-23 — Adversarial review fixes

- Ran a multi-agent review workflow (15 verified findings); fixed: session
  epoch-guard (no stale events across project switches), composer-stuck-on-switch,
  `sandbox:true` on main + preview windows, preview hardening (window-open handler +
  will-navigate origin pin + validate `preview:load` is local http(s)), per-outage
  retry reset, resize-drag release on blur/visibilitychange, `/` menu Escape re-arm,
  CSP `object-src`/`base-uri`.

## 2026-06-22/23 — Chat upgrade + controls + UX

- Markdown rendering (react-markdown + remark-gfm + rehype-highlight, hand-written
  hljs theme, plain CSS).
- Composer toolbar: model picker (live `setModel`), thinking/effort selector,
  `/` skill menu from the SDK init `slash_commands`.
- Drag-to-resize split (hides native preview during drag). Custom dev-command
  escape hatch on launch failure; Reload/Stop controls.

## 2026-06-22 — Real Agent SDK chat

- Wired `@anthropic-ai/claude-agent-sdk` (ESM, dynamic import): persistent
  multi-turn `query()`, cwd=repo, `settingSources` + `claude_code` preset,
  streaming deltas + tool status over IPC, `canUseTool` auto-approve.
- Fixed ESM-in-CJS crash; preview readiness polling + retry for `ERR_EMPTY_RESPONSE`;
  dev-server ownership + cleanup-on-quit + conflict errors.

## 2026-06-22 — Scaffold + preview + tests

- electron-vite + React + TS shell; two-pane layout; native `WebContentsView`
  preview with IPC geometry sync; typed `window.api`; dev-server runner
  (detect/spawn/parse/readiness). Playwright+Electron smoke + open→preview tests.
- Made dsgn its own git repo (was an untracked subdir of `~/.git`).
