# Praxis

An AI design & prototyping tool for your own repos. Open a project, Praxis
launches its dev server in a live preview on the right, and an AI chat on the
left edits the running app using the selected provider's native harness.

Unlike a sandbox (Figma Make, Claude Code's scratch dir), Praxis edits *your
real repository* with live hot-reload, and hands the result off as a branch +
GitHub PR.

## What it does

- **Choose how a new project starts.** New Project asks whether to use the
  React/TypeScript/Vite defaults, plan Next.js or Svelte, or discuss your own
  environment. The discussion paths initialize an empty repository and open chat
  before creating an app. After environment changes land, Praxis re-detects the
  framework, installs dependencies in the preview checkout, and restarts the web
  preview. Custom launch commands are preserved; startup errors keep chat available.

- **Live preview of your repo.** Open a folder → Praxis detects the framework
  and package manager, boots that repo's dev server, and previews it in a
  system WebKit `WKWebView`. It self-heals if the dev server dies and restarts.
  Plain HTML/CSS/JS folders (no package.json or build step) are served by a
  built-in static server with live-reload; anything Praxis can't auto-launch
  prompts for a custom command.
- **Pull updates and remote branches.** Click the current branch → **Git updates…**
  to fetch branches from GitHub or another Git remote, merge a selected remote
  branch into the current branch, or switch to a local tracking branch. Existing
  local branches are preserved. Pull conflicts restore the clean starting tree;
  successful updates refresh the preview, including changed dependencies.
- **AI chat that edits the running app.** A persistent multi-turn agent session
  streams over IPC and edits source with hot-reload. Backends are pluggable —
  Claude (via the Agent SDK), Codex, and Gemini behind one provider seam
  (Gemini is experimental, gated behind `PRAXIS_EXPERIMENTAL_GEMINI`). Their
  capabilities differ; see [`docs/PROVIDERS.md`](docs/PROVIDERS.md).
- **Peer chats and project memory.** Every project has a flat set of isolated,
  independently named chats, with background agents nested under the chat that
  launched them. After successful turns, Praxis conservatively learns durable
  decisions into unified project memory shared by every chat; it lives outside Git
  and remains directly editable. See [`docs/MEMORY.md`](docs/MEMORY.md).
- **Bring your own model.** Beyond the two subscription seats, Settings →
  Models & Providers connects any OpenAI-compatible endpoint serving the
  `/responses` API — Vercel AI Gateway, Groq, or a custom host — so open models
  like Kimi or DeepSeek can drive a chat. Paste a key, Praxis fetches that
  endpoint's model catalog, and you tick which models to offer in the picker.
  Connections run on the Codex harness; the key is encrypted with the OS
  keychain and never leaves the main process.
- **Arrange the sidebar.** Drag project names to move their entire groups, or
  drag chats within their project's live list or History. A lifted row and drop
  line show the move; Escape cancels and the sidebar scrolls at its edges.
  Alt+↑/↓ reorders the focused name with the keyboard. Manual order persists
  across reloads/restarts without changing the active chat or running sessions.
- **Drag to reorder in the desktop preview.** Select an element, then hold
  Command and drag it among its siblings. An insertion
  line shows the drop position for columns, rows, and grids; nesting stays fixed.
  Escape or releasing the modifier cancels. Moves write source and support undo;
  ambiguous template/data moves prepare a chat prompt.
- **Queue follow-ups.** Enter during a running turn queues the message for that
  chat, including its attachments and selected objects. Remove pending messages,
  or resume after Stop/errors. Queues last for the current app session.
- **Stay in your project.** Chat links open separately; the preview's home button
  returns to the managed project's entry page. Successful merges stay quiet,
  with Revert retained on the response. Independent text edits merge automatically;
  overlapping text gets one automatic reconciliation attempt before showing Resolve.
- **Click-to-edit.** Hold **Shift** while clicking to add or remove objects from
  a selection. Chat requests and Delete include the group; individual property
  controls target the most recent object. A **Select** mode maps a clicked element to its source
  location (via the `data-praxis-source` stamp — see
  [`docs/DESIGN.md`](docs/DESIGN.md)), then edits its **props** with typed
  controls (react-docgen for React, `svelte/compiler` for Svelte 5), applies
  the repo's **design tokens** (auto-detected from a manifest, Tailwind, or CSS
  vars), and edits text inline. Non-literal text cases run as detached background
  agents without entering the visible chat.
