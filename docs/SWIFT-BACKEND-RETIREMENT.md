# Legacy retirement, launcher and distribution (S15)

LKM-102, step S15 of the [canonical plan](SWIFT-BACKEND-PLAN.md) and
[roadmap](SWIFT-BACKEND-ROADMAP.md). S15 may remove Bun application orchestration
only after the census confirms every route, event and module has its final owner.
This document is that census for the effects that matter (every Bun module that
writes files, runs a process or sends a signal) and the gate the removal waits on.
`test/retirement-census.mjs` (unit tier) keeps it executable: a new effect in an
unlisted module, a stale row, or a gate line that disagrees with the rows fails.

## Status (2026-09-29)

**Retirement gate: blocked by 13 Bun-owned rows.** The legacy owners and
`TREZI_BACKEND_OWNER=legacy` stay; nothing that the rollback switch needs was removed.

Moved in this step:

- The reviewer notes (`.trezi/annotations.json`), S05's writer that had to wait for
  the S07 repository lane. `src/main/annotation-store.ts` now only reads and renders;
  the editing owner commits the new text only if the file still holds the bytes it
  read, in the repository lane. A hand edit in between is read again and the change
  re-applied (three attempts), never overwritten.
- The starter design tokens (`.trezi/tokens.json`, `tokens:scaffold`): a create-only
  commit by the same owner. A file detection could not read is refused, where the old
  writer replaced it.
- Both use `EditingSidecar.commit` (Swift) and its legacy twin `commitSidecarLocally`,
  so they gain the controls sidecars' checks: a linked `.trezi` folder or file is
  refused (the old writers followed a link out of the project) and a store is capped at
  1 MiB (about 500 notes at the 2000-character maximum).
- Dead adapter code: `agent.ts` still imported a Git runner and fs writers it no
  longer used.

Not moved, and why the gate stays closed:

1. The Bun-owned rows below. Each needs its own transfer with a rollback plan; none
   is a two-line change, and several (provider store, catalog cache, Codex bridge)
   belong with the provider adapters' move into helpers.
2. The provider SDK adapters still run in-process in Bun (LKM-98). Moving them into
   supervised helpers needs an authorized live parity run, which this step does not
   have. Until then Bun is the adapters' host and cannot stop being a service.
3. The Bun controllers in `src/native/` (chat, composer queue and drafts, workspace
   server fields, sheets and their routing) are still the application's orchestration.
   They are views and adapters over the Swift owners, but they are Bun code.
4. No live check of a real provider, GitHub, package manager, Xcode or simulator was
   authorized. A removal would have to prove parity on exactly those paths.

## Rollback for this step's domain

- Files: `<project>/.trezi/annotations.json` and `<project>/.trezi/tokens.json`, bytes
  unchanged (`JSON.stringify(value, null, 2)` plus a newline). No journal, receipt or
  draft is added: each commit is a single atomic, hash-bound replace.
- Owner switch: quit (the service drains the editing owner before it releases the
  profile), relaunch with `TREZI_BACKEND_OWNER=legacy`; the legacy twin writes the same
  bytes with the same checks. A pre-S15 build reads both files as before.
- Newer data is never replaced: a commit only lands on the bytes it was computed from,
  so a note written by either owner, or by hand, survives a switch in either direction.

## Launcher and distribution

```
install.sh ─ git clone/pull ─ bun scripts/requirements.mjs --build ─ bun install ─ bun run build
trezi (bin/trezi.mjs) ─ build if missing ─ scripts/start-native.mjs ─ TreziHost ─XPC─ TreziService ─ Bun
trezi --update ─ git pull --ff-only ─ bun install ─ bun run build        (the app is not running)
Settings ▸ Updates ─ workflow owner: pull, install, build (journaled) ─ restart through start-native
```

- Supported: macOS 13.3 or later (both bundles' `LSMinimumSystemVersion` and the
  `swiftc -target`), the macOS 26.0 SDK or later to build, Bun 1.3.0 or later. One
  source, `scripts/requirements.mjs`: the build, the launcher, `bun run dev`, the CLI and
  `install.sh` refuse with one message instead of failing inside swiftc or dyld.
