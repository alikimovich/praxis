# Swift repository coordinator: Git, worktrees and recovery (S07)

LKM-95, roadmap row S07 ("Git/worktrees/isolation policy and recovery; per-repository
Swift coordinator") of the [canonical plan](SWIFT-BACKEND-PLAN.md) and
[roadmap](SWIFT-BACKEND-ROADMAP.md). It follows [runtime](SWIFT-BACKEND-RUNTIME.md).
Under the default launch (`TREZI_BACKEND_OWNER=swift`), the Swift service performs
every Git effect Trezi makes in a user's repository and is the serialization
authority for everything else that writes there. Bun keeps the decisions that belong
to later slices: chat state, park records, Undo history, setup helpers.

- `src/service/RepositoryOwner.swift`: requests, the method table with required
  intents, lanes and leases, journal bracketing, drain.
- `src/service/RepositoryEffects.swift`: worktree lifecycle, turn commits and
  landings (twins of `worktrees.ts`/`chat-worktrees.ts`).
- `src/service/RepositoryLanding.swift`: explicit apply, reconciliation staging,
  discard, live commits, branch switching, orphan and branch recovery (twins of
  `applyToWorkingTree`, `stageResolve`, `commitLiveTurn`, `git.ts`, `pruneOrphans`).
- `src/service/RepositoryJournal.swift`: the operation journal, recovery refs and
  the per-common-directory lanes.
- `src/service/RepositoryGit.swift`: the git runner, private-index snapshots and path
  rules.
- `src/native/repository-service.ts`: Bun's client. `src/main/repository-owner.ts` is
  the seam: the mutating functions in `worktrees.ts`, `chat-worktrees.ts`,
  `live-commit.ts`, `git.ts` and `repo-write-queue.ts` dispatch to it when it is
  installed and are the rollback owner when it is not.

## The domain, exactly

| Item | Owner (swift launch) | Owner (legacy launch) |
| --- | --- | --- |
| Serialization of repository writes (`enqueueRepoWrite`) | Swift lane per common directory, leases held by Bun | Bun promise queue per project key |
| Chat/spawn worktrees: create, sync, attach/retire branch, commit, remove | Swift | Bun |
| Landing a turn on the live checkout (`completeTurn`, `autoApply`) | Swift (edits returned for Undo) | Bun |
| Explicit apply of a parked chat or spawn branch; reconciliation staging; discard | Swift | Bun |
| One commit per turn on the live checkout (`commitLiveTurn`) | Swift | Bun |
| Branch ensure/switch/checkout on the live checkout | Swift | Bun |
| Startup recovery: orphan checkouts, integrated chat branches | Swift | Bun |
| Operation journal `<profile>/service/repository/journal.json` | Swift | untouched |
| Recovery refs `refs/trezi/recovery/*` in each repository | Swift | untouched |
| Chat isolation state (parked, turn numbers), park records in the session store | Bun (S11) | Bun |
| Undo history for landed edits (`recordEdit`) | Swift source service (S08, LKM-96) | Bun |
| Setup helpers into worktrees, Next dependency provisioning | Bun JS helpers inside the lease | Bun |
| Git reads (branch lists, status, patches, marker scans, publish scope) | Bun (reads only) | Bun |
| Remote fetch/pull/checkout (`git-remote.ts`), publishing, annotation sidecar | Bun, inside the Swift lease | Bun |
| Prop, text, style, move, island, content and control source writes, file-tree operations | Swift source service in this lane (S08, LKM-96) | Bun |

The last row is deliberate. Those writers are other slices (S13 publishing and remote
actions, S05's annotation writer, S08 source transactions); they now take the Swift
lane, so they are ordered with every Git effect, but they still run their own
commands. Each is recorded in `docs/TASKS.md`.

## Rules

- **Lanes.** The lane key is the resolved `git rev-parse --git-common-dir`, so the
  live checkout and every linked worktree share one FIFO; a folder outside Git is
  keyed by its resolved path. Frames enter lanes in pipe order. Unrelated
  repositories run concurrently. Before, branch switches, orphan recovery, branch
  pruning and spawn-branch apply ran outside the queue, and the queue was keyed by
  project path, so a worktree and its live checkout did not serialize.
- **Leases.** `acquire {root}` answers when the lane is granted; `release {lease}`
  frees it after every operation already queued inside it. Bun tracks held leases per
  async call chain (`AsyncLocalStorage`): effects inside a lease run in it, and a
  nested acquire on the same lane is re-entrant instead of a deadlock. An acquire
  never times out (a late grant would hold the lane forever); a stopping service
  releases every lease.
- **Explicit intent.** Landing (`completeTurn` `land`, `autoApply`, `applyParked`,
  `applyBranch`), reconciliation (`stageResolve`), `discardParked`, `removeWorktree`
  (`landed`, `release`, `abandon`), `deleteBranch` (`discard`, `integrated`), orphan
  recovery and branch pruning each require their intent in the body, or are refused
  (`invalidRequest`) before anything runs.
- **Scope.** Every worktree operation checks that the path resolves under the profile
  and is a *linked* worktree of the request's repository. The user's main checkout, a
  worktree the user made elsewhere and an arbitrary folder are refused
  (`unauthorized`). Branch names must pass `check-ref-format`; deletions and
  `trezi/`-switches only touch work branches (`trezi/`, `praxis/`, `dsgn/`).
- **Private index.** Snapshots (a worktree's fork point, the live tree before a
  three-way apply, recovery snapshots) are built in a private index under
  `<profile>/service/repository/scratch`; the user's index is never read or written
  for them. Git runs with the repository-redirecting variables (`GIT_DIR`,
  `GIT_INDEX_FILE`, …) removed and `GIT_OPTIONAL_LOCKS=0`.
- **Recovery refs.** Before anything could make work unreachable, the owner names a
  ref in the journal, then points `refs/trezi/recovery/<UTC>-<kind>-<op>-<label>` at it:
  dirty or unlanded worktree state before a sync reset, removal or discard; the parked
  tip before reconciliation resets the worktree; a branch tip `checkout -B` or a
  deletion would orphan; the target commit before a landing writes files; the live
  pre-image before a three-way apply can write conflict markers; a detached orphan's
  recovery commit. Refs guarding an effect that completed with the work still
  reachable (a clean landing, a clean apply) are deleted; the rest are kept, and
  the owner never prunes them (refs are the only handle on moved-out work; list them
  with `git for-each-ref refs/trezi/recovery/` and delete them by hand once
  inspected). Each ref name carries a random suffix so refs of one kind and label
  within one operation never overwrite each other.
- **Landing.** Unchanged policy (write only where the live file equals the fork point
  or already the target; refuse the whole batch otherwise), with these changes: files
  are compared as bytes; a symlink or a path resolving outside the checkout is refused;
  missing parent directories are created; a failed write restores the files already
  written; a batch over 16 MiB parks instead of crossing the pipe.
- **Live commits.** The same pathspec commit (`add -- paths`, `commit --no-verify --
  paths`), so the user's staged work elsewhere stays staged. A foreign index lock or a
  concurrent Git process makes it fail with the files left landed and uncommitted, as
  before.
- **Branches.** `checkout` only accepts an existing local branch and runs
  `git checkout <branch> --`. Before, a name that was not a ref could be read by Git as
  a path and discard that file's changes.
- **Paths.** Git path output is read with `-z`, so non-ASCII names are exact rather
  than C-quoted.
- **Startup recovery.** A dirty orphan's work is made durable before its checkout is
  touched: recovery refs on its HEAD and on a private-index snapshot of the dirty
  state, then the recovery commit on its branch (folded into a parked chat's squash,
  with the branch put back as found if the commit fails). A checkout whose commit
  failed (signing that cannot run in the background service, a Git error) is moved
  aside, never force-removed; a ref that could not be made leaves the orphan exactly
  as found. The recovery commit leaves excluded paths out. An orphan of *another* repository is left for that repository's own
  lane (before, it was reclaimed from whichever project opened first). A folder that
  is no longer a worktree is moved aside to `.recovered-<name>-<time>` instead of
  deleted; Trezi's own `.`-prefixed scratch is removed.
- **Snapshots.** A clean checkout's fork point is now HEAD itself rather than a new
  commit with HEAD's tree (what the legacy comment already described).

## Journal and recovery

An entry `{operationID, kind, intent, lane, root, worktree?, branch?, refs, started}`
is written and synced before the first effect and removed when the operation settles.
A failure after a recovery ref was made moves the entry to `interrupted`. When a new
service opens the journal, every still-active entry was interrupted by a crash and
moves there too. Nothing is replayed, reset or deleted for it: the worktree, its
branch and the refs keep the work, and chat recovery's existing orphan handling
surfaces unlanded branches as recovery records. Bun lists interrupted operations in
the Activity log at launch. `status` (read) returns them; `acknowledge
{operationID, intent:"acknowledge"}` forgets one and keeps its refs. A damaged
journal is left exactly as found; mutations are then refused `recoveryRequired`
(leases still work, so Bun's own writes are not blocked).

## Protocol

Bun uses the private pipe with S01 frames, no revision and an empty scope:
`{"service":"repository","id":n,"request":{…,"service":"repository","method",…}}`.
Mutations take an optional `leases` array (the leases the calling chain holds).

| Method | Body | Result |
| --- | --- | --- |
| `acquire` / `release` | `{root, held?}` / `{lease}` | `{lease, reentrant}` / `{}` |
| `status` (read) / `acknowledge` | `{}` / `{operationID, intent}` | `{active, interrupted, journal?}` / `{}` |
| `createWorktree` | `{root, worktreesDir, id, branch, linkNodeModules}` | `Worktree` |
| `syncWorktree` / `attachBranch` / `retireBranch` | `{root, worktree}` | `{synced, baseSha}` / `{}` |
| `commitWorktree` | `{root, worktree, message}` | `{committed, files}` |
| `autoApply` | `{root, worktree, files, intent:"land"}` | `{applied, edits}` |
| `completeTurn` | `{root, worktree, message, intent:"land"\|"park"}` | `{outcome, files, edits, newBase?}` |
| `applyParked` / `applyBranch` | `{root, worktree\|branch, intent:"land"}` | `{ok, conflict, files?, newBase?, empty?, error?}` |
| `stageResolve` | `{root, worktree, intent:"reconcile"}` | `{conflicted, files, clean, baseSha}` |
| `discardParked` | `{root, worktree, intent:"discard"}` | `{}` |
| `removeWorktree` | `{root, worktree, keepBranch, intent}` | `{}` |
| `deleteBranch` | `{root, branch, intent}` | `{deleted}` |
| `pruneOrphans` | `{root, worktreesDir, skip, parked, intent:"recover"}` | `[{id, dirty, branch, repoRoot}]` |
| `pruneBranches` | `{root, protected, intent:"integrated"}` | `{deleted, preserved}` |
| `commitLive` | `{root, files, title, body?}` | `{committed, sha?, files}` |
| `checkout` / `switchBranch` | `{root, branch}` | `BranchResult` |

Unknown or missing fields, wrong types, oversized or relative paths, NUL and lone
surrogates are refused before anything is journaled.

## Rollback (tightened to this domain)

- **Launch-time switch only.** Quit Trezi, relaunch with `TREZI_BACKEND_OWNER=legacy`.
  The profile lock admits one owner; no Git effect is hot-switched.
- **Drain before switching.** At quit, after Bun has exited, the service refuses new
  requests, releases Bun's leases and lets running Git effects finish (bounded to
  5 s). One cut short stays in the journal and is reported at the next Swift launch.
- **What is preserved.** Worktrees, their branches (`trezi/chat-*`,
  `trezi/comment-*`) and `<profile>/trezi/worktrees` are ordinary Git state in the
  same places and names, so the legacy owner continues on worktrees the Swift owner
  made (tested). The journal and every recovery ref stay; the legacy owner never
  reads or writes them. Park records, Undo history and drafts are Bun's in both
  launches. No backup is restored and nothing newer is overwritten.
- **Returning to Swift.** The journal opens as it was left; refs are unchanged.
- **Reverting the code.** A pre-LKM-95 build ignores `service/repository/` and
  `refs/trezi/recovery/*` (they can be listed with
  `git for-each-ref refs/trezi/recovery/` and deleted by hand once inspected).

## Verification

`test/repository-owner.mjs` (unit tier) compiles the real owner into a fixture
(`test/fixtures/repository-owner/main.swift`, `REPOSITORY_FAULT=<point>` SIGKILLs
inside an effect) and drives it through Bun's client and the unchanged TS entry points:
- **Parity.** The legacy suites `chat-worktrees`, `worktrees`, `live-commit`, `git`,
  `chat-recovery`, `auto-reconciliation` and `setup-next` run unchanged with the Swift
  owner preloaded (`test/helpers/repository-owner-preload.mjs`) and must send it frames.
  `chat-islands` is left out: it assumes a lease is granted within one timer tick.
- **Lanes.** A worktree root waits for its live checkout's lease; an effect outside a
  lease waits; another repository runs concurrently; nested leases and effects inside
  a lease do not deadlock; two chats landing at once both land and commit.
- **External changes.** A foreign `index.lock` refuses the live commit with the files
  kept, then it commits; an external commit between turns is synced and built on; the
  user's staged file stays staged throughout.
- **Intent and scope.** Missing or wrong intents, unknown fields, a revision, a scope,
  a non-work branch, the main checkout, a user worktree outside the profile and a
  path-like checkout name are refused with nothing changed. Discard and dirty removal
  keep their content at recovery refs.
- **Crash.** SIGKILL after the first file of a landing, after reconciliation's reset,
  and after a removal preserved dirty work: the next process reports each as
  interrupted, its refs hold the target/parked/dirty content, nothing is reset, and
  `acknowledge` needs its intent and keeps the ref.
- **Orphans.** Two dirty orphans (one parked) with a recovery commit that cannot be
  made (signing required, failing program): both checkouts stay on disk, the parked
  branch tip is unchanged, each has its own `orphan-head`/`orphan-dirty` ref; with
  signing working the work is committed on its branch and the checkout removed.
- **Rollback and drain.** The legacy owner lands a turn on a Swift-made worktree with
  journal bytes and refs unchanged; a damaged journal is refused untouched while
  leases work; close refuses a request queued behind a lease and later requests.

`test/service-process.mjs` builds the real service with the owner.
