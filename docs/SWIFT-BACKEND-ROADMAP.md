# Swift backend implementation roadmap

LKM-88, 2026-09-28. This expands the eight phases of the
[canonical plan](SWIFT-BACKEND-PLAN.md) into 15 implementation boundaries.
S01 is LKM-88; S02–S15 are stable local task IDs, not assertions about external
issue identifiers or assignments to people. The manager owns scheduling, commits,
verification and review. Future owners below name architectural responsibility.

Only S01 is implemented in this change. Contract fixtures do not install an XPC
service, supervise processes, persist an operation ledger or transfer any domain
writer. All current launch, storage and UI behavior remains authoritative.

| Task | Canonical phase | Scope and future owner | Required exit evidence |
| --- | --- | --- | --- |
| S01 | 1 | Contracts and executable correctness fixtures (LKM-88); shared Swift/TypeScript protocol | Golden parity, malformed/version/limit/scope/revision rejection, request versus operation identity, complete census mapping. Manager review pending. |
| S02 | 2 | Separate Swift service, XPC and supervision; Swift supervisor owns legacy Bun and helper lifetimes | Peer validation, launch negotiation, invalidation/reconnect, bounded shutdown, exclusive profile lock and launch-time owner selection. No domain takeover by transport alone. |
| S03 | 3 | Durable intent/checkpoint/snapshot substrate and preferences; Swift persistence service | Persist intent before effects, recover after each injected crash phase, deduplicate across restart, preserve v1 preferences/unknown keys/null and unsaved drafts; drain-and-restart restoration. |
| S04 | 3 | Basic projects/workspaces; Swift workspace coordinator | Stable root/checkout identity, restore/open/close/reorder/suspend parity, revisioned snapshots and preservation of newer workspace state on rollback. AppKit retains picking and presentation. |
| S05 | 3 | Memory, annotations and attachments; Swift state services | Manual save beats stale evaluation, annotation publishing split, scratch/blob bounds, original data retained on corruption/failure and restart. Repository lane gates project sidecar changes. |
| S06 | 4 | Managed servers/dependencies/static serving; Swift process supervisor | Selected runtime preserved; process groups, descendants, watchers and logs stop on shutdown; readiness/port/restart failures and rollback tested without orphan adoption. |
| S07 | 5 | Git/worktrees/isolation policy and recovery; per-repository Swift coordinator | Explicit mutation intent, common-directory FIFO lease, private index, recovery refs and interrupted landing; preserve user index/worktrees and never blind-reset newer changes. |
| S08 | 5 | Source transactions, file tree, media reads, drafts and Undo; Swift source service | Expected hashes, root/symlink checks, multi-file interrupted commit recovery, grouped Undo, blob scopes and newer external edits preserved; Repository remains serialization authority. |
| S09 | 5 | Parser/source-edit helper extraction; read-only JS parsers under Swift source authority | Hash-bound patches/diagnostics, React/Svelte/HTML parity, unavailable/schema/ambiguous cases, cancelled/stale proposals; helpers cannot commit source. |
| S10 | 6 | Provider adapters, authentication, catalogs and tools; Swift provider service plus supervised SDK/math helpers | Capability negotiation, secret/reference boundary, image semantics, helper privileges and deterministic failure/cancel fixtures. Paid/live provider checks require separate authorization. |
| S11 | 6 | Chat/turn/spawn orchestration and transcript state; Swift conversation coordinator | Queues, approvals, terminal deduplication, model handoff, cancellation, checkpointed transcripts and reconnect without draft loss; repository effects delegated to S07. |
| S12 | 7 | Editing/controls/content/composition/preview controllers; Swift coordinators, AppKit and isolated DOM JS | Originating chat/turn/document/revision checks, pending activation, saved-source Undo through S08, preserved drafts and DOM allowlist; test hooks never become helper capabilities. |
| S13 | 7 | Publishing/remote actions/setup/diagnostics/support and shared sheet routing; Swift application services | Explicit side-effect intent, durable local/remote receipts, uncertain-result reconciliation, redacted logs and failure-preserving autosave; commits delegated to Repository/Source. |
| S14 | 7 | Simulator and platform process integration; Swift simulator coordinator | Supervised xcrun/bridge lifecycle, failed preflight/build/boot/install and teardown recovery; platform/device verification recorded separately. |
| S15 | 8 | Installation updates, launcher/distribution and legacy retirement; Swift lifecycle service | Reconcile every census row, no remaining Bun domain writers, retained narrow JS helpers, supported-macOS/package checks and restoration from current data without old-backup overwrite. |

Each task depends on the foundation in preceding canonical phases. The numeric
order is the default schedule, not permission for temporary dual ownership.
S05 annotation sidecars must remain legacy-owned until S07's repository lane is
available; S04 scaffolding and other source-changing paths likewise defer their
writer transfer until S07/S08. Record those blocked sub-boundaries explicitly,
then complete them before S15. A row's task is accountable for integrating it;
shared mutation mechanisms remain owned by S07/S08. Splitting a file does not
split the authoritative writer. Source parsing and provider math may remain JS.

## Exhaustive census mapping

Every data row now has explicit `Migration task` and `Future owner` columns:

- [Modules](SWIFT-BACKEND-MODULES.md): 146 production module rows.
- [Routes](SWIFT-BACKEND-ROUTES.md): 133 registration rows, including the dynamic
  preview reply factory. Repeated names are separate registration sites.
- [Events](SWIFT-BACKEND-EVENTS.md): 240 dispatch/emission/subscription rows,
  including duplicate producers, UI commands, test hooks and dynamic envelopes.

The inventory source locations are the preserved LKM-84 snapshot; mapping does
not claim those historical line numbers remain current. A generic event bus row
maps to the boundary/controller that must dispatch it; concrete domain rows name
the eventual effect owner. AppKit remains the UI broker and never gains workflow
or persistence authority from receiving snapshots. Inspection/Perform/capture
rows remain test or UI broker capabilities, never provider/parser capabilities.

Mixed routes follow their actual effect: `styles:apply` and `layers:move` go to
source editing; DOM style/layer reads, previews and replies stay in S12. Picking,
source popouts and native edit commands retain their AppKit broker. Annotation
publication belongs to S13, with S07 authorizing repository effects; S05 owns only
annotation storage. Provider session tools not registered as RPCs are covered by
S10's tool modules, with chat, memory, source, controls, composition and preview
operations dispatched to their explicit domain owners. Media scheme registration
belongs to S08. Project build plugins and preview instrumentation remain JS.

## Canonical architecture and rollback boundary

The accepted boundary is a **separate Swift service over versioned XPC**, with
Swift supervising legacy Bun and helpers. Private helper pipes may carry bounded
DTO bytes, but cannot replace the application/service XPC boundary. Durable
intent and recovery checkpoints are prerequisites for the first transferred
writer. Host-local actors, a Bun-owned future launcher and an in-memory-only
ledger were audit staging alternatives and are not accepted migration steps.

S01 has no production owner switch because it transfers no writer. Reverting
these inert contract files requires no data restoration. S02 must add launch-time
owner selection before S03 opens any writable domain. Every transfer must first
name its exact files, journals, receipts, drafts and worktrees; test stopping new
mutations, draining or recording uncertain operations, closing the current owner
and restoring the legacy owner under the same exclusive profile lock. Retain
current stores and journals. Legacy restore must read/reconcile the newest state,
including work completed after any backup, or refuse safely with recovery status.
Never replace current state with an old backup, discard drafts/receipts/worktrees,
hot-switch a writer, or fall back to Bun writes after a timeout. Domain-specific
restoration tests are prerequisites for takeover, not claims established by S01.
