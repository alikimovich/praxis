# CONTEXT — collapsed project state

> The handoff doc. Read this first to resume work (esp. on another machine).
> Last updated: 2026-06-23 (v2 first slice: click-to-select → source → chat).

## What dsgn is

An Electron app for AI-assisted design/prototyping **on your own repos**. Open a
folder → dsgn detects the framework, runs its dev server, and shows it live on
the right; a Claude chat on the left edits the running repo (hot-reload). Unlike
Figma Make / Claude Code's sandbox, it previews *your real repository* and
respects that repo's `CLAUDE.md` + skills.

Internal team tool, distributed as **source** (clone + run). Per-user Claude
subscription auth. Repo: `alikimovich/dsgn` (private).

## Locked decisions (and why)

- **Electron** (electron-vite + React + TypeScript). Chat left, preview right.
- **Agent core = Claude Agent SDK** in the main process (not ACP). Chosen because
  the product differentiator (custom tools wired to the renderer: select element →
  edit props → annotate → PR) needs in-process SDK tools. Pricing is NOT a factor —
  both run on the Claude subscription.
- **Preview = native `WebContentsView`** (not iframe), positioned by main via IPC
  geometry sync — so a preload can be injected into the previewed app for v2.
- **Styling: Tailwind v4 + shadcn/ui for the chat; plain CSS for the rest** (decision
  **reversed 2026-06-26**, was "plain CSS, no Tailwind/no UI kit"). The chat panel was
  migrated to Tailwind + shadcn/ui + AI Elements (v6); Tailwind coexists with the legacy
  `styles.css` (v4 layers utilities/preflight, legacy rules are unlayered and win). The
  app shell + element-inspector surfaces are still plain CSS (migrating incrementally).
  The zustand store stayed the seam — components are driven by `useChat`, **not** the
  Vercel AI SDK runtime.
- **Multi-framework prop editing** (React + Svelte) via per-extension adapters
  (`props.ts` dispatches `.svelte` → `props-svelte.ts`). Selection/tokens/ask-agent
  are framework-agnostic (they only need the `data-dsgn-source` stamp).
- **dsgn owns the dev-server lifecycle** (spawns + stops it; user must not also run
  `dev` manually for an opened project — port/lock clash). Killed on app quit.
- **Distribution: clone-and-run from source.** No signing/installer/auto-update.

## Current state (all building green)

**Chat UI (v6, 2026-06-26):** the chat panel runs on **Tailwind v4 + shadcn/ui +
AI Elements** (`<Conversation>` scroll, `<InputGroup>` composer, shadcn `<Button>`/cards),
driven by the same `useChat` store. Scaffold + components live under
`src/renderer/src/{lib,components/ui,components/ai-elements}`. See the v6 PROGRESS entry
for the shadcn-CLI / Tailwind-v4 / React-18 learnings.

