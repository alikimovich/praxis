# AGENTS.md — working guide for Trezi

Trezi is a native macOS app: Swift/AppKit/SwiftUI chat and editing tools on the
left, with the user's project in system WebKit on the right. Bun owns provider
sessions, Git/worktrees, source editing, persistence and managed project servers.
A separate Swift XPC service owns profile exclusion, supervises legacy Bun and
holds the durable operation ledger (S03) and, since LKM-91, writes preferences
through it (docs/SWIFT-BACKEND-PREFERENCES.md); since LKM-92 it also owns
workspace identity, order and selection (docs/SWIFT-BACKEND-WORKSPACE.md). Every
other domain writer remains in Bun until a verified transfer.
Electron, the React application renderer and browser/Tailscale mode are retired.
Distributed as source: clone, `bun install`, `bun run dev`. Users authenticate
with their own provider subscriptions or endpoint credentials.

## Start here every session

1. Read the top of `docs/PROGRESS.md` (newest first) and `docs/TASKS.md`.
2. Add a dated entry to PROGRESS and tick TASKS after completing a chunk.
3. Update this file and README in the same commit when implementation contradicts
   them. `test/docs-links.mjs` checks referenced source paths.

## Commands and verification

Use **Bun**, not npm/yarn. Node 22 remains available for tooling/tests. Native
builds require macOS 13.3+ and command-line tools with the macOS 26 SDK.

| Command | Purpose |
| --- | --- |
| `bun run dev` / `bun run dev:native` | Build and launch Swift host + Bun services |
| `bun run build` / `bun run build:native` | Build to `out/native/` |
| `bun run start` | Launch existing native build |
| `trezi --project <repo>` | Launch/open a project through the CLI |
| `bun run typecheck` | Check native/backend/shared and isolated preview code |
| `bun run typecheck:native` | Native/backend/shared check only |
| `node test/run.mjs unit` | Backend and controller tests, no desktop |
| `bun run test:native` | Disposable-profile native desktop integration |
| `bun run test` | Unit + native integration |
| `bun run test:native-live` | Real provider fixture edit; requires authorization |
| `bun run verify` | All tiers including real provider calls |
| `bun run lint` | Biome over source and tests |

After changes run typecheck and the relevant unit checks. Native changes also
require `bun run typecheck:native` and `bun run test:native`. Do not run real
provider calls without authorization. The runner's tiers are `unit`, `native`,
`live`, and `all`; unit concurrency is bounded and desktop/live runs are serial.
Use `--serial` for diagnosis. Logs and JSON reports live in `test/artifacts/runs/`.
SKIP is distinct from PASS. See `docs/TESTING.md`.

Read generated PNGs to verify UI without asking the user. Offscreen AppKit image
caching does not reliably capture Liquid Glass; use visible checks when needed.
`TREZI_NATIVE_BACKGROUND_TEST=1` skips real preview pointer gestures/animation
timing and must be reported as reduced coverage. No Electron tests remain.

## Architecture

- `src/native/index.ts`: Bun entrypoint, service registration and native lifecycle.
- `src/native/platform.ts`: native event routing, WebKit proxy and Keychain helper.
  Services import it directly; there is no Electron alias or dependency.
- `src/native/bridge.ts`: private legacy JSON bridge to the supervising service;
  direct host pipes remain available through launch-time legacy rollback.
- `src/service/ServiceMain.swift`, `src/service/ServiceRuntime.swift`,
  `src/service/ServiceXPC.swift`: separate signed XPC service and authenticated relay.
- `src/service/LegacySupervisor.swift`, `src/service/ProcessGuardian.swift`: profile
  exclusion, Bun/descendant lifetimes and crash cleanup. `src/native/ServiceClient.swift`
  owns the connection; `src/native/HostService.swift` integrates AppKit lifecycle.
- `src/service/OperationLedger.swift`, `src/service/LedgerStore.swift`,
  `src/service/LedgerMirror.swift`: durable operation intent, receipts, revisions,
  event cursors and recovery (docs/SWIFT-BACKEND-LEDGER.md).
- `src/service/PreferencesOwner.swift`, `src/service/PreferencesFile.swift`: the
  Swift preferences writer (v1 `preferences.json`, ledger-backed). Bun reads and
  sends awaited batches via `src/native/preferences-service.ts`;
  `src/native/preferences.ts` is the `TREZI_BACKEND_OWNER=legacy` rollback writer.
- `src/service/WorkspaceOwner.swift`, `src/service/WorkspaceFile.swift`,
  `src/service/DomainChannel.swift`: the Swift workspace writer (unchanged
  `workspace.json`, ledger-backed; identity, order, selection, recents). Bun sends
  awaited intents via `src/native/workspace-service.ts`; `src/native/workspace.ts`
  is the rollback writer and `src/native/workspace-model.ts` the shared operations.
- `src/native/Host.swift`: AppKit app lifecycle and host protocol.
- `src/native/ProjectCell.swift`: sidebar row rendering and native project drag reordering.
- `src/native/Shell.swift`: sidebar/project actions, split view and column-aligned
  toolbar (sidebar toggle, chat actions, preview controls, Publish).
