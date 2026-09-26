# Worktrees and concurrent chats

Praxis gives every interactive chat on a Git repository root its own linked worktree.
Models edit there; the preview and the user's editor remain on the live checkout. The
isolation boundary is the worktree, while convergence is owned by one repository-scoped
landing queue.

Copy-on-write creation measurements and integration tradeoffs are recorded in
[COW-INVESTIGATION.md](COW-INVESTIGATION.md). The experiment leaves this lifecycle
unchanged; CoW file duplication alone does not provide landing or recovery.

All chats are peers in the rail and in the isolation model: each crosses the same
landing queue. Chat identity and worktree identity are independent; closing a
conversation does not justify retaining a stale branch.

## State model

```text
idle (detached worktree, no chat branch)
  → turn starts: attach praxis/chat-<id>
  → model edits privately
  → repository landing queue
      → success: validate, write + commit live, detach, delete chat branch
      → failure/interruption: commit partial work only on chat branch, park
      → text drift: three-way merge privately; land clean edits automatically
      → text overlap: one automatic AI reconciliation, then land or park
      → other conflicts: keep cumulative work on chat branch, park

parked
  → Resolve (UI or agent tool): rebase both sides into the worktree; AI resolves markers
  → Discard: reset worktree, detach, delete chat branch
  → successful resolution: land once, detach, delete chat branch
```

The branch is a recovery reference, not the session's permanent identity. It exists
only while a turn can lose work or while a conflict awaits a decision. An idle chat
retains its worktree/session cwd but no branch, preventing stale `praxis/chat-*` refs
from growing with every chat.

## Invariants

- One live checkout has one writer. Every snapshot, landing, apply, resolve, discard,
  and teardown crosses the repository queue.
- Only a successful provider terminal outcome may auto-land. Failed or interrupted
  work stays parked and recoverable.
- A provider's duplicate terminal events finalize a turn once. In particular, Codex's
  `error` followed by `done` is one failed turn.
- A batch is validated before live writes. Complete Git conflict-marker triplets never
  cross into the live checkout.
- Three-way resolution uses a temporary index seeded from the working tree. The user's
  real staged state is not a resolver input and is never mutated.
- `.env` and non-template `.env.*`, `node_modules`, `*.tsbuildinfo`, `.praxis/`, and
  legacy `.dsgn/` are excluded from snapshots, worktree commits, and live commits.
- Parked work keeps a durable branch. Successfully landed or discarded work does not.
- Comment-created and automatic visual-edit background agents are attributed to their
  exact parent chat in the rail, but still count against the repository-wide concurrency
  cap and land through the same repository writer. Closing a parent chat does not stop
  its agent, so an agent left without a live parent re-parents onto the project's first
  chat rather than disappearing from the rail with its cancel control. Automatic edit
  completion is recorded in the activity log, not the chat transcript. The legacy
  `text-edit` event origin now covers committed props, styles, custom controls,
  and layer moves as well as text. Failed/interrupted children keep partial work
  recoverable without auto-applying it.

## What “conflict” means in Praxis

A park does not necessarily mean Git found overlapping `<<<<<<<` markers. It means the
chat's result could not be proven safe to land as one batch. Typical causes are another
chat or the user changing the same file during the turn, deletion/binary changes that
need the explicit resolver, or a failed/interrupted provider turn with partial edits.

Successful interactive turns first try a three-way reconciliation for existing regular
text files. Non-overlapping edits land without another model turn or a warning card.
Overlapping edits start one reconciliation turn in the same chat/provider, including
background chats. Markers remain private; the live checkout changes only after the
normal marker check and landing validation pass. The prompt asks the model to preserve
both intents, verify the result, and leave genuinely incompatible choices unresolved.
The provider retains its configured permissions. The busy gate stays held through
landing, so queued messages cannot race reconciliation; Stop cancels the continuation.
A failed/stopped reconciliation or further drift falls back to the existing card with
no automatic retry loop. Failed original turns, binary files, additions, deletions,
and symlinks retain the explicit review path. Already-parked chats retain Resolve.

The conflict card must therefore reflect the harness's authoritative landing state—not
the model's opinion about whether its private worktree is clean. A clean worktree can
still be parked because publication to the live checkout failed.

