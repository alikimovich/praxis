# PROGRESS LOG

Newest first. Append a dated entry when you finish a chunk of work.

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