Works: open folder → detect → spawn dev server (readiness-polled) → native preview;
multi-turn Agent SDK chat (cwd=repo, `settingSources` + `claude_code` preset so the
repo's CLAUDE.md/skills apply); markdown rendering; tool-use status lines; model
picker (live via `query.setModel`), thinking/effort selector, `/` skill menu (from
the SDK init message's `slash_commands`); drag-to-resize split; custom dev-command
escape hatch; Reload/Stop. Hardened per an adversarial review (session epoch guard,
sandboxed windows, preview navigation pinning, etc. — see PROGRESS.md).

**Tool permissions.** `canUseTool` surfaces approve/deny cards for gated tools and awaits
the user (read-only tools auto-allowed). A toolbar selector sets the SDK permission mode —
Ask (`default`) / Auto-accept edits (`acceptEdits`) / **Auto: approve all**
(`bypassPermissions`) — live via `query.setPermissionMode` and persisted at project-open.
Auto = genuine SDK bypass (no `canUseTool`, no cards).

**v2 (first slice) — click-to-select element editing.** A "Select" toggle arms an
overlay (a sandboxed preload injected into the preview `WebContentsView`): hover
highlights, click picks. The pick resolves a source location from the repo's
`data-dsgn-source` stamp (nearest ancestor; CSS-selector fallback) plus key computed
styles, and surfaces an inspector above the composer. "Ask dsgn to change this…" seeds
the chat with the element + source reference so the agent edits the right file. The
stamping convention + a reference Vite/Babel plugin are in `docs/DESIGN.md`.

**v2 prop editor.** The inspector's "Edit props" toggle reveals typed controls
(string/number/boolean/enum) built from the component's **react-docgen** schema + the
element's live attribute values (parsed from the source file at the stamp line). Edits
apply the **hybrid** way: simple literals are spliced straight into source (instant
hot-reload), complex values fall back to the agent. (`src/main/props.ts`.) Still ahead:
cross-file component schema resolution and design-token manifests.

**v3 engineer handoff.** Reviewer notes are pinned to elements and stored in
`<repo>/.dsgn/annotations.json` (the agent is denied writes under `.dsgn/`). Notes render as
numbered pins over the preview + a notes panel; **Publish PR** creates a branch, commits the
working changes + notes, and opens a GitHub PR via `gh` with a generated body.
(`src/main/annotations.ts`.)

## Verification status

- **Real agent turn: VERIFIED (2026-06-23).** `test/agent-e2e.mjs` ran a live Claude
  turn that opened the editable fixture and edited `index.html` — proving the full
  pipeline (open → dev server → agent → tool-use file edit) works AND that the Agent
  SDK's CLI subprocess spawns correctly inside Electron (the previously-flagged runtime
  risk is resolved). Re-run `bun run verify` on any machine with `claude login`; it
  SKIPs cleanly where no credentials exist.

## Key files

- `src/main/agent.ts` — Agent SDK session, `InputStream` queue, streaming → IPC,
  epoch guard, slash-commands, setModel, **permission gating** (`canUseTool` ↔ approve/deny
  cards, `setPermissionMode`). ESM SDK loaded via dynamic `import()`.
- `src/renderer/src/components/PermissionCards.tsx` — approve/deny cards; `usePermissions`
  store holds the mode + pending queue.
- `src/main/devserver.ts` — detect + spawn + URL parse + readiness + conflict errors.
  Detection also recognizes `expo`/`react-native` and tags `DetectedProject.previewKind`
  (`'web' | 'simulator'`), which routes the renderer to the dev-server vs simulator backend.
- `src/main/simulator.ts` — **iOS-Simulator preview (Phase 1, macOS-only)**, the RN/Expo
  counterpart to `devserver.ts`. `preflight()` (read-only, never throws) gates macOS+Xcode;
  `start()` boots a sim, starts Metro/launches the app (`expo run:ios`), and runs a local
  **"sim bridge"** HTTP server that captures the device via `xcrun simctl io screenshot` and
  serves it as **MJPEG** behind a one-`<img>` page flagged `?dsgnSim=1`. The existing preview
  `WebContentsView` loads that URL like any dev-server URL (all geometry/load/retry reused).
  `simulator:{preflight,start,stop}` IPC. Phases 2 (interaction via `idb`) + 3 (element-select
  via a `testID` Babel stamp + view-hierarchy hit-test → existing Inspector) are future work.
- `src/main/index.ts` — window, native preview view, geometry sync, hardening, **v2
  select-mode IPC** (relays picks; re-arms overlay after preview navigation).
- `src/preview/preload.ts` — **v2 overlay preload** injected into the preview view
  (hover highlight + click pick + source/style capture). Own `tsconfig.preview.json`.
  Also hosts the Figma-style inline modes: **C** comment-to-agent / **Y** annotation —
  a shadow-DOM composer anchored to the clicked element (comment → agent, annotation → pin).
- `src/renderer/src/components/ChatPanel.tsx` — chat UI, toolbar, slash menu, **inspector**.
- `src/renderer/src/components/Inspector.tsx` — **v2** selected-element card + chat hand-off
  + the "Edit props" toggle.
- `src/main/props.ts` — **prop editor engine** (React/JSX): babel-parse at the stamp line,
  react-docgen schema, hybrid literal-splice / agent-fallback apply (`props:inspect/apply`).
  Dispatches `.svelte` sources to `src/main/props-svelte.ts` (svelte/compiler — `export let` /
  `$props()` schema, same splice/apply contract). Svelte components have no DOM node, so a host
  element clicked inside a component *definition* surfaces that file's own props (option D); such
  prop edits route to the agent as a default change. Per-instance mapping (option C) is a follow-up. Inline text edits (`text:apply`) splice the
  element's text content for both JSX and `.svelte` (`applySvelteTextEdit`), agent-fallback for
  expression/mixed content.
- `src/renderer/src/components/PropEditor.tsx` — typed prop controls rendered from the inspection.
- `src/main/tokens.ts` — **design-token detection**: probes `.dsgn/tokens.json` → tailwind
  config (static parse) → CSS custom properties; `tokens:detect`. Palette in `TokenPalette.tsx`.
  `tokens:scaffold` writes a starter `.dsgn/tokens.json` for token-less projects (offered on open
  via `TokenOfferCard`; never shadows a live source or clobbers a manifest).
- `src/main/setup.ts` — **framework-aware project setup**: `detect()` reads `package.json` deps
  FIRST, then `setup:scaffold` writes the right dev-only instrumentation into `.dsgn/` — a Babel
  JSX plugin (`dsgn-source.cjs`, React/Solid) or a `svelte/compiler` markup preprocessor
  (`dsgn-svelte-stamp.mjs`, Svelte); Vue uses its own inspector (no file), unknown writes nothing.
  Helpers are dev-gated + idempotent; `setup:uninstall` removes them (+ the legacy root plugin).
  `acceptSetup` (ChatPanel) sends framework-correct wiring/prop-typing instructions; when that turn
  finishes, App `restartPreview()` restarts the dev server (config is only read at boot) + reloads
  the preview, and the post-restart readiness report verifies stamps actually fired. `SetupCard.tsx`
  is the offer.
- `src/renderer/src/components/PropPanel.tsx` — **floating prop panel** (gated on a resolved
  schema; reserves the preview's right edge via `preview.setPanelInset`).
- `src/main/annotations.ts` — **v3** annotation sidecar CRUD + Publish→PR (git/gh via execFile).
- `src/renderer/src/components/NotesPanel.tsx` — **v3** notes list + Publish; `useAnnotations` store.
- `src/renderer/src/store.ts` — `useChat` + `useSession` + **`useSelection`**; `isAuthError`;
  exposes `window.__dsgnStore/__dsgnSession/__dsgnSelection` for the test harness.
- `src/shared/api.ts` — the IPC contract incl. `SelectedElement` (keep preload + handlers in sync).
- `docs/DESIGN.md` — the `data-dsgn-source` convention + reference stamping plugin.

## Gotchas

- Agent SDK is ESM-only; `main` is CJS → dynamic `import()` only.
- Native `WebContentsView` is a separate CDP target — not in renderer screenshots
  (use `capturePage()`); it also eats mouse events (hidden during resize drag). To
  drive it from a test, reach it via the main process
  (`webContents.executeJavaScript`), as `test/select-element.mjs` does.
- A renderer DOM panel can't float **above** the native preview view (native views
  render over the page). The floating prop panel instead reserves a right-edge strip
  via `preview.setPanelInset`, shrinking the native bounds while it's open.
- Prop editing is **gated** on `PropInspection.hasSchema` (a resolved react-docgen
  schema). Unready components are prompt-only; the on-open setup offer fixes them.
- The preview overlay preload is **sandboxed** — it only uses `ipcRenderer` (no Node,
  no contextBridge) and shares the page DOM (overlay lives in a shadow root with
  `pointer-events:none`). It runs fresh on every navigation, so main re-sends the
  current select-mode on `did-finish-load`.
- bun blocks postinstall for untrusted deps — `electron`/`esbuild` are in
  `trustedDependencies` so their binaries install.
