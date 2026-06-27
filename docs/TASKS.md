# TASKS

Roadmap / next steps. Tick items as you finish them and log in PROGRESS.md.

## Now / next

- [x] **Verify a real agent turn.** ✅ 2026-06-23 — `bun run verify` → AGENT-E2E OK
      (agent edited the fixture; SDK subprocess spawns fine in Electron).
- [x] **v2 first slice: click-to-select → source → chat.** ✅ 2026-06-23 — overlay
      preload, inspector, `data-dsgn-source` resolution, composer hand-off; covered by
      `test/select-element.mjs`.
- [x] **Polish: cross-file prop resolution + design-token manifests.** ✅ 2026-06-23 — both
      shipped (see the v2 section); direct agent-free token apply followed in v6 (#32/#35–37).

## v8 — direct manipulation & dsgn agent rules  ⭐ NEW (2026-06-27, user-requested)

Push edits onto the canvas (direct, instant, reversible) instead of through chat;
run comment-work in parallel; and give the agent a versioned set of operating
**rules**. Full design + grounding + sequencing in `docs/PLAN-direct-editing.md`.

- [x] **R1 — "scope of an element edit" rule.** ✅ 2026-06-27 (PR #41) — `src/main/rules.ts`
      (pure, versioned `dsgnRules()` builder; `DSGN_RULES_VERSION`). Injected via the Claude
      preset `append` (verified `systemPrompt.preset.append?: string` in the SDK types);
      Codex + Gemini prepend it to the first turn. `test/rules.mjs` (pure) + AGENT-E2E confirms
      the appended rules don't break a real Claude turn. The rules module is the home for R2+.
- [x] **F3a — resolve selection to the component INSTANCE (core).** ✅ 2026-06-27 (PR #42) —
      the React stamp plugin now also emits `data-dsgn-component-source` on component-tag JSX,
      **UNSHIFTED** (before any `{...props}`) so a forwarding spread carries the OUTER authored
      instance down — the instance call site wins over the host. `preload.findComponentSource`
      walks up to it; `SelectedElement.componentSource`; the Inspector shows "↑ Edit the owning
      component instance" which re-points the selection at the instance → `props.inspect`
      surfaces per-instance props (the screenshot's `value`/`currency` become real edits).
      `select-element.mjs` (capture + owner re-select) + `setup-detect.mjs` (plugin stamp).
      **Remaining:** multi-level owner-walk (one level now); RN component-source (web-only now);
      remove-a-prop-on-reset write-back (rides F2/F3b).
- [x] **F2 — broaden direct editing** (fewer "edit via chat"). ✅ 2026-06-27 — the
      literal set was already broad (expression-container literals, TS casts, template
      literals, unary minus all read as clean literals; genuine handlers/member/array
      expressions correctly stay chat-only), so the win was **schema defaults + reset-to-
      default**: `docgenPropToField` parses react-docgen `defaultValue` → `PropField.default`
      (shown in the panel); a new `props.remove` IPC (`removeProp` / `removeSvelteProp`)
      deletes an attribute from source so the value falls back to its default — reversible
      via F3b, offered only for present, non-required props. Per-instance values ride F3a.
      Tests extend `prop-edit.mjs` (Chip destructuring-default fixture) + `prop-edit-svelte.mjs`.
- [x] **F3b — undo/redo for ALL dsgn source edits** (Cmd+Z / Cmd+Shift+Z / Cmd+Y).
      ✅ 2026-06-27 — `src/main/edit-history.ts` engine: every direct apply path (React
      + Svelte props/text/token swaps) routes through `commitEdit`, which writes then
      records before/after. Interaction-level coalescing (same target within 500ms = one
      step), on-disk conflict detection (refuse to clobber a file the user changed under
      us), per-project-root stacks (the rail keeps several projects open — Cmd+Z in B
      never reverts A; cleared on project close). `edit:undo/redo/can` IPC + renderer
      keyboard handler (skips when typing in a field) re-inspects the selection after a
      revert and surfaces conflicts as a status error. Tests: `test/edit-history.mjs`
      (unit) + apply→undo→redo→conflict round-trip in `test/prop-edit.mjs`.
- [ ] **F1 — comment → parallel agent session** (`claude -p`-style one-shot per
      comment), surfaced in the rail via the existing sessions/record seam; non-blocking.
      Decide working-tree contention first (worktree-per-spawn vs write lock vs advisory).

## v4 — React Native / iOS-Simulator preview (macOS-only)

Show a booted iOS Simulator running an Expo/RN app in the right pane instead of a
web browser. Phased: mirror → interact → element-select. See
`docs/CONTEXT.md` and the 2026-06-25 PROGRESS entry.

- [x] **Phase 1 — view-only live mirror.** ✅ 2026-06-25 — detect `expo`/`react-native`
      (`previewKind: 'simulator'`), `simulator.preflight()` gates macOS+Xcode (clean card
      otherwise), `src/main/simulator.ts` boots a sim + starts Metro/launches the app + serves
      an MJPEG "sim bridge" that the existing `WebContentsView` loads as just-another-URL.
      Tests: `sim-detect`, `sim-preflight`, `sim-frame` (transport, off-macOS), `sim-e2e`
      (macOS-gated SKIP).
- [x] **Phase 2 — interaction.** ✅ 2026-06-27 (PR #38) — the bridge page captures
      tap/swipe/scroll/type on the `<img>` (object-fit-aware → a 0..1 fraction of the device
      content) and POSTs to a `/control` endpoint; the bridge translates to `idb ui tap/swipe/
      text` (device points from `idb describe`). `idb` is optional — without it the page shows
      a "view-only — install idb" hint and `/control` returns `{degraded:true}`. `simulator.ts`
      (`Controller`/`idbController`/`fractionToPoints`/`parseControlCommand`); `test/sim-control.mjs`
      covers mapping/validation, the transport, the capture script, and degrade (off-macOS via
      the test bridge). A live tap on a booted device stays macOS+idb-gated (like sim-e2e).
- [x] **Phase 3 — element-select → RN source.** ✅ 2026-06-27 (PR #39) — `setup.ts`
      `babel-plugin-rn` strategy stamps `testID="dsgn:path:line:col"` (the data-dsgn-source
      analog; iOS surfaces it as the accessibility id); `react-native` framework detection
      (before plain react) + agent wiring prompt. In the sim, a tap while select-mode is armed
      (`simulator:set-select-mode`) routes server-side to an `idb describe-point` hit-test
      (`idbHitTest` → `findDsgnStamp`/`parseTestId`) → emits `simulator:element-picked` → the
      SAME `SelectedElement` seam → Inspector + `props.inspect` (RN files are .tsx, so the JSX
      engine just works). `test/sim-control.mjs` (select routing, testID parse/search via the
      test bridge) + `setup-detect.mjs` (RN strategy). The live `idb describe-point` is the only
      device-gated piece.

## v5 — multi-project workspace + agent sessions (Cursor/Conductor-style)

Today dsgn is single-everything: one open project, one preview `WebContentsView`,
one dev server, one persistent agent `query()` session. This milestone makes it a
**workspace**: open several repos at once, switch between them, and see each
project's agents — the ones working now and the ones that ran before — in a left
rail, like Cursor/Conductor. A bigger architectural lift (most single-instance
state in `main/index.ts` + `main/agent.ts` becomes per-project / per-session
maps), so phase it.

**Decisions (2026-06-25):**
- **Sequencing:** the multi-instance *main-process* slices (dev servers, agent
  sessions, preview state) overlap the files a parallel session is actively
  editing — do them **after** that work lands, not concurrently, to avoid merge
  churn. Renderer-side foundation is safe to do anytime.
- **Dev-server lifecycle:** keep inactive projects' servers **warm up to a cap N,
  then LRU-suspend** the least-recently-used (instant switch for recent projects,
  bounded memory; reload on return for evicted ones).
- **Agent sessions:** **one session per project** (not multiple-per-project) —
  each open repo gets its own agent thread + `dsgn/*` branch; the rail lists
  projects' sessions, not parallel threads within one project.
- **Svelte option C** stays deferred — option D (component-level) is the shipped
  baseline; revisit per-instance editing only with a stable Svelte API / real need.

**Foundation shipped (2026-06-25):** `projectKey` (S0) + `useWorkspace` store (S2).
See the PROGRESS entry.

- [x] **Workspace store + project identity (S0/S2).** ✅ 2026-06-25 —
      `src/shared/projectKey.ts`, `useWorkspace` in `store.ts`, live for the single
      open project. `test/project-key.mjs`, `test/chat-render.mjs`.
- [x] **Multi-instance dev servers (S7 / v5-A).** ✅ 2026-06-25 — `Map<projectKey,
      ChildProcess>` in `devserver.ts`; per-root `stop`, serialized free-port
      allocator, `stopAll` on quit. `test/devserver-multi.mjs`. (PR #19)
- [x] **One agent session per project (S8 / v5-B).** ✅ 2026-06-25 — `Map<projectKey,
      Session>` + `activeKey` in `agent.ts`; only the active session streams; new
      `agent:close-project`; closing the active clears active (no auto-promote).
      `test/agent-multi.mjs`. (PR #20)
- [x] **v5-C — multi-project visible: per-project chat + left rail.** ✅ 2026-06-26 —
      `agent:set-active` + project-tagged events (PR #23, core); per-project `useChat`
      slices with the active mirrored for back-compat; `Rail.tsx` left sidebar with
      working dots, "+ New project" (keep-warm), switching that swaps preview + chat +
      agent + tokens/annotations; warm-to-N **dev-server** LRU-suspend; dead-server
      relaunch-on-switch. `test/chat-route.mjs`, `test/rail.mjs`. (PRs #23, #24)
- [x] **v5-C2 — cap warm AGENT sessions too.** ✅ 2026-06-26 — folded into the same
      eviction: `evictWarm` (was `evictWarmServers`) now suspends the LRU projects'
      dev server **and** agent session beyond N=3, skipping the active project,
      simulators, and any mid-turn agent (`isRunningFor`). `agent:is-open` IPC +
      `applyProject` reopen-on-switch-back (awaited, "context cleared" note) mirror
      the dev-server relaunch path. TOCTOU-guarded against concurrent switch-backs.
      `test/agent-cap.mjs`. Context resume itself is v5-D.
- [x] **Previous + working agents (history) + Rail UI.** ✅ 2026-06-27 (PR #28) —
      re-homed onto the v7 seam: `backends/record.ts` capture (transcript +
      filesTouched) reused by claude/codex, persisted on teardown in `agent.ts`;
      `sessions-store.ts` + `sessions:*` IPC + branch/PR tagging. Renderer: `useHistory`,
      `Rail.tsx` previous-sessions sub-list (status dots, PR accent, click→review,
      delete), `SessionReview` modal (hides the native preview while open). Tests:
      `sessions-store`, `agent-history` (capture through the seam), `history-ui`.
      Context-resume of a past session is still future.

## v7 — multi-provider model backends  ⭐ NEW (2026-06-26, user-requested; explore-then-build)

Add support for non-Claude backends: **OpenAI / ChatGPT SDK, Vercel v0, Google Gemini,
xAI Grok**. Explore feasibility first, then build what's possible.

**Architectural tension to resolve in the spike:** dsgn's agent core is the **Claude Agent
SDK** (locked decision) precisely because it provides *in-process tools* wired to the
renderer (select→edit props→annotate→PR) plus repo `CLAUDE.md`/skills — the product
differentiator. Generic LLM APIs (OpenAI/Gemini/Grok) don't ship an equivalent agent loop
with file-editing tools; **v0** is a code-generation API, not a tool-using chat agent. So
"support" likely means a **provider abstraction with an agent loop we own**. The natural
unifier is the **Vercel AI SDK** (`generateText`/`streamText` + tools across
`@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/xai`, `@ai-sdk/anthropic`) — which also pairs
with the AI Elements UI we just adopted. Trade-off: an AI-SDK agent loop must re-implement
the file-edit/permission/skill tooling the Claude Agent SDK gives for free.

- [x] **Spike (explore).** ✅ 2026-06-26 — `docs/v7-multi-provider-design.md`. Conclusions:
      **OpenAI / Gemini / Grok** are all viable as ONE uniform agent loop via the **Vercel AI
      SDK** (`streamText`+`stopWhen`), behind a `ModelProvider` seam that emits the same
      `AgentEvent`s as today (the existing `Session` interface is ~90% of it). **v0 is
      generation-only — NOT a chat backend** (wire later as a discrete `/generate` action).
      Two big strings attached: (1) **auth shifts** from Claude OAuth-subscription to
      **BYO per-provider API key** (safeStorage) + per-token billing; (2) non-Claude backends
      **lose skills + CLAUDE.md auto-apply + slash-commands** (Claude-Agent-SDK-only) and must
      re-implement the hardened tool suite + permission loop (~6–8 days, security-sensitive).
- [x] **AUTH DECISION (user, 2026-06-26): subscription login, NOT BYO API key.** This
      flips the architecture — see the REVISED section in `docs/v7-multi-provider-design.md`.
      Wrap each vendor's **subscription-auth coding-agent SDK/CLI** (Codex SDK, Gemini CLI,
      Grok Build CLI), NOT the Vercel AI SDK. All three have subscription OAuth + headless
      event streams in 2026, and **bring their own tools** — so the ~6–8 day tool-suite
      rebuild drops to a per-provider adapter. No keys, no billing, no `safeStorage` UI.
- [x] **Seam + Codex scaffold (items 1–4).** ✅ 2026-06-26 — `src/main/backends/`:
      `types.ts` (`ModelProvider`/`ProviderSession`/`PendingPrompt`), `tools.ts` (shared tool
      policy, no cycle), `claude.ts` (incumbent extracted verbatim behind the seam),
      `codex.ts` (EXPERIMENTAL `@openai/codex-sdk`, lazy non-literal import, fails soft),
      `index.ts` (`pickProvider`). `agent.ts` slimmed to backend-agnostic session mgmt;
      `AgentOptions.provider`. **Claude path byte-identical — full `verify` + AGENT-E2E green
      through the indirection.** `test/provider-seam.mjs` (creds-free). (commit 8f2bd71)
- [ ] **Make Codex real:** `bun add @openai/codex-sdk`, the user runs `codex login`, then
      verify a live Codex turn edits a fixture; confirm/fix the `codex.ts` event mapping
      against the real streamed events; map Codex tool approvals → permission cards.
- [x] **UI: backend picker + login hint.** ✅ 2026-06-27 (PR #33) — a `Backend`
      `<select>` in the composer (Claude / Codex — the implemented backends), `provider`
      on `useSession` + threaded through `toAgentOptions`/`openProject`; switching reopens
      the active session on the new backend; a per-provider subscription-login hint
      (`provider-hint`) when non-Claude is selected. `chat-render.mjs` extended.
      Gemini/Grok join the picker when their adapters land.
- [x] **Gemini CLI provider.** ✅ 2026-06-27 (PR #34) — `backends/gemini.ts`: per-turn
      `gemini -p … --output-format stream-json` subprocess, JSONL (init/message/tool_use/
      tool_result/error/result) → `AgentEvent`; Google-account login; fails soft if the CLI
      is absent / not signed in. In `pickProvider` + the PROVIDERS picker. `provider-seam.mjs`
      covers the soft-fail. **Known limit:** headless `-p` is one turn per process, so context
      doesn't carry across turns yet (follow-up: CLI session/checkpoint or ACP).
- [ ] **Then:** Grok Build CLI provider (`@xai-official/grok`, `grok login`) — same
      subprocess-adapter pattern; adds itself to the PROVIDERS picker.
- [ ] **Make a non-Claude backend real** (needs the user): install the CLI/SDK + log in
      (`codex login` / `gemini` / `grok login`), then verify a live turn + confirm/fix the
      event mapping against real output; map each agent's tool approvals → permission cards;
      consider persistent-context mode for Gemini/Grok.
- [ ] **Minor open calls:** which provider after Codex (rec: Gemini); each agent uses its own
      conventions file (Codex `AGENTS.md`, Gemini `GEMINI.md`) — skills stay Claude-only;
      v0 `/generate` action (separate workstream) — build only if wanted.

## v6 — Tailwind + shadcn chat UI (AI Elements)  ⭐ (2026-06-26, user-requested)

Migrate the **chat panel** fully to **Tailwind + shadcn/ui**, using **AI Elements**
(`elements.ai-sdk.dev`) and shadcn's chat primitives. **Priority rule per feature:**
first-party shadcn **primitive** if one fits → else **AI Elements** component → else
**custom** with shadcn+Tailwind. Components are driven by the existing `useChat` zustand
store + `agent:*` IPC (NOT the Vercel AI SDK runtime).

**Decision reversal:** overturns the locked "Plain CSS, no Tailwind / no UI kit"
(`docs/CONTEXT.md`) — the exact scaffolding that got assistant-ui deferred. Accepted by
the user (2026-06-26). Tailwind coexists with the existing plain CSS (chat first).

**Hard constraint:** preserve test-facing hooks so the ~30-test verify suite stays green —
`.composer__input` (readiness selector across ~20 tests), `.markdown`, `.slash__item`,
`.perm*`, and the `aria-label` selects (Model / Thinking level / Permission mode). Scope =
`ChatPanel.tsx` + in-panel components (Inspector, PermissionCards, NotesPanel, SetupCard,
TokenOfferCard, Markdown). App-header branch pill + auth banner are separate chrome.

- [x] **Scaffold + rebuild ChatPanel + re-verify.** ✅ 2026-06-26 (PR #27) — Tailwind v4 +
      shadcn coexisting with `styles.css`; ChatPanel rebuilt on AI Elements `Conversation` +
      shadcn `InputGroup`/`Button` (no Vercel AI SDK runtime — driven by the store); every
      feature + test hook preserved; chat-render/chat-route/smoke green + screenshots.
- [x] **Element-inspector surfaces → shadcn.** ✅ 2026-06-27 (PR #31) — Inspector,
      NotesPanel, TokenPalette, PropPanel migrated to shadcn Card/Badge/Button/Input/
      Textarea + Tailwind, every test hook preserved; dead `.inspector*/.notes*/.tokens*/
      .proppanel*/.propedit*` CSS removed. The whole chat panel is now Tailwind+shadcn.
- [ ] **Stretch:** evaluate other AI Elements (Sources, Task, Chain-of-Thought, Web
      Preview, Reasoning) for dsgn's flows.
- [ ] **Optional: test modernization.** Add `data-testid`s and migrate smoke/
      chat-render off volatile BEM classes; then the three pickers can become shadcn
      `Select` (currently native, locked by the `$$eval('option')` permission-mode assertion).

## v2 — design-system-aware select & edit (the differentiator)

- [x] Inject a preload into the preview `WebContentsView` with a click-to-select overlay.
      (`src/preview/preload.ts` — shadow-DOM highlight + pick.)
- [x] Map selected DOM → source location via the `data-dsgn-source` stamp
      (nearest-ancestor resolution; CSS-selector fallback). See `docs/DESIGN.md`.
- [x] `react-docgen` prop schemas. ✅ 2026-06-23 — `src/main/props.ts` parses the source
      file at the stamp line and runs react-docgen for the component's prop types/enums.
- [x] `DESIGN.md` convention started — `data-dsgn-source` stamping + a reference Vite/Babel
      plugin documented. (Full open-design 9-section schema is still future work.)
- [x] **Prop/token editor panel.** ✅ 2026-06-23 — typed controls in the inspector
      (string/number/boolean/enum); **hybrid apply**: simple literals are spliced straight
      into source (instant hot-reload), complex values fall back to the agent. Covered by
      `test/prop-edit.mjs`.
  - [x] Cross-file component resolution. ✅ 2026-06-23 — follows the component's relative
        import to its definition file and runs react-docgen there (matches the exported name;
        barrel re-exports can't mis-attach).
  - [x] **Design tokens.** ✅ 2026-06-23 — `src/main/tokens.ts` auto-detects the source per
        project (`.dsgn/tokens.json` manifest → `tailwind.config.*` static parse → CSS custom
        properties) and the inspector shows a token palette; clicking a token applies it via
        the agent.
  - [x] **Direct (agent-free) prop + token editing — the default; broadened.** ✅ 2026-06-27
        (PR #32). React. (a) **token clicks apply directly** — `applyToken` IPC: T1 schema-enum
        swap + T3 inline-style swap (property-name + value-family gated), agent fallback
        otherwise; (b) broadened literals — TS casts + no-substitution template literals read
        as literals; (c) PropPanel shows "Literal edits apply instantly"; (d) hot-reload no-op
        guard. `test/prop-edit.mjs` extended (T1/T3, agent fallback, cross-family guard).
  - [x] **T2 — Tailwind color-class swap.** ✅ 2026-06-27 (PR #35) — a tailwind color token
        swaps the single color utility in a literal `className` (`text-gray-500` → `text-primary`);
        exactly-one-match guard (two color utilities → agent), `text-<size>` excluded, variants/
        arbitrary values skipped. `prop-edit.mjs` covers the swap + ambiguity guard.
  - [x] **T2 families — radius + spacing/sizing.** ✅ 2026-06-27 (PR #37) — generalized the
        class swap (`swapTailwindClass` in `tw-classes.ts`) beyond colors to radius
        (`rounded-lg` → `rounded-card`) and spacing/sizing (p/m/gap/w/h…); the exactly-one-match
        guard keeps it safe. Shared by the JSX + Svelte paths. `prop-edit.mjs` covers radius.
  - [x] **Direct token apply → Svelte.** ✅ 2026-06-27 (PR #36) — `applySvelteTokenEdit`:
        the Tailwind color-class swap (T2) for `.svelte` host elements (`class="text-gray-500"`
        → `text-primary`), sharing `swapColorClass` (new `src/main/tw-classes.ts`) with the JSX
        path. Svelte inline-`style` + component-enum token cases route to the agent (follow-up).
        `prop-edit-svelte.mjs` covers the swap + the non-tailwind→agent guard.

## v3 — engineer handoff

- [x] Annotations stored in a repo sidecar (`.dsgn/annotations.json`). ✅ 2026-06-23 —
      `src/main/annotations.ts`; the agent is denied writes under `.dsgn/` (agent.ts guard).
      Rendered as numbered pins over the preview (`src/preview/preload.ts`) + a notes panel.
- [x] **Publish → branch + GitHub PR.** ✅ 2026-06-23 — `publishToPr` creates a branch,
      commits, pushes, and `gh pr create`s with a generated body (notes + changed files).
      Covered by `test/annotations.mjs` (storage + UI); the live `gh` path is user-triggered.

## Editing readiness (built)

- [x] **Gate prop editing on dsgn-readiness.** ✅ 2026-06-23 — only schema-backed components
      are editable (`hasSchema`); unready ones are prompt-only.
- [x] **Floating prop panel** on the preview's right edge (reserves a strip; native view can't
      be floated over). ✅ 2026-06-23.
- [x] **On-open setup offer** — detects unstamped projects and offers to scaffold the stamping
      plugin + agent-type the components. ✅ 2026-06-23.
- [x] **Framework-aware setup** — detect the UI framework from `package.json` deps BEFORE
      generating anything, emit the right instrumentation into `.dsgn/` (React/Solid Babel plugin,
      Svelte markup preprocessor; Vue→inspector, unknown→nothing), send framework-correct agent
      instructions, verify stamps actually fired, and offer `setup:uninstall`. ✅ 2026-06-24 —
      `src/main/setup.ts`, `test/setup-detect.mjs`.
- [x] **Inline text editing.** ✅ 2026-06-24 — double-click a stamped text-only element in the
      preview to edit its text in place; writes straight to source (`applyTextEdit`), agent
      fallback for expression/mixed/Svelte content. (`test/text-edit.mjs`.)
- [x] **Auto-restart the preview after setup** so the wired-in config applies without a manual
      reload; the post-restart readiness report is the verdict. ✅ 2026-06-24 — `App.restartPreview`,
      `test/setup-restart.mjs`.
- [x] **Svelte inline text-splice** — rewrite a plain-text `.svelte` element's content directly in
      source (svelte/compiler), agent-fallback for expression/mixed. ✅ 2026-06-24 —
      `applySvelteTextEdit` in props-svelte.ts, `test/text-edit-svelte.mjs`.
- [x] **First-run `.dsgn/tokens.json` offer** — when a project has no tokens at all, offer a
      starter manifest (deterministic write; never shadows Tailwind/CSS or clobbers a manifest).
      ✅ 2026-06-24 — `scaffoldManifest` in tokens.ts, `TokenOfferCard`, `test/tokens-scaffold.mjs`.
- [x] **Svelte component prop schema reachable (option D).** A host element inside a component
      definition surfaces that file's own props (no DOM node carries the usage stamp); edits route
      to the agent as a default change. ✅ 2026-06-25 — `inspectSvelteProps`, `test/prop-svelte-self.mjs`.
- [x] **Figma-style inline modes** — C: comment-to-agent, Y: annotation. Inline composer in the
      preview overlay anchored to the clicked element; comment → agent, annotation → pin. ✅
      2026-06-25 — `src/preview/preload.ts`, `App.tsx`, `test/comment-mode.mjs`.
- [ ] **Svelte per-instance prop editing (option C).** Map a clicked DOM node → its owning Svelte 5
      component instance → the usage location, for true per-instance edits across all component shapes.
      **Deferred (2026-06-25):** needs Svelte-5 dev internals with no stable public API (fragile);
      option D (component-level) is the baseline. Revisit only with a stable API / concrete need.

## Polish (anytime)

- [x] First-run auth onboarding panel — auth-error detection (`isAuthError`) → amber
      guidance banner pointing at `claude setup-token`. (`08-auth-onboarding.png`.)
- [x] **Permission approve/deny cards.** ✅ 2026-06-23 — `canUseTool` now surfaces an
      approve/deny card per gated tool and awaits the user (read-only tools auto-allowed so
      Ask mode stays usable). A toolbar selector sets the SDK permission mode:
      **Ask (`default`) · Auto-accept edits (`acceptEdits`) · Auto: approve all
      (`bypassPermissions`)** — "Auto" is real SDK bypass via `query.setPermissionMode`, and
      the mode is also passed at project-open so it persists. This is the backstop for the
      v2 select→prompt injection surface.
- [ ] Live thinking-level changes — **blocked**: the SDK `Query` has `setModel` but no
      live effort setter, so changing it mid-session would require restarting the
      session (losing history). Applied at project-open for now.
- [ ] Revisit assistant-ui once v2 UI needs grow (store seam is ready).