- Package layout (checked by `test/distribution.mjs`): `out/native/Trezi.app` with
  `Contents/MacOS/TreziHost` and the XPC service at
  `Contents/XPCServices/dev.praxis.service.xpc`, a copy at `out/native/TreziService`
  for the rollback launcher and guardians, and the Bun bundle `out/native/index.cjs`.
- Shutdown: the host quits through the service, which drains Bun, every owner and every
  managed process group before it releases the profile lock
  ([service](SWIFT-BACKEND-SERVICE.md)). In-app restart waits for that drain.
- An interrupted in-app update resumes from its journal without pulling twice
  ([workflows](SWIFT-BACKEND-WORKFLOWS.md)); `trezi --update` is the terminal path and
  runs only while the app is closed.

## Retained JavaScript (by design)

These stay JS in the end state, as the plan allows. They hold no application state and
commit nothing themselves:

- Provider SDK adapters (`src/main/backends/`), their session tools and the Codex tool
  bridge, and the pure calculators behind agent tools (spring, APCA, fluid, OKLCH,
  shadows, type metrics).
- Source analysis: React/Svelte/HTML parsers, prop, style, layer and move engines,
  tokens detection, controls and content validation. They propose hash-bound edits.
- Proposing helpers: PR descriptions, framework detection, starter files, diagnoses.
- The isolated WebKit instrumentation (`src/preview/`) and HTML stamping for the
  static site.
- Read-only Git probes that feed the owners (`git status`, `diff`, `ls-files`).

## Census

Classes: `rollback` (the legacy writer, used only when no Swift owner is installed:
`TREZI_BACKEND_OWNER=legacy` and unit tests); `helper` (retained JS whose effects are
reads, a provider SDK's own process, or a scratch directory it removes); `test` (native
smoke fixtures, never in the product path); `bun` (a Bun-owned effect in the Swift
launch, which blocks retirement).

