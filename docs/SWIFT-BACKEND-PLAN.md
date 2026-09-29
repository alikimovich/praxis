# Swift Backend Migration Plan

Goal: replace the Bun-hosted application backend with a Swift-owned service
architecture. Swift owns workspace/chat coordination, persistence, provider
lifecycle, Git/worktrees, source transactions, managed servers, and recovery.
JavaScript remains narrowly scoped to provider SDK adapters and web-language
parsing helpers.

## Status

Initiated 2026-09-27. This is the canonical plan document; update it as
phases complete.

**Current (2026-09-29, LKM-93):** S05 (roadmap row) moves project memory into the
Swift service as the only writer of the unchanged `project-memories/<id>.json`
files, through the ledger (one domain per project). A manual editor `save` always
wins; a generated `propose` commits only on the revision it was evaluated against,
so a stale evaluation can never overwrite it. Evaluation stays a Bun helper with no
write authority. Damaged files are refused untouched instead of read as empty, and
injection uses the owner's digest. Annotation storage is split from publication and
hardened (damaged files kept, per-project serialization, stale responses dropped),
but its writer stays in Bun: the sidecar is inside the user's repository and waits
for S07's repository lane, as this roadmap requires. `TREZI_BACKEND_OWNER=legacy`
keeps the Bun memory writer as the rollback owner. See [memory](SWIFT-BACKEND-MEMORY.md).
Implemented for review on the LKM-92 candidate; manager verification and acceptance
are pending.

**Earlier (2026-09-29, LKM-92):** S04 (roadmap row) moves workspace identity,
membership, order, the selected project and recents into the Swift service as
the only writer of the unchanged `workspace.json`, through the ledger. Keys stay
as they were; an aliased root (symlink, trailing slash) resolves to the existing
project. Mappings are persisted before any dependent session/server command. Session,
server and Git fields stay legacy-owned and reach the file only through a typed
`update` adapter; display state and drafts are never stored. `TREZI_BACKEND_OWNER=legacy`
keeps a byte-identical Bun writer as the rollback owner. See
[workspace](SWIFT-BACKEND-WORKSPACE.md). Implemented for review on the accepted
LKM-91 base; manager verification and acceptance are pending.

**Earlier (2026-09-28, LKM-91):** the preferences writer moves to the Swift
service, through the ledger, behind the adoption gate: v1 `preferences.json` is
kept byte-compatible, Bun's callers send awaited batches over the supervised pipe
and read acknowledged snapshots, and `TREZI_BACKEND_OWNER=legacy` keeps Bun's
writer as the rollback owner. See [preferences](SWIFT-BACKEND-PREFERENCES.md).
Implemented for review; manager verification and acceptance are pending. Every
other domain writer is still Bun.

**Earlier (2026-09-28, LKM-90):** S02 (LKM-89) is merged into this step's base
(5b18354). S03's durable operation ledger — persistent intent, request digests
and receipts, commit checkpoints, per-domain revisions, persisted event cursors
and recovery queries — is implemented for review in the Swift service; see the
[ledger](SWIFT-BACKEND-LEDGER.md) for storage layout, compatibility, rollback and
the preferences adoption gate. No domain writer has moved.

**Earlier (2026-09-28):** S01 (LKM-88) is accepted and merged into the candidate
as 51fb928. S02 (LKM-89) — the separate Swift XPC service, legacy Bun
supervision, Swift-owned profile exclusion and launch-time owner selection — is
implemented for review; see [service and rollback](SWIFT-BACKEND-SERVICE.md).
Manager verification (unsandboxed XPC fixture and native tier) and independent
review are pending for S02. No domain writer has moved; S03 is next. The dated
entries below are history: their "pending" notes refer to S01 before acceptance.

2026-09-28, LKM-88 (step S01): shared contract/fixture implementation and exhaustive
census ownership mapping are implemented for review. The 92-case cross-language
fixture suite, TypeScript/native typechecks and docs-link check pass. Manager
verification, independent review and acceptance remain required. No domain writer has moved. The separate
Swift service/XPC, Swift supervision and durable intent prerequisites remain
mandatory. See the [15-step roadmap](SWIFT-BACKEND-ROADMAP.md) for task boundaries,
future owners and rollback gates, and the [executable wire contract](SWIFT-BACKEND-WIRE.md)
for the implemented subset. Audit host-local/pipe-first/in-memory staging
is superseded for implementation and does not relax this plan.

