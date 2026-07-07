# Praxis

> The product is **Praxis** (`package.json`); the repo, GitHub remote, and the
> `data-dsgn-source` stamping protocol are still named **dsgn**. See
> [`docs/REVIEW-2026-07-07.md`](docs/REVIEW-2026-07-07.md) for the rebrand plan.

An AI design & prototyping tool for your own repos. Open a project, Praxis
launches its dev server in a live preview on the right, and an AI chat on the
left edits the running app — respecting the repo's own `CLAUDE.md` and skills.

Unlike a sandbox (Figma Make, Claude Code's scratch dir), Praxis edits *your
real repository* with live hot-reload, and hands the result off as a branch +
GitHub PR.

## What it does

- **Live preview of your repo.** Open a folder → Praxis detects the framework
  and package manager, boots that repo's dev server, and previews it in a
  native `WebContentsView`. It self-heals if the dev server dies and restarts.
- **AI chat that edits the running app.** A persistent multi-turn agent session
  streams over IPC and edits source with hot-reload. Backends are pluggable —
  Claude (via the Agent SDK), Codex, and Gemini behind one provider seam
  (Gemini is experimental; see the review doc).
- **Click-to-edit.** A **Select** mode maps a clicked element to its source
  location (via the `data-dsgn-source` stamp — see
  [`docs/DESIGN.md`](docs/DESIGN.md)), then edits its **props** with typed
  controls (react-docgen for React, `svelte/compiler` for Svelte 5), applies
  the repo's **design tokens** (auto-detected from a manifest, Tailwind, or CSS
  vars), and edits text inline. Non-literal cases route to the chat.
- **Review → handoff.** Pin comments/notes to elements and **Publish** a branch
  + GitHub PR. Comments can spawn parallel background agent sessions (each in
  its own git worktree).
- **iOS Simulator preview** for Expo/React Native projects (Metro detect + an
  MJPEG bridge into the preview pane).
- Tool calls run behind approve/deny cards, or an Auto mode. Edits are
  undoable (`Cmd+Z`) via an edit-history stack.

## Requirements

- **Node 22** (`.nvmrc`) and **Bun** (`bun@1.3.x`). Distributed as source, run
  locally — each teammate needs Node + Bun installed.
- A provider subscription for the agent (e.g. Claude Pro/Max), authorized
  per-user (below). No shared secret.
- macOS is the primary target (the postinstall step rebrands the dev Electron
  bundle to Praxis and is macOS-only; it no-ops elsewhere).

## Setup

```bash
git clone git@github.com:alikimovich/dsgn.git
cd dsgn
bun install                # runs scripts/patch-electron.mjs (macOS: brands the dev app)

claude setup-token         # one-time: authorize the agent with your own subscription

bun run dev                # electron-vite, HMR
```

In the app, click **Open project…**, pick a repo with a `dev`/`start` script,
and chat on the left. Praxis **owns the dev server** — don't also run `dev`
manually for a project you open here, or you'll hit a port/lock conflict (the
error banner offers a custom-command retry for monorepos / odd setups).

Updates are a `git pull`; there is no signed app or installer.

## Architecture

Four process boundaries (details in [`CLAUDE.md`](CLAUDE.md)):

```
Electron
├─ main            agent session · dev-server runner · provider backends · iOS sim
│                  · prop/text/token edit engines · annotations→PR · git/worktrees
├─ preload         typed contextBridge → window.api      (types in src/shared/api.ts)
├─ preview/preload injected into the PREVIEWED app: element select, comments, tokens
└─ renderer        React 18 + Tailwind v4 + shadcn/ui: chat (left) + preview (right)
```

- **Preview** is a native `WebContentsView`, not an iframe, so a second preload
  is injected into the previewed app for element selection.
- **Chat** streams over `agent:*` IPC into a zustand store (the seam between
  transport and UI). It respects the opened repo's `CLAUDE.md` + skills via
  `settingSources` + the `claude_code` system-prompt preset.
- **Conventions travel with the opened repo** — its `CLAUDE.md`, skills, and
  `DESIGN.md` describe how Praxis should edit it.

## Testing

Tests are hand-rolled `.mjs` scripts in three tiers:

- **Unit** (pure Bun, no display): `bun test/<name>.mjs` — fast, always run the
  relevant ones.
- **UI** (Playwright + Electron against the built app): `bun run test:<name>` —
  drives the app and screenshots to `test/artifacts/`; **read the PNGs** to
  confirm UI visually.
- **Live e2e** (`test:agent`, `test:codex`, `test:sim-e2e`): run a real provider
  turn / simulator; self-SKIP without credentials.

`bun run test` runs unit + UI; `bun run verify` adds the live e2e tier.

## Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Launch the app with HMR |
| `bun run build` | Build main/preload/preview/renderer to `out/` |
| `bun run typecheck` | Type-check all three tsconfig projects |
| `bun run test` | Build + run unit and Electron UI tests |
| `bun run verify` | `test` + live-agent/simulator e2e (needs creds + display) |
