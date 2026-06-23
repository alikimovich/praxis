# dsgn

An AI design & prototyping tool for your own repos. Open a project, dsgn launches
its dev server in a live preview on the right, and a Claude-powered chat on the
left edits the running app — respecting the repo's own `CLAUDE.md` and skills.

> Status: **v1 skeleton.** The Electron shell, two-pane layout, and native
> `WebContentsView` preview are wired. The chat is a placeholder streaming an
> echo; the Agent SDK, dev-server runner, and assistant-ui chat land next.

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
# (Lands when the Agent SDK is wired — placeholder for now.)
claude setup-token

bun run dev      # or: npm run dev / yarn dev
```

## How it's distributed

There's no signed app or installer. Teammates **clone and run** from source;
updates are a `git pull`. Auth is per-user via `claude setup-token`, so everyone
runs on their own Claude subscription — no shared secret.

## Architecture

```
Electron
├─ main        Agent SDK session · dev-server runner · git/PR (cwd = opened repo)
├─ preload     typed contextBridge → window.api
└─ renderer    React UI: chat (left) + preview slot (right)
               the preview is a native WebContentsView positioned by main
```

- **Preview** is a native `WebContentsView`, not an iframe, so a preload can be
  injected into the previewed app later (element selection → prop editing).
- **Chat** streams over `agent:*` IPC into a store; assistant-ui's
  ExternalStoreRuntime plugs in next.
- **Conventions** (`CLAUDE.md`, skills, and a planned `DESIGN.md` design-system
  spec) live in the opened repo and travel with it.

## Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Launch the app with HMR |
| `bun run build` | Build main/preload/renderer to `out/` |
| `bun run typecheck` | Type-check main + renderer |
