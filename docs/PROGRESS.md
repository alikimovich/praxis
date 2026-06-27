# PROGRESS LOG

Newest first. Append a dated entry when you finish a chunk of work.

## 2026-06-27 — three stacked features: v5-D history UI, inspector→shadcn, direct prop/token edit

Built as stacked PRs off main (#28 → #29 → #30); each its own full `verify` + a
multi-agent adversarial review with fixes applied. Designed via a parallel design
workflow; reviewed via per-PR review workflows.

- **PR #28 — v5-D previous-agents history**, re-homed onto the v7 seam. Capture moved
  into a shared `backends/record.ts` (reused by claude + codex; `ProviderSession` gained
  `record`+`finalize`); persist on teardown in `agent.ts`. Renderer: `useHistory`, the
  rail previous-sessions sub-list, and the `SessionReview` modal. Review caught two real
  HIGH bugs (rail sub-list clipped horizontally → stack vertically; the modal was occluded
  by the native preview → hide it while open).
- **PR #29 — inspector surfaces → shadcn**: Inspector/Notes/Tokens/PropPanel migrated,
  every test hook preserved, dead CSS removed. The whole chat panel is now Tailwind+shadcn.
- **PR #30 — direct (agent-free) prop+token editing**: broadened literals (TS casts +
  no-sub template literals) and a new `applyToken` IPC (T1 schema-enum swap + T3 inline-
  style swap), agent fallback otherwise. Review caught a real correctness bug — T3 matched
  on value-family only, so a color token could land in `fontWeight`; fixed by gating on the
  CSS property name (+ a re-inspect race guard).

**Learnings:**
- **Stacked PRs** are the clean way to ship interdependent work when you can't auto-merge:
  #2 and #3 both touch `Inspector.tsx`; branching #3 off #2 (off #1) means each PR's diff
  is just its own change and there are zero conflicts — merge bottom-up, GitHub retargets.
- **Re-homing across a refactor** (v5-D capture built against the pre-v7 monolith) is a
  *manual* re-apply, never a cherry-pick — the old `agent.ts` would clobber the seam. A
  shared helper (`record.ts`) kept each provider's change to ~4 lines.
- **Tailwind v4's CSS parser chokes on an apostrophe even inside a `/* */` comment**
  ("Unterminated string") — keep comments apostrophe-free.
- **Renderer-DOM modals are occluded by the native `WebContentsView` preview** — hide the
  preview (reuse the drag `setVisible` path) while any centered overlay is open. The
  PropPanel inset-strip pattern only works for edge-docked panels.
- **Direct edits from semi-trusted token files** are injection-safe via `JSON.stringify`
  into the JS string literal, but **family checks must gate on the CSS property name**, not
  just the value shape, or you write a valid-but-wrong value silently.

## 2026-06-26 — v7: ModelProvider seam + Codex backend scaffold

Started multi-provider backends. **User decision: subscription login, not BYO API
key** — so we wrap each vendor's subscription-auth coding-agent SDK/CLI (Codex SDK,
Gemini CLI, Grok Build CLI), not the Vercel AI SDK. Each brings its own tools, so
the spike's ~6–8 day tool-suite rebuild evaporates. See `docs/v7-multi-provider-design.md`.

**Shipped (commit 8f2bd71):** the seam under `src/main/backends/` —
- `types.ts` — `ModelProvider`/`ProviderSession`/`PendingPrompt`. `agent.ts` is now
  backend-agnostic (session map / activeKey / teardown / permission settle-loop /
  `agent:*` IPC, all in terms of `ProviderSession` + `AgentEvent`).
- `claude.ts` — the incumbent Claude Agent SDK session extracted **verbatim** behind
  the seam (`InputStream`, `canUseTool`, streaming loop). `tools.ts` holds the shared
  tool policy (moved out of `agent.ts` to avoid an import cycle).
- `codex.ts` — EXPERIMENTAL OpenAI Codex via `@openai/codex-sdk` (sign-in-with-ChatGPT).
- `index.ts` — `pickProvider(options.provider)`, default Claude.
- `AgentOptions.provider`; `test/provider-seam.mjs`.

**The big safety property:** the Claude path is **byte-identical** — full `verify`
incl. the real AGENT-E2E turn passes through the new indirection. Non-Claude is
reachable only when the renderer sets `provider`, so default runtime is unchanged.