2026-09-28 verification repair: the fixture now stops its esbuild service after
bundling. The focused unit runner passes all 92 cases and process-group cleanup;
manager's full verification and review remain pending. No ownership boundary changed.

2026-09-28 manager follow-up: all 108 unit checks and typechecks passed; desktop
verification stopped at Shadow Light foreground capture. Its fixture now awaits
bounded main-window readiness before capture, with a passing non-GUI regression.
Manager must rerun desktop verification and inspect the captures; migration
acceptance and all writer transfers remain pending.

2026-09-28 escalation: the latest manager run passes 109 unit checks but loses
foreground during asynchronous capture, after readiness succeeds. The smoke
helper now retries only explicit foreground rejections with fresh activation and
pixels, bounded to three attempts. Non-GUI race regressions pass; unchanged Swift
guards and PNG/OCR checks still require manager desktop verification. S01 remains
for review, with no writer transfer or migration acceptance.

2026-09-28 tracking repair: candidate and S01 task sections are preserved in a
conflict-free three-way TASKS resolution. Implementation is unchanged; manager
desktop verification, independent review and tested candidate integration remain
pending. No candidate merge commit is claimed by this worker.

2026-09-28 independent-review repair: manager reports 109 unit checks and native
integration passed on the prior revision. Fix the two subsequent contract findings:
structured service/method authorization prevents dotted-name collisions, and Swift
encoding leaves slashes unescaped. All 100 cross-language cases and both typecheck
tiers pass. This revision awaits manager verification and independent re-review;
no domain writer has moved and S01 acceptance remains pending.

2026-09-28 encoder review repair: validate original TypeScript values before
serialization so NaN and either infinity cannot silently become null. Nine
encoder rejection cases, fifteen valid numeric/null controls, the 100-case
cross-language suite and both typecheck tiers pass. This revision still requires
manager verification and independent re-review; ownership remains unchanged.

## End-state architecture

| Layer | Responsibility |
|---|---|
| Swift AppKit/SwiftUI app | Presentation, user input, WebKit, native dialogs, OS integrations. Holds display state, not authoritative workflow state. |
| Swift service process | Workspace/chat coordination, persistence, provider sessions, Git/worktrees, source transactions, managed servers, recovery. |
| Provider adapters | Translate provider events/commands into a typed Praxis contract. Native protocols where sufficient; SDK helpers where needed. |
| Source-analysis helpers | Parse framework sources, resolve types/schemas, propose edits. No authority to commit changes or manage app state. |
| Project processes / preview | User project servers and their runtimes; JavaScript instrumentation inside WebKit. |

Transport: versioned, typed local protocol over XPC with explicit requests,
events, cancellation, and reconnection.

## Service owners

- Workspace/session coordinator
- Repository coordinator per Git repository
- Source transaction service
- Process supervisor
- Persistence service

## Migration order

1. Define contracts and correctness criteria
2. Stand up Swift service and supervision (Bun becomes supervised legacy service)
3. Move persistence and basic workspace services
4. Move managed servers
5. Move Git and source transaction ownership
6. Move chat and provider orchestration
7. Move editing and application controllers
8. Remove legacy service and complete distribution

## Correctness rules

- Each state domain has exactly one authoritative writer.
- Transfer whole ownership boundaries; avoid dual writes.
- Every mutation carries operation ID + expected revision.
- Persist operation intent and recovery checkpoints.
- Acceptance exercises interrupted operations and restarts.

## What stays JavaScript

- TypeScript type checking, React prop extraction, Svelte/Babel transforms
- Framework-specific source stamping and build plugins
- Provider SDK integrations via thin Node adapters
- WebKit DOM observation and interaction
- User project dev servers (including Bun when required by project)

## Open questions

- Exact provider integration boundary (native protocol vs SDK helper)
- Source parser helper contract and expected-content hashing
- Persistence format migration strategy

## Links

- PM conversation: agent-os talk_to_project conversationId d52bdc53-9410-492c-9ecc-7f2e2ae5bad5
