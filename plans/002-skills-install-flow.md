# Plan 002 — Offer-to-install curated skill packs

## Goal
Instead of pre-bundling adapted external skills into Praxis, let the agent **offer to install
curated skill packs** (e.g. Emil Kowalski's design-engineering skills, Anthropic's frontend-design)
into either the **project** the user is editing (`<repo>/.claude/skills/`) or their **user scope**
(`~/.claude/skills/`). Skills installed there are auto-discovered by the Agent SDK because Praxis
already launches with `settingSources: ['user','project','local']`. This keeps skill authorship,
updates, and opt-in with the user — Praxis just curates + installs.

**Dividing line (already decided):** Praxis *bundles* skills that teach its own tools
(spring-animations, accessible-colors, …). Praxis *offers to install* external *taste* skills.

## Context you need (zero prior context assumed)
Praxis is an Electron AI design tool; a Claude agent edits the user's repo behind an in-process
MCP server (`praxis`). Study the tool-wiring pattern in `src/main/backends/claude.ts` (the
`previewServer` `tools: [...]` array, `PRAXIS_TOOL_NAMES`, `defineControlsShape`). Note two
existing precedents that matter here:
- **`define_controls`** is a tool with SIDE EFFECTS that persists via main and uses
  `ctx.liveRoot` (NOT the per-chat worktree `root`) — copy that liveRoot handling.
- All the calculator tools are auto-allowed (in `PRAXIS_TOOL_NAMES`) because they're pure.
  **`install_skills` is NOT pure — it writes files + hits the network, so it MUST go through the
  normal permission flow (do NOT add it to the auto-allow set).**

## Branch
```
git fetch origin && git checkout -b feat/skills-install origin/candidate
```

## Verified facts about the `skills` CLI (from vercel-labs/skills v1.5.20)
- CLI = npm package **`skills`**; command `npx skills add <owner/repo>`.
- Default scope = project → `./.claude/skills/`; `-g/--global` = user → `~/.claude/skills/`.
- Non-interactive flags: `-y` (skip prompts), `-a claude-code` (pin agent, no detection),
  `--skill <name...>` (specific skills) or `--all` (every skill in the repo).
- **Default installs a SYMLINK** (`.claude/skills/<name>` → `.agents/skills/<name>`). Use
  **`--copy`** to write real, portable, commit-able files. Praxis MUST use `--copy`.
- Re-running `add` overwrites (clean+recopy); network required for remote repos.
- Robust fallback (no CLI): skills are pure filesystem — cloning/copying a `SKILL.md` folder into
  `.claude/skills/<name>/` works identically. Keep this in mind if `npx` is unavailable.
- SDK discovery: `~/.claude/skills/` (user) + `.claude/skills/` (project, walking up to repo root)
  are auto-read; the SDK also needs the **`Skill`** tool enabled to *invoke* them (see step 5).

## SECURITY (non-negotiable)
Installing a skill fetches a repo whose `SKILL.md` becomes instructions the agent will later
follow — a prompt-injection / RCE-adjacent surface. **`install_skills` must only accept repos
from the curated allowlist** in `skill-packs.ts`. Never let the model pass an arbitrary repo
string through to `npx skills add`. Validate `pack` against the catalog; reject anything else.

## Files to create

### 1. `src/main/skill-packs.ts` (pure data + helpers)
```ts
export interface SkillPack {
  id: string                 // stable slug, e.g. 'emil-design-eng'
  repo: string               // owner/repo for `npx skills add`
  title: string
  description: string        // one line shown to the user
  url: string                // homepage for credit
  skills?: string[]          // specific skills to install; omit = all in repo
  recommendedScope: 'project' | 'user'
}
export const SKILL_PACKS: SkillPack[]      // 3–5 curated entries (below)
export function findPack(id: string): SkillPack | undefined
/** Pure: build the argv for `npx skills add`. Testable without spawning. */
export function buildInstallArgs(pack: SkillPack, scope: 'project' | 'user'): string[]
```
`buildInstallArgs` must produce, e.g.:
`['skills','add', pack.repo, '-a','claude-code','-y','--copy', ...(scope==='user'?['-g']:[]),
  ...(pack.skills?.length ? pack.skills.flatMap(s => ['--skill', s]) : ['--all'])]`
