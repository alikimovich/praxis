# TASKS — archive

Completed milestones and dropped work, moved out of `docs/TASKS.md` on 2026-07-02
to keep the active roadmap focused on **v9**. Full narrative detail lives in
`docs/PROGRESS.md`; this file is the checklist history + the record of what was
deliberately dropped.

---

## Dropped (not pursuing — 2026-07-02)

Removed from the active roadmap by user decision. Recorded here so they aren't
silently forgotten or re-raised. Re-add to `TASKS.md` if priorities change.

- **All of v7 (multi-provider backends).** Codex/Gemini/Grok work is parked. The
  shipped v7 seam (`src/main/backends/`, `pickProvider`, the Backend picker,
  the Gemini adapter) stays in the codebase; we're just not pushing it further.
  - `[~]` Make Codex real (needed `codex login` + approval→permission-card mapping).
  - `[ ]` Grok Build CLI provider.
  - `[ ]` Make a non-Claude backend real (install CLI + log in + verify live turn).
  - `[ ]` Minor open calls (provider-after-Codex, per-agent conventions files, v0 `/generate`).
- **v6 leftovers.**
  - `[~]` Stretch: further AI Elements (Sources / Web Preview) — no current fit.
  - `[ ]` Optional test modernization (`data-testid`s, native → shadcn `Select`).
- **Deferred Svelte + blocked polish.**
  - `[ ]` Svelte per-instance prop editing (option C) — needs unstable Svelte 5 internals.
  - `[ ]` Live thinking-level changes — SDK-blocked (no live effort setter).
  - `[ ]` Revisit assistant-ui — store seam stays ready if it ever comes back.

---

## Now / next (shipped)

- [x] **Verify a real agent turn.** ✅ 2026-06-23 — `bun run verify` → AGENT-E2E OK
      (agent edited the fixture; SDK subprocess spawns fine in Electron).
- [x] **v2 first slice: click-to-select → source → chat.** ✅ 2026-06-23 — overlay
      preload, inspector, `data-dsgn-source` resolution, composer hand-off; covered by
      `test/select-element.mjs`.