**Learnings:**
- Extracting the load-bearing `agent.ts` was a clean "pure move" precisely because
  the IPC layer already optional-chained the live controls (`query.setModel?.` etc.)
  — those became `ProviderSession.setModel?` with zero handler changes.
- **Lazy non-literal dynamic import** (`const PKG: string = '@openai/codex-sdk';
  await import(PKG)`) lets an optional backend compile + ship WITHOUT its package
  installed (TS types it `any`, no module resolution) — it fails soft at runtime
  (error + done) so a missing SDK / not-logged-in routes to the login banner instead
  of crashing. Same trick the Claude SDK uses for ESM-in-CJS, applied to optionality.
- Codex/Gemini/Grok each **bring their own hardened toolset** — we don't define one;
  the provider just maps their event stream to dsgn's `delta`/`status`/`done`/`error`.
- Still gated on a real `codex login` to verify the live event mapping (can't be
  tested without the user's subscription session).

## 2026-06-26 — v6: chat panel → Tailwind v4 + shadcn/ui + AI Elements

Migrated the chat panel off plain CSS onto Tailwind + shadcn (branch
`dsgn/v6-chat-shadcn`). Decision rule applied per feature: shadcn primitive →
AI Elements → custom. Full `verify` green (all ~30 tests incl. AGENT-E2E).

**Shipped (3 commits):**
- **Scaffold** — Tailwind v4 via `@tailwindcss/vite`, `@` alias, hand-written
  `components.json`, shadcn neutral/new-york tokens in `styles.css` (renamed
  `--accent/--border/--radius` → `--*-shadcn`/`--shadcn-radius` to avoid colliding
  with our legacy vars), `@layer base` border default, `lib/utils.ts` (cn). shadcn
  primitives under `components/ui/*`; AI Elements `conversation` under
  `components/ai-elements/`. Additive — existing plain-CSS UI visually unchanged.
- **Chat core** — message list → AI Elements `<Conversation>` (stick-to-bottom,
  replaces the manual scroll effect); user messages → shadcn muted bubble;
  assistant kept on our `react-markdown`. Composer → shadcn `<InputGroup>` +
  `<InputGroupAddon block-end>` + native textarea (`data-slot=input-group-control`
  for the focus ring); send/stop → shadcn `<Button>` (lucide ArrowUp). Pickers stay
  native `<select>`; slash menu stays custom (textarea-driven).
- **Cards** — PermissionCards / SetupCard / TokenOfferCard → shadcn `<Button>` +
  Tailwind alert surfaces; legacy `.perm*/.setup*` CSS removed (classes kept as
  test hooks). Dense element-inspector surfaces backlogged.

**Learnings (the non-obvious bits):**
- **shadcn CLI alias resolution reads the ROOT `tsconfig.json`, not per-project
  tsconfigs.** With our project-references root (no `paths`), `shadcn add` couldn't
  resolve `@` and wrote to a literal `@/` dir + `src/components/`. Fix: add
  `baseUrl`+`paths @/*` to the root tsconfig; for the already-scattered run we
  relocated files under `src/renderer/src/` + hand-wrote `lib/utils.ts` (the CLI
  skipped it) + appended the CSS tokens manually.
- **The new "shadcn chat primitives" (message/bubble/marker/message-scroller) are
  NOT in the public registry** under those names (`new-york-v4/message.json` 404).
  The research over-trusted a docs-page scrape. Reality: use `input-group` (real) +
  AI Elements `conversation` (real, lightweight — only `use-stick-to-bottom`, no
  `ai`/streamdown). AI Elements `message` pulls `ai`+`streamdown`, so the message
  row is custom + our Markdown. **Always validate registry names by running the CLI.**
- **Tailwind v4 preflight is safe next to legacy CSS** because v4 emits into
  `@layer` and our legacy rules are unlayered (always win). The flip side: a
  migrated element's Tailwind utilities LOSE to any leftover unlayered legacy rule,
  so each migrated block needs its conflicting *properties* stripped (we kept the
  class as a bare hook). Did this for `.chat__messages`, `.composer__input`,
  `.perm*`, `.setup*`.
- **React 18 + shadcn new-york:** components are React-19-style (no `forwardRef`).
  Don't pass a ref into a shadcn leaf (Textarea/Input/Button) — it won't attach.
  The composer keeps a NATIVE textarea for its `inputRef` (seeding/cursor). Radix
  (`radix-ui@1.6`) works on React 18.
- **Test contract held with ZERO test edits** by preserving every selector
  (`.composer__input` is the readiness gate for ~20 tests) + keeping pickers native
  (the permission-mode test reads `<option>`s via `$$eval`).

## 2026-06-26 — v5-C2: LRU-cap warm agent sessions

- Closes the resource gap left after v5-C: the dev-server LRU cap (N=3) was in,
  but each open project still held a live agent SDK CLI subprocess unbounded. Now
  the same eviction bounds **both**.
- **`agent.ts`** — new `agent:is-open` IPC (`sessions.has(projectKey(root))`) so the
  renderer can tell a suspended session from a live one.
- **`App.tsx` `evictWarm`** (was `evictWarmServers`) — beyond the N most-recent
  projects, suspend the LRU ones by stopping the dev server **and** closing the
  agent session. Never reaps the active project, a simulator, or a project whose
  agent is mid-turn (`useChat.isRunningFor` — sticky from submit until `done`, so it
  protects backgrounded in-flight turns too). Re-reads live `activeKey`/running
  right before the destructive stops to dodge a switch-back TOCTOU.
- **`App.tsx` `applyProject`** — on switch-back, if `agent.isOpen` is false the
  session was LRU-suspended, so it's reopened via `agent.openProject` (awaited +
  try/catch, with a clear "prior context cleared" log note — the reopened session
  starts fresh; the visible transcript is kept for reference). Otherwise just
  `setActive`. Mirrors the dead/suspended dev-server relaunch path.