Seed catalog (verify each repo slug via `npx skills add <repo> --list` before finalizing; if a
slug can't be verified, keep the entry but mark it `unverified` in a comment):
- `emilkowalski/skills` — "Design-engineering & animation craft (Emil Kowalski)".
- Anthropic frontend-design — confirm the exact skills.sh slug (likely `anthropics/skills`,
  skill `frontend-design`); if unverifiable, leave a TODO rather than guessing.
- (optional) `jakubkrehel/oklch-skill`, `meodai/skill.color-expert` — color systems.

### 2. `src/main/skills-install.ts` (the side-effecting runner)
```ts
export interface InstallInput { packId: string; scope: 'project' | 'user'; liveRoot: string }
export interface InstallResult {
  ok: boolean
  packId: string
  scope: 'project' | 'user'
  targetDir: string          // where skills landed
  installed: string[]        // skill folder names found afterward (best-effort)
  message: string
  stderr?: string
}
export async function installSkillPack(input: InstallInput): Promise<InstallResult>
```
Implementation: resolve the pack via `findPack` (throw/return error if not in catalog); spawn
`npx <buildInstallArgs(...)>` with `cwd = liveRoot` for project scope (home is implied for `-g`).
Use `node:child_process` `spawn` (NOT shell string interpolation — pass argv array). Capture
stdout/stderr, timeout ~120s. After success, read the target dir
(`project → join(liveRoot,'.claude/skills')`, `user → join(os.homedir(),'.claude/skills')`) to
list installed skill folders. Return a structured result; never throw to the caller for a normal
install failure — return `{ ok:false, ... }`.

### 3. `test/skills-install.mjs` (bun unit test — pure parts only)
Import from `../src/main/skill-packs.ts`. Assert:
- Every `SKILL_PACKS` entry has non-empty id/repo/title/description/url and a valid
  `recommendedScope`; ids are unique.
- `findPack(id)` returns the entry; `findPack('nope')` is undefined.
- `buildInstallArgs`: contains `add`, the pack repo, `-a`,`claude-code`,`-y`,`--copy`; includes
  `-g` iff scope==='user'; uses `--all` when `skills` omitted and `--skill X` pairs when present.
- **Security:** simulate the tool's validation — a repo string not in the catalog must be
  rejected by `findPack` (assert undefined), proving arbitrary repos can't reach the installer.
(Do NOT run `npx skills add` in the unit test — no network in the unit tier. The actual spawn is
covered manually / by a follow-up electron or live test; note that in the test header.)
Print `SKILLS-INSTALL OK — …`.

## Files to edit

### 4. `src/main/backends/claude.ts`
Add TWO tools to the `previewServer` `tools: [...]` array:
- **`list_recommended_skills`** — pure, returns the `SKILL_PACKS` catalog as readable text
  (id, title, description, url, recommendedScope). **Add its name to `PRAXIS_TOOL_NAMES`** (auto-allow).
- **`install_skills`** — input zod shape: `packId` (string), `scope` (enum ['project','user'],
  default the pack's `recommendedScope`). Handler: validate `packId` against the catalog (reject
  otherwise with an isError result); call `installSkillPack({ packId, scope, liveRoot: ctx?.liveRoot ?? root })`;
  return the `InstallResult.message` plus a **restart note**: newly installed skills are discovered
  when the agent session (re)starts a turn, so tell the user they take effect on the next
  message/session. **Do NOT add `install_skills` to `PRAXIS_TOOL_NAMES`** — it must surface a
  permission card (it writes to disk + network). Verify in a manual run that it prompts.
Update the two stale inline comments enumerating the praxis tool set to include the new tools.

### 5. Enable the `Skill` tool (verify first, then fix if needed)
Installed skills are only *usable* if the SDK's `Skill` tool is permitted. Check the `query({...})`
options in `claude.ts`: `allowedTools` currently lists only `PRAXIS_TOOL_NAMES`. Confirm whether
bundled plugin skills (praxis-preview) currently invoke without a prompt. If the `Skill` tool
prompts or is blocked, add `'Skill'` to `allowedTools`. Document what you found in the commit
message. (If `allowDangerouslySkipPermissions` already makes it work, leave allowedTools alone but
note it.)

### 6. `src/main/rules.ts` + `test/rules.mjs`
Add a short `previewTools` block: when a design task would benefit from established craft skills
the agent doesn't have, it may call `list_recommended_skills` and **offer** to `install_skills`
(never install silently; the user chooses project vs user scope). Bump `PRAXIS_RULES_VERSION` by
1 and update `test/rules.mjs` (new version assertion + `assert(/install_skills/.test(withTools))`).
**If plan 001 already bumped the version, use the next integer and keep both assertions.**

### 7. `test/run.mjs` + `package.json`
Add `'skills-install'` to the `UNIT` array; add `"test:skills-install": "bun test/skills-install.mjs"`.

### 8. `CLAUDE.md`
Architecture map: add `skill-packs.ts` (curated catalog) and `skills-install.ts` (npx skills
runner) with a one-line note that they power `list_recommended_skills` / `install_skills`.

## Verify
```
bun test/skills-install.mjs        # pure catalog + arg-builder + allowlist tests
bun test/rules.mjs
bun run typecheck:node
bunx biome check --write src/main/skill-packs.ts src/main/skills-install.ts test/skills-install.mjs
node test/run.mjs unit
bun run build
```
Manual smoke (do once, report result): from a throwaway project dir, run the exact argv
`buildInstallArgs` produces for `emilkowalski/skills` (project scope) and confirm real files land
in `./.claude/skills/…` (because of `--copy`), then confirm a fresh Praxis agent session
discovers them. If `npx`/network is unavailable in the run environment, document that the pure
tests pass and the spawn path is untested.

## Commit
Small focused commit, Co-Authored-By trailer. Don't push unless asked.

## Explicitly OUT of scope (follow-ons, note them in the commit body)
- A renderer UI panel / catalog browser (this plan is the agent-tool capability only).
- Mid-session hot-reload of newly installed skills (they apply next session/turn — just surface that).
- Arbitrary/user-supplied repos (allowlist only, by design — see SECURITY).
```