- [x] **Polish: cross-file prop resolution + design-token manifests.** ✅ 2026-06-23 — both
      shipped (see the v2 section); direct agent-free token apply followed in v6 (#32/#35–37).

## v8 — direct manipulation & dsgn agent rules (shipped 2026-06-27)

Push edits onto the canvas (direct, instant, reversible) instead of through chat;
run comment-work in parallel; and give the agent a versioned set of operating
**rules**. Full design in `docs/PLAN-direct-editing.md`.

- [x] **R1 — "scope of an element edit" rule.** ✅ (PR #41) — `src/main/rules.ts`
      (pure, versioned `dsgnRules()` builder; `DSGN_RULES_VERSION`). Injected via the Claude
      preset `append`; Codex + Gemini prepend it to the first turn. `test/rules.mjs`.
- [x] **F3a — resolve selection to the component INSTANCE (core).** ✅ (PR #42) —
      React stamp plugin emits `data-dsgn-component-source` on component-tag JSX, UNSHIFTED;
      `preload.findComponentSource` walks up; Inspector "↑ Edit the owning component instance".
      `select-element.mjs` + `setup-detect.mjs`.
- [x] **F2 — broaden direct editing.** ✅ — schema defaults + reset-to-default; `props.remove`
      IPC (`removeProp`/`removeSvelteProp`). `prop-edit.mjs` + `prop-edit-svelte.mjs`.
- [x] **F3b — undo/redo for ALL dsgn source edits** (Cmd+Z/Shift+Z/Y). ✅ —
      `src/main/edit-history.ts`; every direct apply routes through `commitEdit`;
      coalescing, on-disk conflict detection, per-project-root stacks. `edit-history.mjs`.
- [x] **F1 — comment → parallel agent session.** ✅ (all 4 phases) — worktree-per-spawn:
      each comment runs a detached agent in its own `git worktree` on `dsgn/comment-<id>`.
      - [x] Phase 0 — worktree engine (`src/main/worktrees.ts` + `test/worktrees.mjs`).
      - [x] Phase 1 — spawn slice (`SpawnContext`, `agent:spawn-comment`, `useSpawns`, rail row).
      - [x] Phase 2 — Apply / PR / Discard (`branchPatch`, `agent:spawn-apply/-discard/-pr`).
      - [x] Phase 3 — scale + safety (per-repo cap + FIFO queue, `agent:spawn-interrupt`, orphan-prune).

## v4 — React Native / iOS-Simulator preview (macOS-only, shipped 2026-06-25→27)

- [x] **Phase 1 — view-only live mirror.** ✅ 2026-06-25 — detect `expo`/`react-native`,
      `simulator.preflight()`, MJPEG "sim bridge" loaded in the `WebContentsView`.
      Tests: `sim-detect`, `sim-preflight`, `sim-frame`, `sim-e2e` (macOS-gated).
- [x] **Phase 2 — interaction.** ✅ (PR #38) — bridge captures tap/swipe/scroll/type →
      `/control` → `idb ui …`. `idb` optional (degrades to view-only). `test/sim-control.mjs`.
      **Fixed 2026-07-02:** `--udid` arg order + stale idb_companion auto-recovery + `idbHealthy()`.
- [x] **Phase 3 — element-select → RN source.** ✅ (PR #39) — `babel-plugin-rn` stamps
      `testID="dsgn:path:line:col"`; tap → `idb describe-point` hit-test → same `SelectedElement`
      seam → Inspector. `sim-control.mjs` + `setup-detect.mjs`.

## v5 — multi-project workspace + agent sessions (shipped 2026-06-25→27)

- [x] **Workspace store + project identity (S0/S2).** ✅ — `src/shared/projectKey.ts`, `useWorkspace`.
- [x] **Multi-instance dev servers (S7 / v5-A).** ✅ (PR #19) — `Map<projectKey, ChildProcess>`.
- [x] **One agent session per project (S8 / v5-B).** ✅ (PR #20) — `Map<projectKey, Session>` + `activeKey`.
- [x] **v5-C — multi-project visible: per-project chat + left rail.** ✅ (PRs #23, #24) —
      `agent:set-active`, per-project `useChat`, `Rail.tsx`, warm-to-N LRU-suspend.
- [x] **v5-C2 — cap warm AGENT sessions too.** ✅ — `evictWarm`, `agent:is-open`. `agent-cap.mjs`.
- [x] **Previous + working agents (history) + Rail UI.** ✅ (PR #28) — `backends/record.ts`,
      `sessions-store.ts`, `SessionReview` modal. Context-resume of a past session still future.

## v7 — multi-provider model backends (seam shipped 2026-06-26; rest DROPPED — see top)

- [x] **Spike (explore).** ✅ — `docs/v7-multi-provider-design.md`.
- [x] **AUTH DECISION (user):** subscription login, NOT BYO API key.
- [x] **Seam + Codex scaffold (items 1–4).** ✅ (commit 8f2bd71) — `src/main/backends/`
      (`types.ts`, `tools.ts`, `claude.ts`, `codex.ts`, `index.ts`). Claude path byte-identical.
- [x] **UI: backend picker + login hint.** ✅ (PR #33).
- [x] **Gemini CLI provider.** ✅ (PR #34) — `backends/gemini.ts`; headless one-turn-per-process.

## v6 — Tailwind + shadcn chat UI / AI Elements (shipped 2026-06-26)

- [x] **Scaffold + rebuild ChatPanel + re-verify.** ✅ (PR #27) — Tailwind v4 + shadcn
      coexisting with `styles.css`; ChatPanel on AI Elements `Conversation` + shadcn primitives.
- [x] **Element-inspector surfaces → shadcn.** ✅ (PR #31) — Inspector, NotesPanel, TokenPalette,
      PropPanel migrated; dead CSS removed.
- [x] **Task/Reasoning (partial stretch).** ✅ — tool-use steps collapse into `StepDisclosure`.

## v2 — design-system-aware select & edit (shipped 2026-06-23→27)

- [x] Preload + click-to-select overlay (`src/preview/preload.ts`).
- [x] Selected DOM → source via `data-dsgn-source` stamp.
- [x] `react-docgen` prop schemas (`src/main/props.ts`).
- [x] `DESIGN.md` stamping convention.
- [x] **Prop/token editor panel** with hybrid apply. `test/prop-edit.mjs`.
  - [x] Cross-file component resolution.
  - [x] **Design tokens** (`src/main/tokens.ts`) — manifest / tailwind / CSS-var detection.
  - [x] **Direct (agent-free) prop + token editing.** ✅ (PR #32).
  - [x] **T2 — Tailwind color-class swap.** ✅ (PR #35).
  - [x] **T2 families — radius + spacing/sizing.** ✅ (PR #37) — `swapTailwindClass` in `tw-classes.ts`.
  - [x] **Direct token apply → Svelte.** ✅ (PR #36) — `applySvelteTokenEdit`.

## v3 — engineer handoff (shipped 2026-06-23)

- [x] Annotations in `.dsgn/annotations.json` (`src/main/annotations.ts`); agent denied `.dsgn/` writes.
- [x] **Publish → branch + GitHub PR** (`publishToPr`). `test/annotations.mjs`.

## Editing readiness (shipped 2026-06-23→25)

- [x] **Gate prop editing on dsgn-readiness** (`hasSchema`).
- [x] **Floating prop panel** on the preview's right edge.
- [x] **On-open setup offer** — scaffold stamping plugin + agent-type components.
- [x] **Framework-aware setup** (`src/main/setup.ts`, `test/setup-detect.mjs`).
- [x] **Inline text editing** (`applyTextEdit`; `test/text-edit.mjs`).
- [x] **Auto-restart the preview after setup** (`App.restartPreview`, `test/setup-restart.mjs`).
- [x] **Svelte inline text-splice** (`applySvelteTextEdit`, `test/text-edit-svelte.mjs`).
- [x] **First-run `.dsgn/tokens.json` offer** (`scaffoldManifest`, `test/tokens-scaffold.mjs`).
- [x] **Svelte component prop schema reachable (option D)** (`inspectSvelteProps`, `test/prop-svelte-self.mjs`).
- [x] **Figma-style inline modes** — C: comment-to-agent, Y: annotation (`test/comment-mode.mjs`).

## Polish (shipped)

- [x] **Agent question interface (AskUserQuestion).** ✅ 2026-07-01 — `canUseTool` intercepts
      the SDK `AskUserQuestion` tool → `QuestionCards`. `test/questions.mjs`.
- [x] First-run auth onboarding panel (`isAuthError` → guidance banner).
- [x] **Permission approve/deny cards.** ✅ 2026-06-23 — `canUseTool` approve/deny per gated
      tool; toolbar permission-mode selector (Ask / Auto-accept edits / Auto: approve all).
