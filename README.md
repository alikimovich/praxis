# dsgn

An AI design & prototyping tool for your own repos. Open a project, dsgn launches
its dev server in a live preview on the right, and a Claude-powered chat on the
left edits the running app — respecting the repo's own `CLAUDE.md` and skills.

> Status: **working v1 + v2 first slice.** Open a folder → dsgn detects the
> framework, runs its dev server, and previews it. The chat is a real multi-turn
> Claude Agent SDK session (markdown, tool-use status, model + thinking selectors,
> `/` skill menu) that edits the running repo with live hot-reload in the preview.
> **New:** a **Select** mode lets you click an element in the live preview to pick
> it — dsgn resolves its source location (via a `data-dsgn-source` stamp, see
> [`docs/DESIGN.md`](docs/DESIGN.md)) and hands the chat a precise edit target.
> Next: prop/token editor panel, then PR handoff.

## Requirements

- **Node ≥ 20** (a `.nvmrc` pins 22). Each teammate needs Node + a package
  manager installed — this tool is distributed as source, run locally.
- A **Claude Pro/Max subscription** for the agent (per-user auth, below).

## Setup

```bash
git clone <repo-url>
cd dsgn
bun install      # or: npm install / yarn

# One-time: authorize the agent with your own Claude subscription.
claude setup-token   # or: claude login

bun run dev      # or: npm run dev / yarn dev
```

In the app, click **Open project…**, pick a repo with a `dev`/`start` script,
and chat on the left. dsgn **owns the dev server** — don't also run `dev`
manually for a project you open here, or you'll hit a port/lock conflict (the
error banner offers a custom-command retry for monorepos / odd setups).

## How it's distributed

There's no signed app or installer. Teammates **clone and run** from source;
updates are a `git pull`. Auth is per-user via `claude setup-token`, so everyone
runs on their own Claude subscription — no shared secret.

## Architecture

```
Electron
├─ main        Agent SDK session · dev-server runner · preview (cwd = opened repo)
├─ preload     typed contextBridge → window.api   (types in src/shared/api.ts)
└─ renderer    React UI: chat (left) + preview slot (right)
               the preview is a native WebContentsView positioned by main
```

- **Preview** is a native `WebContentsView`, not an iframe, so a preload can be
  injected into the previewed app later (element selection → prop editing).
- **Chat** runs a persistent multi-turn Agent SDK `query()` in main; output
  streams over `agent:*` IPC into a zustand store (the seam where assistant-ui
  could later drop in). Respects the repo's `CLAUDE.md` + skills via
  `settingSources` + the `claude_code` system-prompt preset.
- **Conventions** (`CLAUDE.md`, skills, and a planned `DESIGN.md` design-system
  spec) live in the opened repo and travel with it.

## Testing

`bun run test` launches the built app via Playwright + Electron and saves
screenshots to `test/artifacts/` (shell, open→preview with native-view capture,
and chat rendering). Individual: `test:smoke`, `test:preview`, `test:chat`.

## Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Launch the app with HMR |
| `bun run build` | Build main/preload/renderer to `out/` |
| `bun run typecheck` | Type-check main + renderer |
| `bun run test` | Build + run the Playwright/Electron tests |