Codex/gateway chats can query that same authority with the session-scoped
`workspace_state` MCP tool. When it reports `parked`, `prepare_conflict_resolution`
invokes the same queued resolver as the conflict card, leaving marker-bearing files in
the chat's current worktree for the model to reconcile. The tool is idempotent after
staging, refuses to reset a worktree already edited in the current turn, and exposes no
raw Git/reset/discard escape hatch.

## Recovery and limits

On restart, dirty or unmerged orphan worktrees are folded into recovery records; work
already present live is removed. Praxis also sweeps branch-only `praxis/chat-*`
leftovers whose checkout was removed by an older or interrupted teardown. Because a
landed turn is usually a different commit on the live branch, cleanup accepts either
commit ancestry or patch equivalence against live `HEAD`; it never deletes a checked-
out branch, a persisted park, or a tip carrying a unique patch. Other namespaces such
as `backup/*`, normal work branches, and comment-agent branches are outside this sweep.

The preview currently serves the live checkout, so mid-turn worktree edits are not
visible there until landing. Isolation currently applies only when the opened folder is
the Git repository root; non-Git folders and Git subdirectories use the live path and do
not receive this concurrency guarantee.

Implementation: `src/main/repo-write-queue.ts`, `src/main/chat-isolation.ts`,
`src/main/chat-worktrees.ts`, `src/main/worktrees.ts`, `src/main/live-commit.ts`.
Regression coverage: `test/chat-worktrees.mjs`, `test/live-commit.mjs`,
`test/chat-isolation.mjs`, `test/turn-terminal.mjs`.

## Publishing a shared work branch

Publish is a second repository-wide landing boundary after chat work reaches the live
checkout. The entire commit → reconcile → push → PR → merge → cleanup sequence holds a
per-repository publish lock. Before pushing an existing `praxis/*` branch, Praxis
fetches/prunes origin and records both tips below `refs/praxis/recovery/`.

The reconciliation is ancestry-driven: a remote ancestor needs only a normal push; a
local ancestor fast-forwards; true divergence gets an explicit merge commit. A push
rejected because the remote moved repeats fetch/reconciliation, with three total
attempts. Content conflicts remain in the live checkout with both recovery refs and
are surfaced as an exact file list. Publish never force-pushes, rebases, resets, or
chooses ours/theirs across the repository.

Implementation: `src/main/publish-reconcile.ts`, integrated by
`src/main/annotations.ts`. Regression coverage: `test/publish-reconcile.mjs`.

Model/provider changes keep the selected chat's worktree and require confirmation
when the chat contains messages. The replacement session receives a one-time
recorded conversation handoff on its next turn; sibling chats are untouched.

## Environment changes and preview startup

The native workspace controller refreshes a managed web preview after authoritative `isolation:merged`
or applied `spawn-finished` events containing manifests, lockfiles, or framework
config changes. A provider's earlier `done` and parked/failed outcomes do not
trigger this refresh. Background projects retain pending refreshes until activated.
An empty project can open its chat before it has a dev server or application files.

For dependency changes, the preview runner installs in the live checkout through
its repository write queue before starting the server. Git does not transfer a
worktree-local `node_modules` directory. Auto-detected commands/frameworks are
resolved again; explicit custom launch commands retain their override. Preview
startup failures leave chat available for repair and expose a retry command.
This refresh covers landed Git-root work; external file edits and non-isolated
turns still depend on the framework's own reload behavior or a manual restart.

## Setup helpers and Next.js validation

Git snapshots continue to exclude `.praxis/`. Before creating an agent session and
before every clean chat turn, Praxis copies only the setup helper allowlist into
the private checkout, verifies the copies, and records paths/SHA-256 hashes in
`.praxis/setup-helpers.json`. This also handles setup started after a chat's
worktree already exists. Annotations and other sidecar data are not shared.

Next projects provision dependencies inside the worktree using its package manager,
manifests, and lockfile. They do not receive the shared `node_modules` symlink;
existing symlinks are removed before installation. A manifest/lockfile fingerprint
avoids redundant installs and refreshes changed dependency sets. Ordinary projects
retain the existing runtime symlink policy. No adapter widens Turbopack's root.

