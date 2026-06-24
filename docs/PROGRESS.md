# PROGRESS LOG

Newest first. Append a dated entry when you finish a chunk of work.

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
