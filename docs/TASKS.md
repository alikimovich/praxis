# TASKS

Roadmap / next steps. Tick items as you finish them and log in PROGRESS.md.
Full narrative for shipped work lives in `docs/PROGRESS.md`.

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

## Health / infra (from the 2026-07-07 review)

Ranked by leverage. Deferred items note *why* they're not auto-completable.

- [ ] **Test runner to replace the package.json mega-chains.** `test` and `verify`
      are ~50-command `&&` chains, duplicated and already drifted. Add `test/run.mjs`
      with a tier manifest (unit / electron / live), keep-going with a pass/fail/skip
      summary, build-once. `"test"` = unit+electron, `"verify"` = all.
- [ ] **CI (there is none — no `.github/`).** Add `.github/workflows/ci.yml`:
      `bun install` → `bun run typecheck` → unit tier. Electron/live tiers later.
- [ ] **Lint/format tool.** Adopt Biome: config + `"lint"`/`"format"` scripts, wire
      into CI. Do the repo-wide `biome check --write` as its own separate commit.
- [ ] **Gemini backend has no SDK dep.** `backends/gemini.ts` is selectable via
      `pickProvider` but no Gemini SDK is in `dependencies`. Gate it out of the picker
      + mark experimental (safer), or add the dep + a self-skipping e2e test.
- [ ] **Branch cleanup.** Delete stale local branches (`agent/lkm-23` upstream-gone,
      `dsgn/v5-d-previous-agents` WIP).
- [ ] **Shared test harness.** 55 `.mjs` tests re-derive root + Playwright/Electron
      launch (~6.2k lines, much boilerplate). Add `test/lib/harness.mjs`
      (`launchApp`, `openFixture`, `shot`) and migrate opportunistically.
      *Deferred: large, migrate-when-touched, not a single-shot task.*
- [ ] **Split the god files.** `App.tsx` (1646), `styles.css` (1836), `props.ts`
      (1189), `simulator.ts` (1169), `store.ts` (981). Extract, don't append.
      *Deferred: high-risk refactor; needs the Electron UI running to verify, which
      isn't possible headless — do interactively with the app open.*
- [ ] **Finish the Praxis/dsgn naming decision.** GitHub repo is already `praxis`;
      local dir + `data-dsgn-source` attribute still say dsgn. Decide the blast
      radius (prose-only vs. attribute rename) and record it in CONTEXT.md.
      *Deferred: product decision, not a mechanical task.*