- **Ask to see the exact code.** Praxis can open its mini code editor in the
  relevant file and highlight the implementation, without selecting an object.
  Unsaved editor changes are preserved; available with Claude and Codex.
- **Surface native animation controls.** Ask “surface animation controls” or use
  `/animation-controls`. Praxis shows its own sliders, toggles, and easing controls
  beside the preview, with Replay and no selection required. Changes save to source
  through Undo and HMR. No DialKit dependency or control-panel UI is added to the app.
- **Next.js source mapping.** Setup detects Next separately from React/Vite and
  provides development-only Turbopack/webpack adapters, with optional MDX mapping.
  It preserves config wrappers and existing component types, synchronizes helpers
  into chat worktrees, and verifies stamps after landing and preview restart.
  Next validation worktrees install their own dependencies instead of linking a
  `node_modules` directory outside Turbopack's root.
- **Inspect components in 3D (desktop).** Select an element and click the stacked
  layers icon to isolate its visual structure. Orbit, zoom, spread layers apart,
  and select a surface to edit it with the existing inspector. **Back to page**
  returns to the running screen. See [3D inspection](docs/THREE_D.md) for controls
  and first-version rendering limits.
- **Preview observation.** Claude and Codex can request the current preview route
  and a screenshot. Codex-based custom endpoints expose the same tools; viewing
  screenshots requires an image-capable model. Browser interaction and responsive
  checks use agent-browser when available.

- **Controls from chat.** Ask Claude, Codex, or a custom-endpoint model to surface
  animation controls in the desktop preview. It can select the object and open
  Props, Styles, or Custom directly. Custom controls include numeric scrubbing,
  toggles, color pickers, and easing curves. Props and Styles show authored values
  by default; **Show all** exposes optional props and computed styles.
- **Review → handoff.** Pin comments/notes to elements and **Publish** a branch
  + GitHub PR. Comments and complex inline text edits can spawn parallel background
  agent sessions (each in its own git worktree).
- **Concurrent-chat isolation.** Git-root projects give each chat a private
  worktree and serialize publication through one live-checkout writer. Recovery
  branches exist only during active or parked work and are deleted after a
  successful landing; see [`docs/WORKTREES.md`](docs/WORKTREES.md).
- **iOS Simulator preview** for Expo/React Native projects (Metro detect + an
  MJPEG bridge into the preview pane).
- Tool calls run behind approve/deny cards, or an Auto mode. Edits are
  undoable (`Cmd+Z`) via an edit-history stack.

## Requirements

- **Node 22** (`.nvmrc`) and **Bun** (`bun@1.3.x`). Distributed as source, run
  locally — you need Node + Bun installed.
- A provider subscription for the agent (e.g. Claude Pro/Max), authorized
  per-user (below) — or your own API key for a third-party endpoint, added in
  Settings. Either way it is per-user; there is no shared secret.
- **macOS 13.3+**, Xcode command-line tools with the **macOS 26 SDK**.
  Liquid Glass requires macOS 26; older releases use native fallback materials.

## Install

One line — clones to `~/.praxis` (override with `PRAXIS_HOME`), installs, builds,
and puts a `praxis` command on your `PATH`:

```bash
curl -fsSL https://raw.githubusercontent.com/alikimovich/praxis/main/install.sh | bash
```

The installer recommends **agent-browser** for automated browser checks, including
different screen sizes, and asks whether to install its global CLI and browser.
It uses Bun, skips the offer when the CLI is
already on PATH, and defaults to **No**. Unattended installs skip the prompt.
An optional browser-install failure does not prevent Praxis installation.
To install it later: `bun install --global agent-browser && agent-browser install`.
Praxis's built-in agent instructions require its use when available for web UI
verification, including phone/tablet/desktop checks for layout changes. Agents
must report missing browser support or a preview that cannot yet show their edits.

Then authorize the agent once and launch:

```bash
claude setup-token   # one-time: authorize the agent with your own subscription
praxis               # launch the app (builds on first run)
praxis --project ./my-app # open a project directly
```