- Tradeoff (documented): suspending closes the SDK subprocess, so an evicted
  project's *agent context* is lost (its chat transcript is preserved for display).
  Real resume lands with v5-D (session persistence).
- Test: `test/agent-cap.mjs` — is-open liveness, LRU suspend leaves peers open,
  reopen re-activates. Full `bun run verify` green (31 OK, agent-e2e/sim-e2e SKIP
  without creds/Xcode).

## 2026-06-26 — proactive checks C1/C3: error extraction + rule-based diagnosis

- Real-world driver: an Expo build failed and dsgn surfaced the xcodebuild
  *dependency-graph* dump, not the actual cause — a stale Homebrew node keg pinned
  in `ios/.xcode.env.local` (`dyld: Library not loaded … Abort trap: 6`). Fixed the
  project (repoint NODE_BINARY) and hardened dsgn so it catches this class itself.
- **`extractBuildError(log)`** in `src/main/xcode.ts` (pure): pulls high-signal
  lines (dyld / Abort trap / PhaseScriptExecution / `error:` / linker) out of a
  build log and drops the "Explicit dependency on target …" graph noise. Wired into
  both `spawnMetro` reject paths (build-fail + early-exit); tail buffer 4k→8k.
- **`src/main/diag-rules.ts`** — layer 2 of the proactive-checks plan: pure
  `matchKnownError(text)` maps known signatures → known fixes (instant, offline)
  *before* the AI. First rule: broken NODE_BINARY → repo-scoped fix (rewrite
  `.xcode.env.local`) + optional host `brew cleanup node`. Wired into `diagnose:run`
  between the recall-cache and `aiDiagnose`; renders through the same DiagnoseCard.
- Tests: `extractBuildError` cases in `test/xcode.mjs`; new bun `test/diag-rules.mjs`
  (matches the node failure, no false positives on unrelated dyld/unknown errors).
  Added to the test/verify chains. Full verify green; `SIM-PREFLIGHT ok=true` now
  that the 26.5 runtime is installed.

## 2026-06-26 — v5-C rail: multiple open projects + switching (the payoff)

