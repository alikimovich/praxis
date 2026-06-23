# CLAUDE.md — working guide for dsgn

dsgn is an Electron app: a Claude-powered chat (left) that edits a user's repo,
with that repo's dev server live-previewed (right). Distributed as source
(clone + `bun install` + `bun run dev`); each user authenticates with their own
Claude subscription via `claude setup-token` / `claude login`.

## Start here every session

1. Read `docs/CONTEXT.md` (current state, decisions + rationale, what's verified).
2. Read `docs/TASKS.md` (the roadmap / what to do next).
3. When you finish a chunk, append to `docs/PROGRESS.md` and tick `docs/TASKS.md`.

## Commands

| Command | What |
| --- | --- |
| `bun run dev` | Launch the app (electron-vite, HMR) |
| `bun run build` | Build main/preload/renderer to `out/` |
| `bun run typecheck` | Type-check main + renderer (run after every change) |
| `bun run verify` | **Self-test: build + all Playwright/Electron tests** (see below) |

Use **bun**, not npm/yarn.

## Verify your own work WITHOUT asking the user

After any change: `bun run typecheck && bun run verify`, then **Read the PNGs in
`test/artifacts/`** to see the actual UI. This is how you confirm work visually
without a human watching.

- `test/smoke.mjs` — shell renders, composer works.
- `test/open-preview.mjs` — opens a fixture repo, asserts the preview navigates;
  captures the native preview via `capturePage()` → `03b-preview-content.png`.
- `test/chat-render.mjs` — drives the store to verify markdown + toolbar + `/` menu.
- `test/agent-e2e.mjs` — **runs a REAL Claude turn** that edits a fixture file and
  asserts the file changed. Auto-**SKIPs** (exit 0) if no Claude credentials are
  present; **FAILS** if the turn ran but didn't edit. This is the one test that
  proves the agent actually works end-to-end — run it on a machine where you've
  done `claude login`.

The harness uses Playwright's Electron support against the built app and can read
the renderer DOM, click, and screenshot. The preview is a native `WebContentsView`
(separate CDP target) — it is NOT in renderer page screenshots; use `capturePage()`
or read its URL via `electronApp.evaluate(({webContents}) => ...)`.

## Architecture

```
src/
  main/        Electron main (Node)
    index.ts       window + native WebContentsView preview (IPC geometry sync)
    devserver.ts   detect framework/PM, spawn dev server, parse URL, readiness
    agent.ts       persistent multi-turn Claude Agent SDK query() session
  preload/index.ts contextBridge → window.api  (contextIsolation on, sandboxed)
  shared/api.ts    types shared across main/preload/renderer (the IPC contract)
  renderer/src/    React UI (App, ChatPanel, PreviewPane, Markdown, store)
test/            Playwright/Electron tests + fixtures
```

- The preview is a native `WebContentsView`, not an iframe — so a preload can be
  injected into the previewed app later (v2 element selection).
- The chat runs in `main` via the Agent SDK; output streams over `agent:*` IPC
  into a zustand store. The store is the seam (assistant-ui could drop in here).
- dsgn **owns** the dev-server lifecycle (don't run the target's `dev` manually).

## Conventions

- **Plain CSS** with custom properties in `renderer/src/styles.css`. No Tailwind,
  no UI kit. Minimalist.
- The Agent SDK is **ESM-only** — `main` is CJS, so it's loaded via dynamic
  `import()` in `agent.ts` (never a static/`require` import).
- All cross-process types go in `src/shared/api.ts`; keep `DsgnApi` and the
  preload + ipc handlers in sync.
- Auth is per-user at runtime (never commit secrets). Nothing sensitive in-repo.
- Commit in small, focused commits with the Co-Authored-By trailer.