| Module | Class | Final owner | Effect |
| --- | --- | --- | --- |
| `src/main/attachments.ts` | rollback | PlatformOwner | pasted image writes and pruning |
| `src/main/backends/codex.ts` | helper | ProviderOwner (helper process) | Codex SDK process |
| `src/main/backends/gemini.ts` | helper | ProviderOwner (helper process) | Gemini CLI process |
| `src/main/chat-isolation.ts` | helper | RepositoryOwner | Git reads (diff, show, status) |
| `src/main/chat-worktrees.ts` | rollback | RepositoryOwner | worktree sync, commit, clean |
| `src/main/codex-models.ts` | bun | ProviderOwner catalog | `codex debug models` probe |
| `src/main/devserver-processes.ts` | rollback | RuntimeOwner | legacy server group signals |
| `src/main/diag-cache.ts` | rollback | WorkflowOwner | diagnosis memory |
| `src/main/edit-history.ts` | rollback | SourceOwner | Undo history |
| `src/main/editing-model.ts` | rollback | EditingOwner | sidecars, island histories |
| `src/main/feedback.ts` | bun | WorkflowOwner | `gh issue create`, no receipt |
| `src/main/file-ops.ts` | rollback | SourceOwner | file-tree create/rename/delete |
| `src/main/file-tree.ts` | helper | SourceOwner | `git ls-files` read |
| `src/main/git-remote.ts` | rollback | WorkflowOwner | fetch, pull, switch |
| `src/main/git.ts` | rollback | RepositoryOwner | Git effects without an owner; reads |
| `src/main/github.ts` | rollback | WorkflowOwner | Connect to GitHub; `gh` status read |
| `src/main/live-commit.ts` | rollback | RepositoryOwner | per-turn live commit |
| `src/main/managed-child.ts` | rollback | RuntimeOwner / PlatformOwner | guarded legacy spawns |
| `src/main/model-catalog.ts` | bun | ProviderOwner catalog | catalog cache file |
| `src/main/project-dependencies.ts` | rollback | RuntimeOwner | install without the service installer |
| `src/main/project-memory.ts` | rollback | MemoryOwner | memory files |
| `src/main/props.ts` | bun | PlatformOwner | open-in-editor CLIs |
| `src/main/providers-store.ts` | bun | ProviderOwner (Keychain) | connections store |
| `src/main/publish-description.ts` | helper | WorkflowOwner | scratch directory for the description run |
| `src/main/publish-reconcile.ts` | rollback | WorkflowOwner | PR reconciliation |
| `src/main/publish-scope.ts` | helper | WorkflowOwner | Git reads |
| `src/main/publish.ts` | rollback | WorkflowOwner | publish, handoff, saved-run PRs |
| `src/main/scaffold.ts` | rollback | WorkflowOwner | new projects |
| `src/main/sessions-store.ts` | rollback | ConversationOwner | session records |
| `src/main/setup-artifacts.ts` | bun | RepositoryOwner | worktree setup helpers in `.trezi/` |
| `src/main/setup.ts` | rollback | WorkflowOwner | setup helpers |
| `src/main/sidecar-migrate.ts` | bun | EditingOwner | `.dsgn`/`.praxis` sidecar migration |
| `src/main/simulator.ts` | rollback | PlatformOwner | Simulator tools, Metro |
| `src/main/skills-install.ts` | bun | WorkflowOwner | `npx skills add` |
| `src/main/source-commit.ts` | rollback | SourceOwner | source writes without an owner |
| `src/main/trezi-agent-tools.ts` | helper | ProviderOwner (helper process) | Codex tool bridge socket |
| `src/main/update.ts` | bun | WorkflowOwner | update check's `git fetch` |
| `src/main/workflow-legacy.ts` | rollback | WorkflowOwner | legacy workflow runner |
| `src/main/worktree-dependencies.ts` | bun | RepositoryOwner | dependency markers in `.trezi/` |
| `src/main/worktrees.ts` | rollback | RepositoryOwner | worktree lifecycle |
| `src/native/bridge.ts` | rollback | ServiceRuntime | legacy transport spawns the host |
| `src/native/index.ts` | bun | ServiceRuntime / Host | orchestration, legacy `native.lock`, test fixture |
| `src/native/platform.ts` | bun | PlatformOwner | Keychain crypto via `TreziHost --crypto`, `open` |
| `src/native/preferences.ts` | rollback | PreferencesOwner | preferences file |
| `src/native/preview-processes.ts` | rollback | PlatformOwner | running-servers SIGTERM |
| `src/native/profile-path.ts` | bun | ServiceRuntime | profile migration symlinks |
| `src/native/smoke-chat.ts` | test | — | smoke fixture |
| `src/native/smoke-composer.ts` | test | — | smoke fixture |
| `src/native/smoke-core.ts` | test | — | smoke fixture |
| `src/native/smoke-islands.ts` | test | — | smoke fixture |
| `src/native/smoke-projects.ts` | test | — | smoke fixture |
| `src/native/smoke-restore.ts` | test | — | smoke fixture |
| `src/native/smoke-settings.ts` | test | — | smoke fixture |
| `src/native/smoke-shadow-island.ts` | test | — | smoke fixture |
| `src/native/smoke-sheets.ts` | test | — | smoke fixture |
| `src/native/smoke-sidebar.ts` | test | — | smoke fixture |
| `src/native/update-controller.ts` | rollback | WorkflowOwner | update commands without an owner |
| `src/native/workspace.ts` | rollback | WorkspaceOwner | workspace file |

A row whose module no longer has an effect fails the test too, so a transfer removes
its row and the gate count in the same change.

## Gate for removing the legacy owners

All of these, in order; the census test checks the first and the switch's presence:

1. No `bun` row. Each transfer names its files, journals and drafts and tests
   restoration, as every earlier step did.
2. The provider adapters run in supervised helpers after an authorized live parity run
   (`test:native-live`), with the provider store and catalogs moved with them.
3. A full native and live verification of the Swift launch with no legacy module
   loaded. Only then may `TREZI_BACKEND_OWNER=legacy`, the `rollback` rows and
   `TreziService --legacy` be deleted, keeping every store, journal and worktree as is.