`workspace_state` exposes the live checkout/revision/dirty state, worktree base,
preview URL, and latest stamp observation. `servedRevision: null` and
`revisionVerified: false` deliberately distinguish those observations from proof
that a particular commit finished compiling. Exact compiler revision attribution
remains a separate requirement.

## Pulling remote updates and switching branches

The branch menu's **Git updates…** panel fetches configured remotes, pulls a
selected remote-tracking branch into the current branch, or opens a remote branch
locally. Pull explicitly uses a merge, preserving local commits; it does not
rebase, force-reset, push, or silently stash. A conflicting merge is aborted back
to the clean starting tree. New local branches track the selected remote branch;
existing local branches are switched to without resetting or repointing them.
Pull afterward to update an existing local branch.

These operations run through the repository write queue and reject active project
agents, uncommitted project files, in-progress Git operations, and stale current-
branch selections. Untracked runtime sidecars do not block updates; Git retains
its own protection against overwriting untracked incoming paths. Fetch is safe
while agents work and does not alter the checkout. Remote references are refreshed
and validated before mutations. Browser mode enforces the same opened-root scope.

Successful pull/checkout results update branch metadata and request a preview
restart, installing dependencies when manifests/lockfiles changed. The next chat
turn uses the existing live-to-worktree synchronization to pick up the new tree.

Ordinary local-branch switches also restart the managed preview, re-detect the
framework, and install dependencies when branch-tip manifests or lockfiles differ.
Attached external servers get a page reload and a manual-restart message.

## Composer message queue

Enter or Queue message during a running turn captures the text, attachments, and
selected objects for that chat. Each chat drains in FIFO order, including while
another chat is active. Sends carry an explicit session key; attachment saving
and the previous turn's landing cannot redirect them to a newly active project.
The next send waits for the existing landing chain. A conflict pauses dispatch;
Stop and agent errors pause remaining messages until Resume queue. Pending items
can be removed. Queues are in memory, cleared on chat close or app reload.

Provider completion keeps the chat busy until landing finishes. Automatic
reconciliation shows a short progress status instead of the conflict card.

Clean merges add no chat notice. Their Revert action attaches to the completed
assistant response, even if a queued response has already started. Conflicts and
failures still surface normally.

Content-editor recipes are registered from the chat worktree against its JSON,
persisted by main to the live sidecar, and become editable after content lands.
A missing live JSON file returns an unavailable read, with bounded editor retries
and another read on landing events; existing drafts remain untouched. A parked
or abandoned binding offers explicit reload/removal instead of endless IPC errors.
Content Save is serialized with repository writes and checks its loaded revision
before applying through edit history. See [CONTENT_CONTROLS.md](CONTENT_CONTROLS.md).

## Chat-island source edits

Chat islands validate literal bindings against the creating agent's source tree,
but persist their spec/turn association in the native profile. They wait for a
successful terminal/landing event before enabling live edits; failed or parked
turns leave them unavailable. Closing or stopping the chat cancels composition.

A committed control gesture checks the loaded file revision inside the repository
write queue and writes its entire single-file batch as one undo group. Stale source
or a changed/closed island rejects the write. Controls never follow current DOM
selection. The next chat turn picks up committed live values through normal
worktree synchronization and a compact provider-only context summary. Full runtime
scrubbing and multi-file island transactions are not supported by the first slice.

## Comment completion feedback

Native comment cards display the latest provider tool status. Their final messages
distinguish applied, no-change, cancelled, failed and review outcomes; applied
comments expose their grouped Undo action. Finalizer errors retire the running card
and retain the recovery checkout. Late start responses cannot revive completed
cards. The repository busy slot stays occupied through landing and cleanup, and
comment snapshots and finalization use the shared repository writer.

## Managed preview shutdown

Preview processes belong to the app, independently of chat worktrees. Terminal
interrupts and app quit await termination of each owned process group, escalating
to SIGKILL after one second. Shell exit does not release ownership while descendants
survive. Shutdown does not land or discard worktree edits or target unrelated servers.
