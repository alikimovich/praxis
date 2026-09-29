# Agent guide — architecture: Swift host, Bun services and isolated project WebKit

Moved from the old `CLAUDE.md` ("Architecture", "Why it's built this way") and
`AGENTS.md` ("Architecture"). Linked from [AGENTS.md](../../AGENTS.md). The Swift
XPC service and its domain owners are in [service-owners.md](service-owners.md);
the `src/main/` backend map is in [backend-map.md](backend-map.md).

## Native app, preview, shared contract

```
src/
  native/         Swift/AppKit/SwiftUI UI + Bun controllers
    index.ts        Bun entrypoint: service registration, project lifecycle and host bridge
    Host.swift      AppKit application lifecycle and JSON host protocol
    ServiceClient.swift / HostService.swift   the host's versioned XPC connection to
                    the Swift service (handshake, reattach, bounded outbox) and its
                    AppKit quit/restart/exit-status integration
    bridge.ts       private legacy JSON bridge to the supervising service
    Shell.swift     sidebar/project actions, project/chat navigation, split view and
                    the column-aligned toolbar (sidebar toggle, chat actions, preview
                    controls, Publish)
    ProjectCell.swift  sidebar row rendering and native project drag reordering
    Chat.swift / Composer.swift   native conversation and text input. Bun
                    chat-controller.ts owns drafts, streaming, queues, model and
                    permission choices; shell-controller.ts owns workspace navigation
    ShadowIsland.swift  renders the Shadow Light compound chat block.
                    main/shadow-controls.ts validates its seven inputs and derives the
                    CSS or Tailwind output; main/chat-island-source.ts writes them
                    atomically. The current provider entrypoint is `chat_island`; it
                    shares the define-controls manifest schema
    ChatActivity.swift / StreamingText.swift   text-only live activity and native
                    word reveal. Cat.swift supplies cats for other app surfaces
    WorkspaceLayout.swift        authoritative view/divider geometry and AppKit divider input
    SourceEditor.swift / Layers.swift / EditingInspector.swift / ContentWindow.swift
                    native source, layers, property/style inspector and recipe-driven
                    content editing
    Sheets.swift    New Project, memory, settings and provider forms; Bun controllers
                    own service operations. Forms use standalone titled, resizable
                    windows with traffic lights and an action bar only when needed.
                    Settings and project memory autosave; close/navigation waits for
                    their latest write. Swift owns welcome/status/cat surfaces
    platform.ts     direct native service imports, native event routing, WebKit proxy,
                    Keychain helper. Services import it directly; there is no Electron
                    alias or dependency
    preview-transport.ts   restricted isolated WKContentWorld transport
    assets/cat/     original native animation artwork consumed by the native build
  preview/preload.ts  isolated WKWebView instrumentation: selection, comments,
                    annotations (isolated project DOM instrumentation, using
                    native/preview-transport.ts); own tsconfig (tsconfig.preview.json)
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
  shared/preview-channels.ts  the raw channel NAMES (selection/style/layer messages)
                    for the one IPC surface api.ts can't type: main ⇄ the sandboxed
                    preview preload (no contextBridge there, so it's bare
                    `ipcRenderer` strings). Imported by BOTH ends
                    (src/main/preview-ipc.ts + index.ts, and src/preview/preload.ts)
                    — never re-declare one locally
  shared/token-match.ts  which design tokens may be offered for a css property
                    and which one a computed value IS. Pure + used by BOTH main
                    (re-validating a pick) and the island (chips + picker)
  shared/run-stats.ts  the chat status line's numbers: main normalizes each
                    provider's usage payload + dedupes its repeated cumulative
                    readings into `usage` event deltas, native chat state
                    accumulates them for the Swift status line
  shared/style-props.ts  the Styles panel's v1 editable CSS-property allowlist
                    (the `StyleProp` union). main/styles.ts derives its
                    `STYLE_PROPS` from it (the actual write-time boundary)
  service/        the Swift XPC service — see service-owners.md
  main/           backend services — see backend-map.md
bin/trezi.mjs     the `trezi` CLI (launch, `trezi --project <repo>`, `--update`); owns
                  the update sequence (git pull + bun install + build). install.sh boots it
scripts/build-native.mjs  bundles services and preview, compiles Swift and checks that
                  the app does not depend on Electron or the retired React renderer
test/             hand-rolled .mjs tests + fixtures/ + artifacts/ (PNGs, gitignored)
docs/             TASKS (next) / PROGRESS (log + rationale) / DESIGN (stamp spec)
```

## Lifecycle

- `install.sh` (curl one-liner) clones to `~/.trezi`, builds, and puts `trezi` on
  PATH. `trezi` launches the built app; `trezi --update` pulls + rebuilds. Native
  Settings uses `src/native/update-controller.ts` to guard unsaved work,
  check/pull/install/build, and restart.
- `bun run dev`/`start`/`trezi` go through `scripts/start-native.mjs`; see
  [service-owners.md](service-owners.md) for what the Swift service owns and the
  `TREZI_BACKEND_OWNER=legacy` rollback.
- The chat runs in `main` via provider SDKs; output streams over `agent:*` IPC into
  Bun chat controllers, which send typed state to Swift.
- Trezi **owns** the dev-server lifecycle of the target repo: never run the target's
  `dev` manually; it's killed on app quit. The app awaits managed process-group
  cleanup on quit and terminal shutdown, force-stopping survivors after a one-second
  grace period. Under the Swift launch the service owns those process groups and
  drains them before releasing the profile lock, and a crashed service's groups are
  stopped by their watchdogs or the next launch's journal sweep.
- Swift edits require rebuild/restart; the user's project retains its own HMR.

## Trust boundaries and retained runtimes

- Preview messages are untrusted and are restricted by actual view identity and an
  allowlist. The preview cannot invoke agent, filesystem or application commands.
  Preserve WKContentWorld isolation. The project preview is the only WebKit view.
- Native profiles remain separate from historical Electron profiles; do not delete
  or implicitly migrate existing user data. Electron, the React application renderer
  and browser/Tailscale mode are retired. See `docs/NATIVE.md`.
- Claude and Codex share on-demand preview location/screenshot observation. The Codex
  MCP helper must preserve screenshot image content, not JSON-stringify it. These
  observe the current user view; they do not prove private worktree edits have landed.
- Provider SDKs remain in process in Bun. Source editing still uses JavaScript parsers
  (TypeScript/Babel/React Docgen/Svelte/parse5); React-related names do not imply a
  remaining application renderer. React/React DOM are development-only fixtures for
  generated project component tests. The vendored content-controls package contains
  only its used recipe/API modules and supporting declarations.
- Experimental Gen UI (the `project-ui` modules in `src/main/`, e.g.
  `src/main/project-ui.ts`): discovery, strict React/Svelte composition export and
  optional Jev topology selection. Helpers return source proposals only; supported
  contracts and limitations are in `docs/PROJECT_UI.md`.

## Why it's built this way (non-obvious choices)

- **Agent core = SDK in-process** (not ACP/subprocess): the product's custom tools
  (select element → edit props → annotate → PR) are wired to the renderer and need
  in-process SDK tools.
- **Preview = system `WKWebView`**: isolated instrumentation selects elements and
  talks to Bun through a view-identity-checked message allowlist.
- **Prop editing is hybrid**: simple literals splice straight into source (instant
  HMR); complex/expression values fall back to the agent. React and Svelte have
  separate engines because their ASTs differ; selection/tokens are framework-agnostic
  (they only need the `data-trezi-source` stamp — see `docs/DESIGN.md`).