- **dsgn is now multi-project.** A left sidebar (`Rail.tsx`, Cursor-style) lists
  the open repos with an active highlight, a per-project "working" dot (green when
  that project's agent turn is in flight — incl. backgrounded ones), an × to close,
  and "+ New project" which opens another **keeping the current one warm** (its dev
  server + agent session keep running for an instant switch). The rail only shows
  once a project is open (single-project keeps the old layout).
- `ProjectEntry` now carries a per-project display snapshot (url / previewKind /
  branch / launchSpec); `patchEntry` updates it. `attempt(root, cmd?, keepWarm)`
  skips the single-active teardown when keeping warm and snapshots the project it
  leaves. `switchTo`/`applyProject` swap the preview (navigate the one
  WebContentsView to the target URL), the active agent session (`agent:setActive`),
  the per-project chat (`useChat.setActiveChat`), tokens, annotations, branch,
  status — no restart. `closeProjectFromRail` stops the server + session and falls
  through to another open project (or idle).
- New `test/rail.mjs`: open two fixtures (second keeps the first warm), assert both
  servers stay reachable, switching swaps the preview port + the per-project chat
  slice. Screenshot `10-rail.png`. Full verify green.
- Adversarial review (10 findings) hardened it: switching a warm project whose dev
  server **died/was suspended** now probes (`devServer.isRunning`) and relaunches it
  before navigating (no dead frame); `applyProject` clears the outgoing tokens/pins
  up front and guards the annotations write against a rapid re-switch (+ a
  `stillActive` re-check after every await); **LRU-suspend** caps warm dev servers at
  3 (the decided behavior — beyond that the least-recently-used are stopped and
  relaunch on return); project entries are kept current (open/restart/branch-rename
  patch them) so switching needs no stale-closure snapshot; `closeProjectFromRail`
  awaits the session close before clearing chat and avoids a double-stop on the last
  project; test isolation assertion strengthened (content, not counts).

## 2026-06-26 — v5-C core: per-project chat + event routing (keep-running)

- The machinery behind the chosen "backgrounded agents keep running, badge on
  return" behavior. `agent.ts` `emit` now tags every event with its session's
  `projectKey` and emits for ALL live sessions (dropped the active-only guard);
  new `agent:set-active(root)` switches a warm session without recreating it.
- `useChat` is now per-project: `byKey[projectKey]` slices (messages + isRunning +
  the streaming message id moved into the slice), with the active slice mirrored
  into the top-level `messages`/`isRunning` so ChatPanel + the Playwright store
  harness read it **unchanged**. Chat actions take an optional key (default =
  active); ChatPanel's `agent:event` handler routes by `event.projectKey` — the
  active project streams live, a backgrounded project accumulates into its own
  slice (the rail's "working" dot) and its output is there on switch-back.
- App sets the active chat to the open project, clears a project's slice on
  close/switch-away. New `test/chat-route.mjs` injects `agent:event`s from main
  (no creds) and proves routing + background accumulation + switch-reveal. Full
  verify green; `chat-render`/`comment-mode`/`agent-multi` unchanged. Rail UI next.
- Review fixes: `patch` uses `?? activeKey` (an explicit `''` is its own slice, not
  collapsed into the active project); open clears the project's chat slice first
  (so a trailing event from a disposed session can't surface stale content on
  reopen) and `stop` awaits `closeProject` before clearing.

## 2026-06-25 — v5-B: one agent session per project (S8)

- `src/main/agent.ts`: replaced the single `session` + monotonic `currentEpoch`
  with a `Map<projectKey, Session>` plus an `activeKey`. Each open project keeps
  its own persistent `query()` session (cwd = its repo); only the **active**
  project's session streams to the renderer (`emit` guards on
  `!disposed && key === activeKey`), so a backgrounded session kept warm for a
  fast switch can't leak into the visible chat. `permCounter` moved per-session and
  its fallback ids are namespaced by project key (no cross-session collisions).
- `agent:open-project` creates/replaces+activates a session for its key;
  `send`/`setModel`/`setPermissionMode`/`respond-permission`/`interrupt` route to
  the active session; `before-quit` closes all. New `agent:close-project` (+
  `DsgnApi.agent.closeProject`) tears a project's session down; the renderer calls
  it in the single-active teardown (switching), the failed-open cleanup, and stop.
- New `test/agent-multi.mjs` proves the lifecycle without Claude creds — it probes
  the synchronous "no active session" error to verify per-project sessions, active
  routing, and close semantics (open A,B → active; close the active → cleared, NOT
  auto-promoted; reopen re-activates; close last → none). Full verify green;
  single-project agent path unchanged.
- Review fix: closing the active project clears `activeKey` (it never auto-promotes
  a backgrounded session — which would start emitting into a chat the renderer
  isn't showing once the rail keeps sessions warm); the renderer re-activates
  explicitly via open-project.

## 2026-06-25 — v5-A: multi-instance dev servers (S7)

- `src/main/devserver.ts`: replaced the single `current` ChildProcess with a
  `Map<projectKey, ChildProcess>` — several projects' dev servers run at once.
  `start(opts.root)` pre-empts only that project's prior server (restart) and
  leaves others; `stop(root)` kills one process group + deletes its entry;
  `stopAll()` on `before-quit`; the spawn registers an `exit` handler that prunes
  the map if a server dies on its own. The timeout targets only the timed-out root.
- Contract: `devserver:stop` + `DsgnApi.devServer.stop` gain a `root`; preload +
  the three App callers thread it. Single-active behavior is preserved at the
  renderer (opening another project stops the previous one and drops it from the
  workspace; the rail will skip that to keep projects warm). Running servers hold
  their ports, so `findFreePort` hands out distinct ones naturally.
- New `test/devserver-multi.mjs`: two fixtures' servers run concurrently on
  distinct ports, both reachable, and `stop(rootA)` leaves B running. Full verify
  green (open-preview / setup-restart single-project paths unchanged).
- Adversarial review caught a real **free-port race** (concurrent starts both
  probed 7777 → same port): added a serialized `allocatePort` + reserved-port set
  so concurrent starts get distinct ports (released on exit). Also: the 90s
  timeout now kills the *captured* child (identity-guarded), not whatever's in the
  map for that key (a restart could otherwise kill the newer server); a failed
  `attempt` stops the dev server it started (no orphan); the test was strengthened
  (both fixtures honor `PORT` so the allocator is actually under test) and polls
  until-down instead of a fixed sleep.

## 2026-06-25 — iOS simulator build-destination preflight (the 26.5 gap)

- Root cause of "iOS 26.5 is not installed" after a multi-minute build: modern
  Xcode couples a simulator *build* to a runtime ≥ its active SDK version. The old
  preflight only counted `simctl` devices, which still listed 26.0/26.1 devices,
  so it went green while the build was already doomed.
- **`simBuildDestination(sdkVersion, runtimeVersions)`** in `src/main/xcode.ts`
  (pure, with `parseVersion`/`cmpVersion`): fails when no installed runtime ≥ the
  SDK, handing back the one-line fix (`xcodebuild -downloadPlatform iOS`). Unknown/
  unparseable SDK never blocks (degrade safe). Unit-tested in `test/xcode.mjs`.
- `preflight()` now probes `xcrun --sdk iphonesimulator --show-sdk-version` and the
  runtime versions, and returns this reason *before* booting + building.
- Kicked off the 8.52 GB `xcodebuild -downloadPlatform iOS` for this machine's
  missing 26.5 runtime (consented).
- **`docs/PLAN-proactive-checks.md`** — the layered "preflight rules" design this
  generalizes into: proactive checks → rule-based failure matching → AI diagnose
  fallback, all feeding the existing propose-first card + per-machine memory.

## 2026-06-25 — v5 foundation: projectKey + workspace store (S0/S2)

- First, non-collision slices of the v5 multi-project roadmap (a planning workflow
  mapped the single-instance machinery and ordered the slices to avoid the parallel
  session's main-process edits — see `docs/TASKS.md` v5).
- **S0** — `src/shared/projectKey.ts`: a pure, string-only canonical key for an open
  project (separator/trailing-slash normalized, idempotent). Every later
  `Map<root,*>` (dev servers, agent sessions, preview state, the renderer
  workspace) keys on this so main and renderer dedupe the same repo. Pure bun test
  `test/project-key.mjs`.
- **S2** — `useWorkspace` store (renderer): the future source of truth for
  multi-project — `projects[]` + `activeKey`, with `openOrActivate/activate/close`
  keyed by `projectKey`. Wired live for the single open project (App populates it on
  open, clears on stop) but otherwise additive/dormant until the rail + multi-instance
  backends land. Exercised in `test/chat-render.mjs` (`__dsgnWorkspace`).
- Deferred + why: the multi-instance **main** refactors (dev servers S7, agent
  sessions S8, preview state S9) are HIGH-collision with the parallel session's
  active `main/index.ts`/`agent.ts`/`devserver.ts` work and gated on lifecycle
  decisions (warm vs suspend, caps) — left for coordination. The per-project store
  fan-out (S3–S6) is a large dormant renderer refactor better done with the user in
  the loop. See the session's blocking questions.

## 2026-06-25 — Figma-style inline comment (C) + annotation (Y) modes

- Press **C** → comment mode, **Y** → annotation mode (also toolbar buttons). Click
  an element in the preview and an inline composer (a pill in the overlay's shadow
  root) anchors to it. Submitting a **comment** sends it straight to the agent
  (element ref + your text); an **annotation** pins a note (no agent), reusing the
  existing `.dsgn/annotations.json` engine + pins.
- Layered onto the existing select overlay in `src/preview/preload.ts` (select
  stays byte-identical): a `commentMode` state, the shadow-DOM composer, capture-
  phase C/Y/Esc keys (guarded against the page's own text fields + modifiers), and
  click→`openComposer`→submit. Modes are mutually exclusive with select. New
  channels: `set-comment-mode` (renderer→preload), `comment-mode` (keyboard echo),
  `comment` (submit) — all sender-gated in main and cached across preview reloads.
- Renderer: `useSelection.commentMode` mirrors the preview (toolbar reflects
  keyboard arming); a submitted comment routes via a new one-shot `useComposer.submit`
  (auto-sends, or prefills if a turn is running so it's never dropped); an
  annotation calls `annotations.add`. Comment text is capped/sanitized into the
  prompt. New `test/comment-mode.mjs` drives the full path end to end (arm → click
  → shadow composer → send → agent turn / annotation pin) through real IPC.
- Adversarial review fixes: the composer self-heals if its frozen element is
  removed by HMR (`isConnected` guard in `onMove`, mirroring the text-edit path);
  `preview:reset` clears `commentModeActive` for parity with `selectModeActive` (no
  stale re-arm on project switch); and an annotation submitted before the session
  is ready logs feedback instead of dropping silently.

## 2026-06-25 — AI diagnose-on-failure → propose-first fix card + per-machine memory

- When opening/launching a project fails (web or simulator — both throw into the
  one `attempt` catch), dsgn now asks the agent to **diagnose** it and shows a
  **propose-first** card: a one-line root cause + numbered steps, each tagged
  **repo** (a fix dsgn can apply) or **host** (sudo / global / download — the user
  runs it), with the exact shell command + a Copy button. Nothing runs
  automatically (user-chosen). "Apply repo fix" seeds the chat with the repo steps
  for the agent to execute (reviewed + sent); host steps are copy-only.
- **Per-machine memory** (user-chosen scope): `src/main/diag-cache.ts` (pure, fs)
  caches each diagnosis in the app's userData (NOT the repo), keyed by project path
  + a normalized error **signature** (paths/ids/numbers stripped, so the same error
  class recalls instantly across runs). A repeat error is recalled with "seen before"
  — no model call. `diagnose:record` stores applied/dismissed.
- **One-shot, tool-less SDK turn** (`src/main/diagnose.ts`): cwd=repo, no tools, no
  settings, asks for a strict JSON plan; degrades to null without auth (the raw
  error still shows). Recall happens before any model call.
- Tests: `test/diag-cache.mjs` (signature normalization incl. the module-name-vs-path
  fix, recall/remember, per-project, status) + `test/diagnose-card.mjs` (renders
  repo/host steps, Apply seeds the composer + clears, Dismiss clears). `bun run
  verify` green (25 checks).

## 2026-06-25 — Svelte component prop schema reachable via selection (option D)

- Bug: selecting a rendered Svelte component never showed its prop schema. A
  Svelte component instance compiles to **no DOM node**, so the usage-site
  `data-dsgn-source` stamp on `<Accordion>` is dropped (no `...rest` forwarding) —
  the only stamps reaching the page are the plain host elements *inside each
  component's definition*, which took the host-element (no-schema) path.
- Fix (**option D — same-file definition schema**): when a clicked host element
  resolves into a `.svelte` file that declares props, `inspectSvelteProps` now
  surfaces **that file's own** props (`extractProps` on the same instance script).
  Works for **every component shape** (block-`{#if}`-root, multi-root, etc.) with
  **zero source mutation** — chosen over rest-forwarding (A/B), which can't reach
  the ~46% of a real library that has no single host root. Per-instance editing
  (option C, runtime instance→usage mapping) is the planned follow-up.
- Edits to a definition-scoped prop route to the agent as a prop-default change
  (the instance has no node to splice). The panel surfaces the schema only — no
  misleading live value — and the note is honest ("no per-instance value; editing
  changes the default, affecting only instances that don't set it"). SvelteKit
  route files (`+page`/`+layout`) are excluded (their `data`/`form`/`params` are
  framework-injected, not props). New `test/prop-svelte-self.mjs` (the brief's
  smoke check): definition host → `hasSchema:true` with the right fields, edit →
  agent, plus propless-host and route-file negatives; cross-file path intact.

## 2026-06-25 — Work on a `dsgn/*` branch per project

- Opening a project now puts dsgn's work on a **`dsgn/*` branch** so the user's main
  branch stays clean. `src/main/git.ts` (pure, child_process only): `ensureBranch`
  keeps an existing `dsgn/*` branch or creates `dsgn/<current-branch>` off HEAD
  (`dsgn/work` when detached); `switchBranch` switches/creates a named one
  (coerced to a git-ref-safe `dsgn/<…>`). `checkout -b` carries uncommitted changes
  (nothing lost); a conflicting switch surfaces the error instead of forcing.
- **Only manages the repo TOP LEVEL** (`isRepoRoot`, realpath-compared) — opening a
  subdirectory of a larger repo (a monorepo package, or a fixture inside this repo)
  is a no-op, so the test suite never switches dsgn's own branch.
- The branch shows as a **clickable pill in the titlebar** (`⎇ dsgn/main`); clicking
  opens an inline editor to rename/switch (Enter applies, Esc cancels). The open flow
  logs `Working on branch … (created)` to the activity console.
- `git:ensure`/`git:set` IPC; `useSession.branch`; `BranchResult` contract. Unit test
  `test/git.mjs` (real temp repo: normalize, non-repo no-op, ensure create/keep,
  switch create/existing); chat-render covers the pill + inline editor. `bun run
  verify` green (22 checks); confirmed the suite leaves dsgn on `main`.

## 2026-06-25 — React Native / iOS-Simulator preview (Phase 1: live mirror)

- New preview mode: a booted **iOS Simulator** running an Expo/React Native app
  shown in the right pane instead of a web browser (macOS-only). Phase 1 of a
  phased plan (mirror → interact → element-select); user-chosen scope: RN/Expo
  first, macOS-only, start with a view-only mirror.
- **Frame transport — reuse over reinvention.** Rather than a new renderer canvas
  fed frames over IPC, `src/main/simulator.ts` stands up a tiny local **"sim
  bridge"**: an HTTP server that captures the booted device (`xcrun simctl io …
  screenshot`, JPEG) and serves it as an **MJPEG** behind a one-`<img>` page. The
  renderer points the **existing** preview `WebContentsView` at that URL — so the
  simulator is "just another local URL" and every geometry/load/retry seam
  (`preview:set-bounds`, `preview:load`, the `did-fail-load` retry loop) is reused
  unchanged. Modeled on `serve-sim` (Evan Bacon) and Maestro Studio.
- **Detection** (`devserver.ts`): `detectFramework` recognizes `expo` /
  `react-native` (checked first — Expo repos also list `react-native`); `detect()`
  sets `previewKind: 'web' | 'simulator'` on `DetectedProject`. Frame capture uses
  only `xcrun simctl` (ships with Xcode, zero extra install); `idb` is detected for
  the Phase-2 interaction path but not required.
- **Preflight** (`simulator.preflight()`): all read-only `execFile` probes, never
  throws; returns a human `reason` per failure class (not-macOS / no-Xcode /
  no-runtime / no-device). `App.attempt()` branches on `previewKind`, preflights
  first, and surfaces a clean banner+console card off the happy path instead of
  crashing. Backend teardown is cross-routed (opening a web project stops any
  simulator and vice-versa); `stop()`/`restartPreview()` route by `previewKind`.
- **Lifecycle** (`simulator.start`): boot a device (prefer already-booted, else
  newest iPhone) → `bootstatus` wait → spawn the dev command (default `expo
  run:ios`: build+install+launch+serve) in its own process group → stand up the
  bridge → readiness = first captured frame. `stop()` SIGTERMs the Metro group and
  closes the bridge (sim left booted for fast re-open); `before-quit` cleanup.
- **Preload routing**: the bridge page is flagged `?dsgnSim=1`; `src/preview/
  preload.ts` early-returns its whole web overlay there (no previewed-app DOM to
  stamp/inspect). The "Select" toggle is hidden in sim mode until Phase 3.
- **Contract** (`src/shared/api.ts`): `Framework` += `expo`/`react-native`;
  `PreviewKind`; `DetectedProject.previewKind`; `RunningSimulator`; `SimPreflight`;
  `SetupStrategy` += `babel-plugin-rn` (Phase 3); `DsgnApi.simulator.{preflight,
  start,stop,onLog}` mirrored in the preload.
- **Tests (degrade off-macOS, like agent-e2e):** `sim-detect` (expo/RN→simulator,
  vite→web), `sim-preflight` (non-mac → ok:false + reason), `sim-frame` (exercises
  the whole bridge→MJPEG→WebContentsView transport with a stub frame source via a
  main-process test hook — **no simulator needed**), `sim-e2e` (boots a real sim;
  SKIPs unless macOS + `DSGN_SIM_E2E=1` + `DSGN_SIM_FIXTURE`). `bun run verify`
  green (19 checks; agent-e2e + sim-e2e SKIP here).
- **Not yet verified on-device:** the simctl/expo orchestration in `start()` is
  macOS-only and could not run in this Linux CI env — it needs a Mac with Xcode to
  confirm boot/build/launch end-to-end (the bridge/transport itself IS verified by
  `sim-frame`).

## 2026-06-24 — First-run offer to scaffold `.dsgn/tokens.json`

- When a project opens with **no** design tokens (`tokens.detect` → `source:'none'`
  — no manifest, Tailwind theme, or CSS custom properties), dsgn now offers a
  starter `.dsgn/tokens.json` (colors/spacing/radius/fontSize). Accepting is a
  deterministic file write (no agent turn); the manifest then becomes the
  editable, canonical source the palette reads.
- `scaffoldManifest` (tokens.ts, `tokens:scaffold`) only writes when the project
  has **zero** tokens — it never shadows a live Tailwind/CSS source or clobbers an
  existing manifest (guarded on `detectTokens(...).source === 'none'`, idempotent).
- New `TokenOfferCard`; the offer yields to the setup offer (one card at a time).
  Offer state lives on `useTokens` (`offerNeeded`/`offerDismissed`/`scaffolding`,
  cleared on project switch via `reset()`). New `test/tokens-scaffold.mjs` covers
  the write, idempotency, no-shadow/no-clobber, and the card's accept + dismiss.
- Adversarial review fix: `acceptTokenScaffold` re-checks `projectRoot` after the
  async write resolves (mirrors the detect handler) so switching projects mid-write
  can't stamp the old project's starter palette into the new project's state.

## 2026-06-24 — Svelte inline text-splice in source

- Inline text editing rewrote JSX text directly but punted `.svelte` to the agent.
  Now `applySvelteTextEdit` (props-svelte.ts) splices Svelte text content via
  svelte/compiler — the `.svelte` counterpart of the JSX path, same contract:
  plain-`Text` children + splice-safe new text apply directly; empty / expression
  (`{...}`) / mixed / element children fall back to the agent.
- Mirrors the JSX engine's whitespace handling (lead/trail from the raw source,
  zeroed for all-whitespace) and splice-safety regex (`^[^<>{}]*$`, so the new
  text can't open a tag or mustache). Reuses the shared `findElement` /
  `makeLocator` so line/col match the stamps.
- `props.ts` dispatches `.svelte` to it (was a hard agent-fallback). New
  `test/text-edit-svelte.mjs`: plain `<h1>` text rewritten to `.svelte` source;
  a mixed `<p>Label <Badge/></p>` correctly needs the agent.

## 2026-06-24 — Auto-restart the preview after setup

- A setup turn edits the build config (vite.config / svelte.config), which
  Vite/SvelteKit only read at boot — a page reload alone never applied the new
  source-stamping plugin, so the user had to manually restart. Now dsgn does it.
- `useSetup.busy` already uniquely marks "the setup turn is in progress" (only
  `acceptSetup` sets it), so verification is now armed when that turn **finishes**
  (the `done` handler), not when it's dispatched — closing a race where a
  mid-turn dev-server auto-restart could be mistaken for the verdict.
- On setup `done`: arm `verifying` + raise a one-shot `restartRequested`. App
  consumes it and `restartPreview()` does `devServer.stop()` → `start()` (reusing
  the captured launch spec: root + resolved dev command + framework) →
  `preview.load(newUrl)`. The post-restart readiness report is the verdict. Only
  restarts servers dsgn owns (skips attached). On relaunch failure (a broken
  config edit) it disarms verification and surfaces the error instead of hanging.
- New `test/setup-restart.mjs`: opens a fixture, drives the finished-setup signal,
  asserts the server relaunches, the preview reloads, and the zero-stamp verdict
  fires (no silent success). Also backfilled `verify` to run the setup tests.
- Adversarial review (3 dimensions, independently verified) caught and fixed:
  cancelling a setup turn no longer restarts (an interrupt arrives as `done` with
  `busy` still set — `stop()` now clears it); a project switch mid-restart is
  guarded (re-checks `projectRoot` after each await so it won't relaunch the old
  project over the new one); and an attached (user-owned) server now reports
  "restart it yourself" instead of a false zero-stamp verdict.

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
