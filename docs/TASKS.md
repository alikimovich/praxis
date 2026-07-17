# TASKS

Roadmap / next steps. Tick items as you finish them and log in PROGRESS.md.
Full narrative for shipped work lives in `docs/PROGRESS.md`.

## Vanilla HTML / static sites (2026-07-09, user-requested) — SHIPPED

- [x] **Open plain HTML/CSS/JS projects.** ✅ 2026-07-09 — `detect()` falls back
      to `framework:'static'` for folders with an HTML entry and no runnable dev
      command; a new in-process `src/main/static-server.ts` serves them (with
      live-reload). Anything un-auto-launchable now errors with "Enter a command
      to launch this project", which the preview error bar already turns into a
      custom-command retry. `test/static-serve.mjs`.

## v9 — in-tool code view  ⭐ (2026-07-03, user-requested) — SHIPPED

- [x] **Phase 1 — read-only code peek + open-in-editor.** ✅ 2026-07-03 — a "Code"
      toggle on the Inspector shows the stamped file (highlight.js, line-number
      gutter, element line-span marked, auto-scrolled to the stamp) via a new
      `source:read` IPC; `source:open-in-editor` jumps to `file:line:col` in
      code/cursor/zed/subl (fallback: OS default app). `test/code-peek.mjs`.
- [x] **Phase 2 — editable code drawer.** ✅ 2026-07-02 — CodeMirror 6 in a bottom
      drawer under the preview. Save (⌘S) routes through `source:write` →
      `commitEdit`, so undo/redo + HMR are free; a stale-baseline write is refused
      as a conflict. `test/code-drawer.mjs`.
      **Known limit:** the floating PropPanel overlaps the drawer's top-right in a
      narrow window — complementary but unaware of each other's inset.
- [x] **Phase 3 — pop the drawer out into its own window.** ✅ 2026-07-14 (LKM-48)
      — a pop-out button opens the editor in a standalone, freely-resizable
      `BrowserWindow` (same renderer bundle via `?dsgnEditor=1`, new `EditorWindow`
      entry + `CodeDrawer` `variant="window"`). One window per project root;
      re-focuses + retargets on a repeat pop-out. `source.popout/closeWindow/
      onNavigate` IPC. `test/code-drawer.mjs`.

## Per-chat worktree isolation (2026-07-16, concurrent-chat safety) — SHIPPED

- [x] **Isolate concurrent chats in per-repo worktrees.** ✅ 2026-07-16 —
      Every interactive chat on a git repo root gets its own long-lived worktree
      on branch `dsgn/chat-<id>`, created before `startSession` and removed on
      close. Turn edits commit to the worktree branch; on `done`/`error` they
      auto-merge to the live tree (the preview always serves live, never a
      worktree). Conflicts park on the branch for review via the existing
      `SessionReview` UI. `src/main/chat-worktrees.ts` (turn operations),
      `src/main/chat-isolation.ts` (lifecycle + crash recovery), extended
      `src/main/worktrees.ts` (C1 primitives), `test/chat-worktrees.mjs` (unit),
      `test/chat-isolation.mjs` (Electron).
- [x] **Parked-conflict UX — sidebar badge + AI "Resolve it".** ✅ 2026-07-16 —
      a parked live chat shows an amber "conflict" badge in the rail, and an
      in-chat `ConflictCard` explains the collision in plain language and offers
      **Resolve it** (the AI reconciles both sides — `stageResolve` re-lays the
      chat's diff onto the user's live tree, then either auto-merges cleanly with
      no turn or runs a resolution turn on the conflict markers) / **Discard
      changes**. New `agent.resolveConflict`/`discardConflict` IPC keyed by the
      active session; `src/renderer/src/components/ConflictCard.tsx`;
      `stageResolve` + `resolveParkedChat`/`discardParkedChat`; extended
      `test/chat-worktrees.mjs`.

## Health / infra (from the 2026-07-07 review)

Ranked by leverage. Deferred items note *why* they're not auto-completable.

- [x] **Test runner to replace the package.json mega-chains.** ✅ 2026-07-07 —
      `test/run.mjs` (`node test/run.mjs unit|electron|live|all`): keep-going,
      exit-0=pass (incl. e2e self-SKIP), builds once before the electron tier,
      summary table, non-zero exit on any failure. `test` = `unit electron`,
      `verify` = `all`; the ~40 `test:*` aliases are unchanged. Verified: unit
      tier 15/15 green.
- [x] **CI.** ✅ 2026-07-07 — `.github/workflows/ci.yml`: checkout → setup-bun
      1.3.x → `bun install --frozen-lockfile` → `bun run typecheck` →
      `node test/run.mjs unit`. Electron/live tiers left for a macOS runner (noted
      inline).
- [x] **Lint/format tool.** ✅ 2026-07-07 — Biome 2.5.2 (dev dep) + `biome.json`
      tuned to the existing style (2-space, single quotes, no semicolons, width
      100); `lint`/`format` scripts. The repo-wide `biome check --write` reformat
      is deliberately NOT done — run it as its own commit when ready.
- [x] **Gemini backend gated.** ✅ 2026-07-07 — `pickProvider` returns Claude for
      `provider:'gemini'` unless `DSGN_EXPERIMENTAL_GEMINI=1`; `gemini.ts` banner
      marks it experimental/unwired; removed from the renderer picker so it can't be
      silently selected. Add the SDK dep + a self-skipping e2e test to un-gate.
- [ ] **Shared test harness.** 55 `.mjs` tests re-derive root + Playwright/Electron
      launch (~6.2k lines, much boilerplate). Add `test/lib/harness.mjs`
      (`launchApp`, `openFixture`, `shot`) and migrate opportunistically.
      *Deferred: large, migrate-when-touched, not a single-shot task.*
- [ ] **Split the god files.** `App.tsx` (1646), `styles.css` (1836), `props.ts`
      (1189), `simulator.ts` (1169), `store.ts` (981). Extract, don't append.
      *Deferred: high-risk refactor; needs the Electron UI running to verify, which
      isn't possible headless — do interactively with the app open.*
- [ ] **Optional: rename the `dsgn` internals to Praxis.** The product and repo are
      Praxis, but the codebase still uses `dsgn` (the `data-dsgn-source` attribute,
      `DsgnApi`, `.dsgn/`). Renaming the attribute is a breaking change for stamped
      target repos, so it's a deliberate call, not a mechanical rename.