In the app, click **Open project…**, pick a repo with a `dev`/`start` script,
and chat on the left. Praxis **owns the dev server** — don't also run `dev`
manually for a project you open here, or you'll hit a port/lock conflict (the
error banner offers a custom-command retry for monorepos / odd setups).

## Updating

```bash
praxis --update      # git pull + bun install + rebuild
```

The native Settings update workflow checks the remote, guards unsaved work,
then pulls, installs, rebuilds and restarts. There's no signed app or auto-download — updates are
always a git pull of your checkout.

## Develop on Praxis itself

Contributors work in the checkout directly instead of the installed copy:

```bash
git clone https://github.com/alikimovich/praxis.git
cd praxis
bun install
bun run dev          # build and launch the native app
bun link             # optional: expose the `praxis` command from this checkout
```

## Architecture

Praxis has a Swift/AppKit/SwiftUI interface, a Bun service process, and one
WebKit view for the user's project. See [Native architecture](docs/NATIVE.md).

- **Swift** owns chat, composer, sidebar, toolbar, sheets and inspectors.
- **Bun** owns provider sessions, Git/worktrees, files, source editing, persistence
  and managed project servers. Services in `src/main/` are retained backend code;
  that directory name does not imply an Electron runtime.
- **Preview** runs in `WKWebView` with an isolated selection/editing script.
- **Transport** is JSON over pipes between Swift and Bun; preview messages are
  checked against a restricted allowlist.

Electron and the old React application UI have been removed. Browser/Tailscale
mode (`praxis serve`) is retired; the CLI reports that explicitly. The native
profile stays separate from old Electron profiles, which are not deleted or
silently migrated. Existing provider CLI logins remain available.

## Testing

Tests are `.mjs` scripts in three tiers: `unit` (Bun backend/controller logic),
`native` (Swift/AppKit integration with a disposable profile), and `live`
(real provider edits, requiring credentials). Native tests skip on unsupported
hosts; skips remain distinct from passes. Native and live tests run serially.

`bun run test` runs unit and native checks. `bun run verify` adds live checks;
run live provider calls only when authorized. Logs and JSON summaries are written
to `test/artifacts/runs/`. Read captured PNGs to verify UI changes; offscreen
Liquid Glass captures have limitations. See [Testing](docs/TESTING.md).

## Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Build and launch the native app |
| `bun run build` | Build Swift, Bun backend and isolated preview to `out/native/` |
| `bun run start` | Launch the existing native build |
| `bun run typecheck` | Check backend/native/shared code and preview code |
| `bun run test` | Unit and native integration checks |
| `bun run test:native` | Native integration only |
| `bun run test:native-live` | Real provider fixture edit (credentials required) |
| `bun run verify` | All tiers, including real provider calls |

The `dev:native`, `build:native` and `typecheck:native` aliases remain supported.
Swift changes require rebuilding/restarting; there is no application HMR server.
WebKit rendering may differ from Chromium. Older macOS releases and iOS Simulator
still need release validation; see [current limits](docs/NATIVE.md).

### Compose UI from project components

Enable **Settings → Use project components** to have Claude or Codex compose React
UI from the opened project’s components and styles using json-render. This is
experimental and off by default. The setting is saved on this device and captured
when you submit a message. Turning it off restores ordinary editing and keeps
generated source. Choose **Jev (experimental)** as the composition engine to try
Jev with your saved Vercel AI Gateway connection from Settings. See [scope and workflow](docs/PROJECT_UI.md).

### Content editors from chat

Ask chat to surface controls for content, components or animations; the bundled
`surface-controls` skill chooses the appropriate native workflow. Praxis uses content-controls
editors beside the preview, with drafts, Save to source and Undo. Ask to use Jev to
choose content sections or animation/component parameters. Without a Gateway key,
controls use the chat model automatically and report that fallback. See [content controls](docs/CONTENT_CONTROLS.md)
for JSON bindings, Gateway setup and current limits.

### Native chat motion

The active response shows a 20-point animated pixel cat beside the status line
for thinking, writing, tool work and user waits. Token totals stay in the footer.
New prose words softly resolve on
macOS 15+; older systems show text immediately. Reduce Motion disables the reveal
and status animation. The composer button beam runs only during active generation,
not idle drafts, approval waits, stopping or applying completed changes.