- `src/native/Chat.swift` / `src/native/Composer.swift`: native chat and text input.
  Bun `src/native/chat-controller.ts` owns drafts, streaming, queues, model and
  permission choices. `src/native/shell-controller.ts` owns workspace navigation.
- `src/native/ShadowIsland.swift` renders the Shadow Light compound chat block.
  `src/main/shadow-controls.ts` validates its seven inputs and derives the CSS or
  Tailwind output; `chat-island-source.ts` writes them atomically. The current
  provider entrypoint is `chat_island`; it shares the define-controls manifest schema.
- `src/native/ChatActivity.swift`, `StreamingText.swift`: text-only live activity and native
  word reveal. `Cat.swift` supplies cats for other app surfaces.
- `src/native/WorkspaceLayout.swift`: geometry and AppKit divider input.
- `src/native/SourceEditor.swift`, `src/native/Layers.swift`,
  `src/native/EditingInspector.swift`, `src/native/ContentWindow.swift`:
  native source, layers, property/style and recipe-driven content editing.
- `src/native/Sheets.swift`: New Project, memory, settings and provider forms;
  Bun controllers own service operations. Forms use standalone titled, resizable
  windows with traffic lights and an action bar only when needed. Settings and
  project memory autosave; close/navigation waits for their latest write. Swift owns welcome/status/cat surfaces.
- `src/native/assets/cat`: original animation assets consumed by the native build.
- `src/main/project-ui*.ts`: Experimental Gen UI discovery, strict React/Svelte
  composition export and optional Jev topology selection. Helpers return source
  proposals only; supported contracts and limitations are in `docs/PROJECT_UI.md`.
- `src/main/`: retained backend services (the directory name is historical).
  Agent/provider sessions, dev servers, Git/worktrees, setup, source parsers,
  props/styles/tokens, annotations, diagnostics, media and iOS Simulator.
- `src/shared/api.ts`: shared service types. `src/shared/preview-channels.ts`:
  selection/style/layer message names. Keep producers and consumers in sync.
- `src/preview/preload.ts`: isolated project DOM instrumentation, using
  `src/native/preview-transport.ts`. The project preview is the only WebKit view.
- `scripts/build-native.mjs`: bundles services and preview, compiles Swift and
  checks that the app does not depend on Electron or the retired React renderer.
- `bin/trezi.mjs`, `install.sh`: source installation, native launch and update.

The host and Swift service communicate over authenticated XPC; the service and
legacy Bun use private pipes. `TREZI_BACKEND_OWNER=legacy` selects the previous
Bun/host transport at launch under the same Swift profile exclusion. See
`docs/SWIFT-BACKEND-SERVICE.md` for rollback and verification limits.
Preview messages are untrusted and are
restricted by actual view identity and an allowlist. The preview cannot invoke
agent, filesystem or application commands. Preserve WKContentWorld isolation.
Native profiles remain separate from historical Electron profiles; do not delete
or implicitly migrate existing user data. See `docs/NATIVE.md`.

Trezi **owns** target dev-server lifetimes: never run the target's `dev` manually.
The app awaits managed process-group cleanup on quit and terminal shutdown,
force-stopping survivors after a one-second grace period. Swift edits require
rebuild/restart; the user's project retains its own HMR.

Claude and Codex share on-demand preview location/screenshot observation. The Codex
MCP helper must preserve screenshot image content, not JSON-stringify it. These
observe the current user view; they do not prove private worktree edits have landed.

Provider SDKs remain in process in Bun. Source editing still uses JavaScript
parsers (TypeScript/Babel/React Docgen/Svelte/parse5); React-related names do not
imply a remaining application renderer. React/React DOM are development-only
fixtures for generated project component tests. The vendored content-controls
package contains only its used recipe/API modules and supporting declarations.

## Conventions and hard-won constraints

- Keep files under about 500 lines; extract modules from oversized files.
- SDKs are ESM-only; the bundled backend is CJS. Use dynamic `import()` for SDKs.
- Auth is per-user at runtime; never commit secrets.
- Register new `.mjs` tests in the correct tier in `test/run.mjs`.
- Commit small, focused changes with a Co-Authored-By trailer. Commits are
  pre-authorized; do not ask again before staging/committing in-scope work.
- Prop editing requires `PropInspection.hasSchema`; unresolved components remain
  prompt-only. React and Svelte have separate splice engines.
- Agents cannot write target `.trezi/`, legacy `.praxis/` or `.dsgn/` directories.
- The project was originally **dsgn**. Preserve intentional legacy migration and
  cleanup strings in setup, git, sidecar migration and agent persistence. Do not
  rewrite historical `docs/PROGRESS.md` entries.
- Keep `docs/WORKTREES.md` and `docs/PROVIDERS.md` current for lifecycle/provider
  changes. Project memory and Main-context reset are in `docs/MEMORY.md`.

Trezi rename compatibility and rollback: `docs/rename/MIGRATION.md`. Keep stable
OS/MCP identities and legacy aliases until a separately verified migration exists.
