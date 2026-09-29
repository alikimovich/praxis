# Agent guide — conventions, secrets and legacy names

Moved from the old `CLAUDE.md` (intro, "Conventions") and `AGENTS.md` ("Conventions
and hard-won constraints"). Linked from [AGENTS.md](../../AGENTS.md).

## Code

- Application UI is Swift/AppKit/SwiftUI. Reuse existing system font sizes, line
  heights and native controls rather than introducing arbitrary scales. Tailwind
  support remains in source-editing tools for the user's projects.
- The Claude Agent SDK (like the other provider SDKs) is **ESM-only** — `main` is CJS,
  so it's loaded via dynamic `import()` in `agent.ts`/`backends/` (never
  static/`require`).
- All cross-process types go in `src/shared/api.ts`; keep service handlers, Bun
  controllers, preview transport and Swift state/action contracts in sync. Preview
  message names live in `src/shared/preview-channels.ts`; keep producers and
  consumers in sync.
- Keep files under ~500 lines; extract modules instead of growing oversized files.
- New test = new `.mjs` in `test/` **plus** its name in the right tier array in
  `test/run.mjs` (`unit` / `native` / `live`). `bun run test` and `verify` dispatch
  through the runner — don't hand-edit `&&` chains.
- Prop editing requires `PropInspection.hasSchema`; unresolved components remain
  prompt-only. React and Svelte have separate splice engines.
- Project memory and Main-context reset are documented in `docs/MEMORY.md`.

## Auth and secrets

- Auth is per-user at runtime; never commit secrets. Nothing sensitive in-repo.
- Distributed as source (clone + `bun install` + `bun run dev`); each user
  authenticates with their own provider subscription (`claude setup-token` /
  `claude login`; Codex and Gemini backends exist behind the same seam) or endpoint
  credentials.
- The two built-in seats use subscription login (Claude `setup-token` / Codex
  sign-in-with-ChatGPT). A v10 *connection* is the one path that uses an API key —
  the user's own, encrypted with `safeStorage` under userData and confined to main.
  It must never reach the renderer, argv, a log line, or an error string; the UI
  only ever observes `hasKey`.

## The old name (dsgn) and the rename

The project's original name was **dsgn**. A repo-wide rename (2026-07) swept it out of
the code — the stamp is `data-trezi-source`, the sidecar is `.trezi/`, work branches
are `trezi/*`. The old name survives only in deliberate legacy shims: setup uninstall
removes old `.dsgn/` helpers, `git.ts` recognizes `dsgn/*` work branches,
`sidecar-migrate.ts` moves old sidecar data, `agent.ts` migrates the old
`<userData>/dsgn` dir, and the agent sidecar write-deny covers the legacy dir names
(`.dsgn/` and `.praxis/`). Don't "fix" those dsgn strings — preserve intentional
legacy migration and cleanup strings in setup, git, sidecar migration and agent
persistence — and keep `docs/PROGRESS.md` history as written (do not rewrite
historical entries).

Trezi rename compatibility and rollback: `docs/rename/MIGRATION.md`. Keep stable
OS/MCP identities and legacy aliases until a separately verified migration exists.
