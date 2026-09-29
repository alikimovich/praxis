# CLAUDE.md — working guide for Trezi

Trezi is a native macOS app (Swift/AppKit/SwiftUI with Bun services): an AI chat on the left that edits a user's repo, with
that repo's dev server live-previewed on the right. Distributed as source
(clone + `bun install` + `bun run dev`); each user authenticates with their own
provider subscription (`claude setup-token` / `claude login`; Codex and Gemini
backends exist behind the same seam).

The project's original name was **dsgn**. A repo-wide rename (2026-07) swept it
out of the code — the stamp is `data-trezi-source`, the sidecar is `.trezi/`,
work branches are `trezi/*`. The old name survives only in deliberate legacy
shims: setup uninstall removes old `.dsgn/` helpers, `git.ts` recognizes
`dsgn/*` work branches, `sidecar-migrate.ts` moves old sidecar data, `agent.ts`
migrates the old `<userData>/dsgn` dir, and the agent sidecar write-deny covers
both dir names. Don't "fix" those dsgn strings — and keep `docs/PROGRESS.md`
history as written.

## Start here every session

1. Read the top of `docs/PROGRESS.md` (newest-first log — recent state + the
   *why* behind decisions) and `docs/TASKS.md` (the roadmap / what's next).
2. When you finish a chunk, append to `docs/PROGRESS.md` and tick `docs/TASKS.md`.
3. **If your change contradicts something in this file or `README.md`, fix that
   doc in the same commit** — this file is auto-loaded into every session, so a
   stale claim here misleads every future agent. `test/docs-links.mjs` fails CI
   if a `src/…` path referenced here or in the README no longer exists.

## Commands

| Command | What |
| --- | --- |
| `bun run dev` | Build and launch the native app |
| `bun run build` | Build Swift host, Bun services and preview to `out/native/` |
| `bun run typecheck` | Type-check native/backend/shared code and isolated preview. Run after every change |
| `bun run test:<name>` | One test (see package.json for ~40 aliases) |
| `bun run test` | Unit + native UI tiers (via `test/run.mjs`) |
| `bun run verify` | Everything incl. live-agent e2e (needs display + creds) |
| `bun run lint` | Biome lint over `src` + `test` |

Use **bun**, not npm/yarn. Node 22 (`.nvmrc`) remains available for tooling.
Native builds require macOS 13.3+ and command-line tools with the macOS 26 SDK.
The `dev:native`, `build:native`, and `typecheck:native` aliases remain supported.

## Verify your own work WITHOUT asking the user

The runner tiers are `unit`, `native`, `live`, and `all`. Run relevant unit tests,
`bun run typecheck`, `bun run typecheck:native` and `bun run test:native` for native
changes. `bun run test` combines unit and native checks. Live provider calls
(`test:native-live` / `verify`) require authorization. Unit jobs are bounded;
native/live jobs are serial, use disposable profiles, and distinguish SKIP from
PASS. See `docs/TESTING.md` for filtering, logs, timeouts and isolation rules.

Read captured PNGs to verify UI. Offscreen AppKit captures cannot reliably paint
Liquid Glass. `TREZI_NATIVE_BACKGROUND_TEST=1` skips real pointer gestures and
animation timing; report that reduced coverage. No Electron tests remain.

`bun run dev:native --test --only=group,group` (or `bun test/native-runtime.mjs
--only=…`) runs only the named native smoke groups: `core`, `islands`,
`shadow-light`, `sidebar`, `settings`, `chat`, `composer`. An unknown name fails
before the build; no flag runs every group, which acceptance still requires.
Groups are defined in `src/native/smoke-groups.ts`.

### Evidence budget

- A foreground window capture plus JSON geometry/state from the existing fixtures
  is enough acceptance evidence.
- Do not add OCR of wrapped text, synthetic CGEvent/input-routing tests, or any
  `defaults write`/system preference change unless the ticket explicitly requires it.
- Tests must never change the user's system settings.

> Electron and browser/Tailscale mode are retired. Old user profiles are preserved,
> not implicitly imported or deleted. See `docs/NATIVE.md`.

## Architecture — Swift host, Bun services and isolated project WebKit

```
src/
  native/         Swift/AppKit/SwiftUI UI + Bun controllers
    index.ts        service registration, project lifecycle and host bridge
    Host.swift      AppKit application and JSON host protocol
    ServiceClient.swift / HostService.swift   the host's versioned XPC connection to
                    the Swift service (handshake, reattach, bounded outbox) and its
                    AppKit quit/restart/exit-status integration
    Shell.swift     sidebar, toolbar and project/chat navigation
    Chat.swift / Composer.swift   native conversation and text input
    WorkspaceLayout.swift        authoritative view/divider geometry
    SourceEditor.swift / Layers.swift / EditingInspector.swift / ContentWindow.swift
                    native source, layers, inspector and content editing
    platform.ts     direct native service imports, Keychain, event routing
    preview-transport.ts   restricted isolated WKContentWorld transport
    assets/cat/     native animation artwork
  service/        separate Swift XPC service (S02 of docs/SWIFT-BACKEND-PLAN.md)
    ServiceMain.swift / ServiceRuntime.swift / ServiceXPC.swift   XPC listener,
                    signed-peer + hello validation, legacy relay, drain; also the
                    `--legacy` launch-time rollback owner
    LegacySupervisor.swift / ProcessGuardian.swift   exclusive profile lock, Bun
                    process group, lifetime-pipe guardians for detached servers
    ServiceContract.swift   S01 shared DTOs (TS twin: src/shared/service-contract/)
    OperationLedger.swift / LedgerStore.swift / LedgerMirror.swift   S03 durable
                    operation ledger: intent digest, receipts, per-domain revisions,
                    event cursors, crash recovery. Opened under the profile lock
                    (docs/SWIFT-BACKEND-LEDGER.md)
    PreferencesOwner.swift / PreferencesFile.swift   the preferences writer (LKM-91):
                    byte-compatible v1 preferences.json, ledger-backed batches,
                    external-edit adoption. Bun's client is native/preferences-service.ts;
                    native/preferences.ts is the legacy-launch rollback writer
                    (docs/SWIFT-BACKEND-PREFERENCES.md)
    WorkspaceOwner.swift / WorkspaceFile.swift / DomainChannel.swift   the
                    workspace writer (LKM-92): project identity (canonical root →
                    key), order, selection and recents in the unchanged workspace.json;
                    session/server/Git fields arrive through a typed `update`
                    adapter. Bun's client is native/workspace-service.ts;
                    native/workspace.ts is the legacy-launch rollback writer and
                    native/workspace-model.ts the byte-identical TS operations
                    (docs/SWIFT-BACKEND-WORKSPACE.md)
    MemoryOwner.swift / MemoryFile.swift   the project memory writer (LKM-93):
                    unchanged project-memories/<id>.json, one ledger domain per
                    project; a manual `save` always wins, a generated `propose`
                    commits only on the revision it was evaluated against. Bun's
                    client is native/project-memory-service.ts; main/project-memory.ts
                    is the rollback writer + evaluation queue + injection
                    (docs/SWIFT-BACKEND-MEMORY.md)
    RuntimeOwner.swift / RuntimeServer.swift / ManagedProcess.swift   the managed
                    project runtime (LKM-94): dev-server + install process groups
                    (descendants stopped with their leader, `--watch-group`
                    watchdog + journal for crash recovery, never adopting a pid),
                    ports, readiness. RuntimeDetect.swift / RuntimeNet.swift mirror
                    main/project-detect.ts + devserver-net.ts; StaticSite.swift /
                    StaticServer.swift serve static projects (FSEvents, SSE,
                    real-path containment). Bun's client is native/runtime-service.ts
                    on the devserver:* routes (main/devserver-service.ts); HTML
                    stamping stays a JS helper (docs/SWIFT-BACKEND-RUNTIME.md)
    RepositoryOwner.swift / RepositoryEffects.swift / RepositoryLanding.swift /
    RepositoryJournal.swift / RepositoryGit.swift   the repository coordinator
                    (LKM-95): one FIFO lane per repository common directory (Bun's
                    `enqueueRepoWrite` becomes a lease on it), every Trezi Git effect
                    (worktrees, landings, live commits, branch switches, recovery),
                    journaled intent, `refs/trezi/recovery/*` before anything could
                    orphan work, explicit intents for landing/discard/removal. Bun's
                    client is native/repository-service.ts behind the seam
                    main/repository-owner.ts; the TS Git code is the rollback owner
                    (docs/SWIFT-BACKEND-REPOSITORY.md)
    SourceOwner.swift / SourceStore.swift / SourceJournal.swift / SourceHistory.swift /
    SourcePaths.swift / SourceDrafts.swift   the source transaction service (LKM-96):
                    parsers only PROPOSE `{path, expectedHash, content}` via
                    main/source-commit.ts `proposeEdit`; the service commits hash-bound,
                    journaled multi-file transactions in the repository lane (crash
                    rollback never overwrites newer work), authorizes paths (symlinks
                    included), owns grouped Undo/redo/revert, file-tree create/rename/
                    delete, editor reads/saves and persisted drafts. Bun's client is
                    native/source-service.ts behind main/source-owner.ts; edit-history.ts
                    and file-ops.ts are the rollback owner (docs/SWIFT-BACKEND-SOURCE.md)
    ConversationOwner.swift / ConversationState.swift / ConversationStore.swift   the
                    conversation coordinator (LKM-97): the only writer of session records
                    and History (unchanged sessions/*.json), live-chat checkpoints with
                    crash recovery, the turn state machine (one turn per chat; one terminal
                    claimed per turn run; late/duplicate terminals refused), completion
                    policy, titles, model handoff, approvals, spawn admission. Bun's
                    provider sessions are adapters (main/chat-turns.ts tags events with
                    their turn); Bun's client is native/conversation-service.ts behind
                    main/conversation-owner.ts; main/conversation-model.ts is the rollback
                    twin (docs/SWIFT-BACKEND-CONVERSATION.md)
    ProviderOwner.swift / ProviderFrames.swift / ProviderPolicy.swift / ProviderHelper.swift /
    ProviderStore.swift
                    the provider owner (LKM-98): every provider session is opened here and
                    gets a grant (Trezi tools, roots, chat); it answers permission requests
                    (Claude's canUseTool asks it), authorizes Trezi tools (Claude's in-process
                    tools, Codex's MCP bridge), holds Stop's deadline, persists resume ids and
                    supervises provider helpers (stdio only, allowlisted env, own process
                    group, every frame checked against the grant). The SDK adapters still
                    run in Bun (main/provider-sessions.ts wires them); Bun's client is
                    native/provider-service.ts behind main/provider-owner.ts;
                    main/provider-model.ts + provider-policy.ts are the rollback twin
                    (docs/SWIFT-BACKEND-PROVIDERS.md)
    EditingOwner.swift / EditingIslands.swift / EditingStores.swift   the editing
                    coordinator (LKM-99): the only writer of chat island histories
                    (unchanged chat-islands/*.json) and their state machine (activation
                    only by the defining turn, which it asks the conversation owner;
                    command admission, a queued batch's revision chain, per-island
                    Undo); hash-bound commits of .trezi/control-panels.json and
                    content-controls.json in the repository lane; persisted content-editor
                    drafts; deferred open_preview navigation. Bun keeps the JS helpers
                    and views (main/chat-islands.ts, native/content-controller.ts,
                    native/navigation-controller.ts, native/turn-boundaries.ts); Bun's
                    client is native/editing-service.ts behind main/editing-owner.ts;
                    main/editing-model.ts is the rollback twin (docs/SWIFT-BACKEND-EDITING.md)
    WorkflowOwner.swift / WorkflowJournal.swift / WorkflowPublish.swift /
    WorkflowRemote.swift / WorkflowSetup.swift   the workflow owner (LKM-100): Publish
                    (merge / PR only), handoff and saved-run PRs, Connect to GitHub, remote
                    fetch/pull/switch, `.trezi/` setup helpers, new projects, Trezi's own
                    update and the diagnosis memory, each a durable record (intent before
                    the effect, receipt after, operation-ID dedupe) reconciled from GitHub
                    and Git instead of repeated. Bun's helpers only propose (PR
                    descriptions, detection, starter files, diagnoses). Bun's client is
                    native/workflow-service.ts behind main/workflow-owner.ts;
                    main/workflow-legacy.ts (over main/publish.ts, github.ts, git-remote.ts,
                    setup.ts, scaffold.ts, diag-cache.ts) is the rollback twin
                    (docs/SWIFT-BACKEND-WORKFLOWS.md)
    PlatformOwner.swift / SimulatorOwner.swift / SimulatorBridge.swift /
    SimulatorTools.swift / PlatformMedia.swift / PlatformTools.swift   the platform
                    owner (LKM-101): the iOS Simulator preview (bounded, cancellable
                    xcrun/idb runs in a ToolScope, the app's launch command as a journaled
                    group, the loopback MJPEG bridge, idb input and picks), scoped media
                    grants for the source editor (view, identity, size, SHA-256, expiry),
                    pasted attachments from hash-checked chunks, and the running-servers
                    recovery. Bun's client is native/platform-service.ts behind
                    main/platform-owner.ts; simulator.ts, media.ts, attachments.ts and
                    native/preview-processes.ts are the rollback twin
                    (docs/SWIFT-BACKEND-PLATFORM.md)
  main/           Backend services (CJS bundle, Bun); historical directory name
    preview-ipc.ts  every ipcMain handler that talks to (or about) that preview:
                    bounds/load/reset/capture, the select + comment relays, the
                    prop-panel island's plumbing, Styles reads, Layers. Owns no
                    view — native/index.ts hands it a `PreviewIpcHost` (accessors +
                    the shared `PreviewState`, which native/index.ts's load
                    re-arm reads). The sandboxed preload can only be READ by a
                    request/reply round trip; `requestReply` is that pattern
                    once, shared by styles:read and layers:read
    devserver.ts    legacy-launch runner: spawn dev server, parse URL, readiness
                    (the Swift launch serves the same routes via devserver-service.ts)
    project-detect.ts detect framework/PM + launch commands (pure; Swift mirror
                    in service/RuntimeDetect.swift)
    static-server.ts legacy-launch static file server for vanilla HTML/JS projects
                    (framework 'static': no package.json/dev command; live-reload)
    file-tree.ts    list a project's files (git ls-files / fs-walk) for the
                    native source editor's file tree (source:tree IPC)
    project-icon.ts the project's own favicon, kept as project metadata (project:icon)
                    — a declared <link rel="icon"> first, else the conventional
                    paths; inlined as a data: URL, mtime-revalidated. Reads the
                    FILES, not the running page, so an un-run project has one too.
                    No longer drawn in sidebar rows: every project row uses the
                    shared native folder symbol (src/native/SidebarIcon.swift)
    file-ops.ts     the same sidebar's file MANAGER — create/rename/delete
                    (source:create-file/rename-file/delete-file). Pure; every
                    renderer-supplied path is re-validated (no traversal, no
                    .git/.trezi/.dsgn/node_modules), delete goes to the OS trash
    media.ts / media-types.ts   the editor's media viewer: opening a .png/.mp4 must
                    SHOW it, not decode its bytes as utf8. media-types is the pure
                    half (ext→kind/MIME, binary sniff); media.ts is the legacy
                    registry of opaque `trezi-media://f/<token>` URLs that only trusted
                    native code turns back into a path (AppKit shows the file). Under the
                    Swift launch the platform owner issues these grants instead. No
                    WebKit view serves the scheme (the Electron-era stream is retired)
    agent.ts        persistent multi-turn agent session (streams over agent:* IPC);
                    asks the conversation owner before every chat transition
    attachments.ts  gives a PASTED composer image a path (attachments:save writes
                    the clipboard bytes under <userData>/trezi/attachments so the
                    turn can tell the agent where the image it can see lives; a
                    DROPPED image needs no call — the renderer already has its
                    path). Pure fs+path; sanitizes the renderer-supplied name.
                    Legacy-launch writer: under the Swift launch the platform owner
                    writes the same folder and names from hash-checked chunks
    backends/       provider seam: claude.ts, codex.ts, gemini.ts behind pickProvider
                    (gemini currently has NO SDK dep — treat as experimental). A set
                    AgentOptions.connectionId routes to codex.ts whatever `provider` says.
                    codex-retry.ts is codex.ts's pure half (the CLI emits all five of its
                    retry attempts as separate `error` events; this collapses them into
                    one line that keeps the actual cause). interrupt.ts is the shared
                    "Stop must always work" helper — ask the backend nicely, then kill
                    (see the Gotcha on the SDK's untimed interrupt). helper-host.ts runs a
                    provider inside a supervised helper; helper-session.ts is Bun's view of
                    such a session (verified with a fake provider only, see
                    docs/SWIFT-BACKEND-PROVIDERS.md)
    session-tools.ts  Trezi's session tools for Codex's MCP bridge and helper sessions,
                    each authorized by the provider owner first (`authorizedTool`)
    codex-usage.ts  live token counts for a Codex turn: the SDK's event stream
                    reports usage only at `turn.completed`, so this tails the
                    CLI's own session rollout (`$CODEX_HOME/sessions/…jsonl`) for
                    its `token_count` records. Every reading is a running THREAD
                    total, so codex.ts DIFFS them (`usageDelta`), never sums
    providers-store.ts / providers.ts   v10 "connections" — user-added OpenAI-compatible
                    endpoints (AI Gateway, Groq, custom) so open models like Kimi/DeepSeek
                    can drive a chat. Same pure/main split as control-manifest vs
                    control-panels: the store takes an injected baseDir + SecretCipher (so
                    it unit-tests without electron), while providers.ts owns the
                    safeStorage cipher, the providers:* IPC, the /models catalog probe,
                    the picker's ModelChoice list, and resolveConnection() — the seam
                    backends/codex.ts aims the Codex SDK at
    model-catalog.ts / codex-models.ts   what the two BUILT-IN seats offer, discovered
                    instead of curated. model-catalog is the pure half (parsers + a TTL
                    cache with injected clock/baseDir, persisted under userData);
                    codex-models runs `codex debug models` on the SDK's OWN vendored
                    binary, not PATH. Claude needs a live session (Query.supportedModels()),
                    so backends/claude.ts hands its answer back via recordClaudeModels;
                    providers.ts only schedules the refresh, never on the render path
    simulator.ts    iOS Simulator preview (Metro/Expo detect, MJPEG sim bridge); the
                    legacy-launch rollback of the Swift platform owner
    props.ts / props-svelte.ts   prop editing engines (React via react-docgen /
                    Svelte 5); they mirror each other's splice/apply contract
    styles.ts / styles-svelte.ts  CSS editing for the island's Styles tab: one
                    edit → Tailwind class rewrite, else merge into an EXISTING
                    inline style, else hand to the agent; tw-styles.ts +
                    inline-style.ts are the pure mapping/splicing halves
    style-tokens.ts re-resolves a design-token pick from the island (name+group
                    only) against the project's own tokens and decides what to
                    write — a `var(--name)` reference or a Tailwind token class
    move-node.ts / move-node-svelte.ts / move-node-html.ts   the Layers panel's
                    drag-to-reorder engines (React/Svelte/static HTML): same-
                    parent sibling reorder writes real source; anything
                    ambiguous (shared stamp, cross-file, templated by a
                    .map()/{#each}) → needsAgent. move-node-splice.ts is the
                    shared, dependency-free rebuild-from-scratch splice all
                    three call; ast-walk.ts is the shared parent/ancestor walk
                    (React + Svelte; static HTML uses its own, to dodge parse5's
                    parentNode back-references)
    control-manifest.ts / control-panels.ts   AI-surfaced control panels:
                    validate + anchor-lex + render literals (pure) and the
                    .trezi/control-panels.json store (rendered here, committed
                    hash-bound by the editing owner) + controls:* IPC
    tokens.ts       design-token detection/scaffold   annotations.ts  comments → PR
    publish.ts      the legacy Publish / handoff / saved-run PR code (rollback twin of
                    service/WorkflowPublish.swift); the routes go through workflow-owner.ts
    annotation-store.ts  the notes sidecar's storage (list/add/remove; no Git), split
                    from publication; Bun-owned until the S07 repository lane
    spring.ts       pure spring→CSS linear() engine (vendored from ~/dev/spring2css);
                    powers the spring_to_css agent tool in backends/claude.ts
    apca.ts         APCA (Lc) contrast checker + accessible-color suggester
                    (adapted from ~/dev/apca-cli; apca-w3 + colorparsley loaded via
                    dynamic import — ESM-only); powers the check_contrast agent tool
    fluid.ts / oklch.ts / shadows.ts   pure design-system calculators powering the
                    fluid_clamp (Utopia clamp() math), color_scale (OKLCH tonal ramp
                    + gamut map) and layered_shadow (multi-layer box-shadow) agent tools
    type-metrics.ts pure line-height + letter-spacing recommender (size-aware,
                    WCAG-floored leading; Material-3 tracking); powers the line_height agent tool
    skill-packs.ts / skills-install.ts   curated allowlist catalog of external "taste"
                    skills + the `npx skills add --copy` runner; power the
                    list_recommended_skills (pure) and install_skills (side-effecting) agent tools
    git.ts, worktrees.ts, chat-worktrees.ts, chat-isolation.ts
                    git/worktree primitives; worktrees: per-chat isolation + sync/merge/recovery;
                    chat-worktrees: turn-scoped ops (sync, commit, apply); chat-isolation: lifecycle.
                    Their mutating functions dispatch to the Swift repository owner when
                    one is installed (repository-owner.ts); repo-write-queue.ts likewise
    live-commit.ts  one commit per turn on the LIVE checkout (pure): stages only the
                    files that turn changed, partial-commits so the user's own staged
                    work is untouched, skips non-repo-root projects, never throws
    publish-scope.ts  what a session changed / is there anything to publish (pure) —
                    measured against the default branch, since committed turns leave
                    nothing to see in a HEAD-relative diff. Used by annotations.ts
    setup.ts, scaffold.ts, xcode.ts
    diagnose.ts, diag-cache.ts, diag-rules.ts         sessions-store.ts, edit-history.ts
    update.ts       self-update detection (pure: fetch + rev-list behind-count)
  preview/preload.ts  isolated WKWebView instrumentation: selection, comments,
                    annotations; own tsconfig (tsconfig.preview.json)
  preview/layers.ts DOM tree walk + child-index-path node resolution for the
                    Layers panel (bulk read, panel-driven select/hover, the
                    structural MutationObserver watch) — split out of preload.ts,
                    which only wires the IPC into it
  preview/measure.ts  spacing measurement geometry for the Option/Alt distance
                    overlay (select one element, hold Option, hover another):
                    gap between separated boxes, matched-edge deltas when they
                    nest/intersect. Pure — preload.ts only draws what it returns
  preview/style-provenance.ts  proves a style property's value comes from a
                    design token instead of merely equalling one: reads the
                    SPECIFIED (unresolved) declaration — inline `style=` or a
                    matched stylesheet/scoped-`<style>` rule — since
                    `getComputedStyle` always resolves `var()` away and so can
                    never tell "is" from "coincidentally equals". Threaded
                    through `styles:read` as `declaredVars`
  shared/api.ts     the IPC contract — single source of truth for cross-process types
  shared/preview-channels.ts  the raw channel NAMES for the one IPC surface api.ts
                    can't type: main ⇄ the sandboxed preview preload (no
                    contextBridge there, so it's bare `ipcRenderer` strings).
                    Imported by BOTH ends (src/main/preview-ipc.ts + index.ts,
                    and src/preview/preload.ts) — never re-declare one locally
  shared/token-match.ts  which design tokens may be offered for a css property
                    and which one a computed value IS. Pure + used by BOTH main
                    (re-validating a pick) and the island (chips + picker)
  shared/run-stats.ts  the chat status line's numbers: main normalizes each
                    provider's usage payload + dedupes its repeated cumulative
                    readings into `usage` event deltas, native chat state accumulates them for the Swift status line
  shared/style-props.ts  the Styles panel's v1 editable CSS-property allowlist
                    (the `StyleProp` union). main/styles.ts derives its
                    `STYLE_PROPS` from it (the actual write-time boundary);
                    ../bin/trezi.mjs the `trezi` CLI (launch + `--update`); owns the update
                    sequence (git pull + bun install + build). ../install.sh boots it.
test/             hand-rolled .mjs tests + fixtures/ + artifacts/ (PNGs, gitignored)
docs/             TASKS (next) / PROGRESS (log + rationale) / DESIGN (stamp spec)
```

- **Lifecycle:** `install.sh` (curl one-liner) clones to `~/.trezi`, builds, and
  puts `trezi` on PATH. `trezi` launches the built app; `trezi --update` pulls
  + rebuilds. Native Settings uses `src/native/update-controller.ts` to guard
  unsaved work, check/pull/install/build, and restart.

- `bun run dev`/`start`/`trezi` go through `scripts/start-native.mjs`: the host
  connects over XPC to the bundled Swift service, which takes the profile lock
  and supervises Bun over private pipes. The service writes `preferences.json`
  (`docs/SWIFT-BACKEND-PREFERENCES.md`), `workspace.json`
  (`docs/SWIFT-BACKEND-WORKSPACE.md`) and project memory
  (`docs/SWIFT-BACKEND-MEMORY.md`), and runs managed project servers, installs
  and static sites (`docs/SWIFT-BACKEND-RUNTIME.md`), and performs and serializes
  every Trezi Git effect in user repositories (`docs/SWIFT-BACKEND-REPOSITORY.md`),
  and commits every Trezi source edit, Undo and file-tree operation from hash-bound
  parser proposals (`docs/SWIFT-BACKEND-SOURCE.md`), and owns chat records, live-chat
  checkpoints and turn transitions (`docs/SWIFT-BACKEND-CONVERSATION.md`), and holds
  every provider session's grant, permission answers, tool authorization, Stop's
  deadline and resume ids (`docs/SWIFT-BACKEND-PROVIDERS.md`), and owns chat island
  histories and activation, the controls sidecars, content drafts and deferred preview
  navigation (`docs/SWIFT-BACKEND-EDITING.md`), and runs publication, remote Git actions,
  setup, new projects, Trezi's update and the diagnosis memory as journaled workflows
  (`docs/SWIFT-BACKEND-WORKFLOWS.md`), and runs the iOS Simulator preview, issues the source
  editor's media grants, writes pasted attachments and performs the running-servers
  recovery (`docs/SWIFT-BACKEND-PLATFORM.md`);
  Bun is still the single writer of every other domain. `TREZI_BACKEND_OWNER=legacy` is the launch-time rollback (Bun
  spawns the host, still under Swift's lock, writes all three itself and runs its
  own servers after the launcher sweeps the runtime journal). See
  `docs/SWIFT-BACKEND-SERVICE.md`.
- The chat runs in `main` via provider SDKs; output streams over `agent:*` IPC
  into Bun chat controllers, which send typed state to Swift.
- Trezi **owns** the dev-server lifecycle of the target repo (never run the
  target's `dev` manually); it's killed on app quit. Under the Swift launch the
  service owns those process groups and drains them before releasing the profile
  lock.

**Why it's built this way (non-obvious choices):**
- **Agent core = SDK in-process** (not ACP/subprocess): the product's custom
  tools (select element → edit props → annotate → PR) are wired to the renderer
  and need in-process SDK tools.
- **Preview = system `WKWebView`**: isolated instrumentation selects elements
  and talks to Bun through a view-identity-checked message allowlist.
- **Prop editing is hybrid**: simple literals splice straight into source (instant
  HMR); complex/expression values fall back to the agent. React and Svelte have
  separate engines because their ASTs differ; selection/tokens are framework-
  agnostic (they only need the `data-trezi-source` stamp — see `docs/DESIGN.md`).

## Conventions

- Application UI is Swift/AppKit/SwiftUI. Reuse existing system font sizes,
  line heights and native controls rather than introducing arbitrary scales.
  Tailwind support remains in source-editing tools for the user's projects.
- The Claude Agent SDK is **ESM-only** — `main` is CJS, so it's loaded via
  dynamic `import()` in `agent.ts`/`backends/` (never static/`require`).
- All cross-process types go in `src/shared/api.ts`; keep service handlers, Bun controllers, preview transport
  and Swift state/action contracts in sync.
- New test = new `.mjs` in `test/` **plus** its name in the right tier array in
  `test/run.mjs` (`unit` / `native` / `live`). `bun run test` and `verify`
  dispatch through the runner — don't hand-edit `&&` chains.
- Keep files under ~500 lines; extract modules instead of growing oversized files.
- Auth is per-user at runtime; never commit secrets. Nothing sensitive in-repo.
  The two built-in seats use subscription login (Claude `setup-token` / Codex
  sign-in-with-ChatGPT). A v10 *connection* is the one path that uses an API key —
  the user's own, encrypted with `safeStorage` under userData and confined to main.
  It must never reach the renderer, argv, a log line, or an error string; the
  UI only ever observes `hasKey`.
- Commit in small, focused commits with the Co-Authored-By trailer.

## Gotchas (hard-won — read before debugging these areas)

- **Native shortcuts must route through AppKit menus/responders.** Preserve
  focus-based Undo/Redo and validate physical shortcuts; synthetic actions alone
  cannot prove menu/responder behavior.
- **The Agent SDK's `interrupt()` can never return, so Stop must not just await it.**
  It's a CONTROL REQUEST: the SDK resolves it only when the CLI subprocess sends a
  matching `control_response`, and there is no timeout anywhere in that path. A
  wedged subprocess (symptom: turn running for minutes, `↑0 ↓0`) therefore made
  Stop a dead button — the IPC never resolved, and since `done` is only emitted
  from a `result` message, the spinner ran forever. The kill switch was present
  the whole time (`shutdown()`'s `abort.abort()`) but only teardown reached it.
  Since LKM-98 the provider owner holds the deadline: `provider-sessions.ts` runs a
  backend's graceful `interrupt` through `interruptWithOwner` and, when the owner says
  escalate, its `forceStop` kill switch once (it must end the turn: error + one done).
  Give any future backend a `forceStop` rather than its own timer, and keep the
  `hardStopped` report so agent.ts rebuilds the dead session. An unreachable owner
  falls back to the local bound. Codex was always safe here (its cancel is a local
  AbortController); Gemini had no `interrupt` at all, so Stop silently did nothing.
- **ESM/CJS**: the Agent SDK is ESM-only, `main` is CJS → dynamic `import()`
  only, never static/`require`.
- **The preview is the only WebKit view.** Do not reintroduce an application
  renderer. AppKit owns geometry and native inspectors reserve their own space.
- **Preview instrumentation is isolated.** Keep the WKContentWorld and restricted
  message allowlist; re-send select/style/layer state after navigation.
- **Prop editing is gated** on `PropInspection.hasSchema` (a resolved
  react-docgen/svelte schema). Unready components are prompt-only; the on-open
  setup offer instruments them.
- **The Styles ladder never INTRODUCES a styling convention.** S2 merges into a
  `style` attribute that already exists; it will not create one, and the S3
  prompt explicitly forbids the agent from creating one either. Re-adding an
  insert-when-absent branch to make edits feel snappier would push inline styles
  into projects that style from a stylesheet or a Svelte scoped `<style>` block
  — where the inserted attribute also silently outranks that block forever after.
  An element with no class and no `style` is SUPPOSED to cost an agent turn.
  (Note S1 has the mirror-image gap: it can only rewrite an existing class
  string, never add one, so Tailwind projects pay that turn too.)
- **Inspect WebKit through its native Web Inspector.** There is no Electron CDP
  port. Use the native host test protocol for deterministic integration checks.
- **In service mode the launcher reports the HOST's exit status**, and
  `NSApp.terminate` calls `exit` itself — code after `application.run()` never
  runs. Bun's status must travel in `quit {status}` / `serviceStopped {status}`
  and is applied in `applicationWillTerminate`; otherwise a failing `--test`
  smoke exits 0. Reconnect after a lost XPC connection must name the prior
  epoch (`resume`): launchd silently starts a FRESH service instance, which
  refuses (`recoveryRequired`) rather than launching a second Bun, but only
  after launchd's ~10 s respawn throttle, so `serviceStopped` is final (no
  reconnect, local shutdown). Frames are never replayed after an uncertain
  send; only never-submitted frames queue. Never read a bridge pipe with
  `FileHandle.read(upToCount:)`: it waits for the full count, so short lines
  never arrive — use `readAvailable(upTo:)`. Never answer quit with
  `.terminateLater` while waiting on main-queue work (modal-panel run loop);
  cancel, drain, terminate again. An XPC service's stderr is discarded, so
  Bun's stderr is the host's, passed over XPC (`attachDiagnostics`).
- **Bun blocks postinstall for untrusted dependencies.** `esbuild` remains in
  `package.json#trustedDependencies` for its binary.
- **The agent is denied writes under a target repo's `.trezi/` (and legacy `.dsgn/`)** (annotations,
  scaffolded instrumentation, and control-panel manifests live there). The
  `define_controls` tool exists precisely because of this: the agent hands main
  a manifest, main validates it, and the editing owner (the Swift service, or its
  legacy twin) is the only writer — hash-bound, so a hand edit is never overwritten.
- **A control-panel manifest stores no values.** Every value is re-resolved from
  source on lookup (literal → lex the literal after the anchor; prop → the live
  inspection; style → computed styles), so an edit that moves a constant is
  harmless and one that renames it just marks the param stale. Anchors must
  occur exactly once — re-checked at save AND at every apply, so a drifted
  anchor can never splice the wrong site. Only main renders spliced literals;
  agent- and renderer-supplied strings are never written verbatim.
- **A tool callback's `root` is the chat's WORKTREE, not the live tree.**
  Anything persisting app state must use `SpawnContext.liveRoot` (threaded from
  every `agent.ts` startSession call site) — `define_controls` validates anchors
  against the worktree file the agent just wrote, but saves to the live root.
- **Chats run in per-chat worktrees (trezi/chat-<id>), auto-merged back to the
  live tree on each turn's done/error.** The preview ALWAYS serves the live
  checkout, never a worktree. Non-repo-root projects (subdirs, non-git) run on
  the live tree as today (`isRepoRoot` gate in git.ts). Resumed sessions get a
  fresh worktree; the model picker (agent:restart-chat) reuses the existing one.
  Drift from concurrent live edits syncs at turn start; conflicts park on the
  branch for review. One worktree per open chat costs disk (~node_modules are
  symlinked); worktree directories live under `<userData>/trezi/worktrees`.
- **A worktree's symlinked node_modules/.env must be excluded by NAME, never via
  the target's `.gitignore`.** They're symlinked into every worktree so it can
  build, but a `.gitignore` pattern with a trailing slash (`node_modules/`, the
  Next.js/CRA/Vite default) is *directory-only* and git never treats a symlink as
  a directory — so it fails to match the symlink. Left to `.gitignore`, the
  symlink is staged by `git add -A`, the turn-end auto-merge chokes reading it
  (`EISDIR` → the whole batch is refused), and EVERY turn parks with `node_modules`
  in the conflict card (this shipped, user-reported 2026-08-08). `worktrees.ts`
  exports `RUNTIME_DEPS` and unstages it in `captureBase`/`commitWorktree`;
  `chat-worktrees.ts` spares it from `git clean` with `-e` (`cleanArgs`). Never
  re-route these through `.gitignore`, and keep any scaffolded `.gitignore`
  slash-free. `.env` (rule has no slash) hides the bug — it DOES match the symlink,
  so only `node_modules` leaks; don't let that asymmetry mislead the diagnosis.
- **The merge onto the live tree is also COMMITTED there — one commit per turn**
  (`live-commit.ts`, called from `chat-isolation.ts` + the comment-spawn
  finalizer). Only the files that turn changed are staged, and it's a pathspec
  (partial) commit, so a user's unrelated dirty/staged work is never swept in.
  Consequence for anything that asks "what did this session change?": a diff vs
  `HEAD` now returns nothing — compare against the merge base with the default
  branch instead (`src/main/publish-scope.ts` does, for the publish paths).
- **Never hardcode a built-in seat's model list.** It rots invisibly: the picker
  offered "GPT-5 Codex"/"GPT-5" for months after the Codex CLI moved to the
  GPT-5.6 family, so a user's first act was to pick a model that no longer
  existed. Both harnesses can be ASKED (`src/main/model-catalog.ts`), and the
  arrays left in `providers.ts` are a last resort for "we could not ask", not
  curation. Two traps if you touch this: the Codex binary to ask is the SDK's
  VENDORED one (`@openai/codex-<plat>/vendor/…/bin/codex`), never the `codex` on
  PATH — a global CLI of a different version would answer for a binary that
  never runs the turns; and `Query.supportedModels()` leads with its own
  `{value:'default'}`, which collides with trezi's "Default" sentinel, so a
  discovered `default` is dropped in favour of ours (`agentModelId` maps that
  exact string to "send no model").
