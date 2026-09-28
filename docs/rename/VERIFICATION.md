# Independent-review corrections — 2026-09-27

Based on implementation `567e69642a8c132d4ce5720afb3501d4332af764` and candidate
`c4b1aad8f7086a5f92d6f776b7b6273b792bf348`. New regression fixtures reproduced
the missing legacy recovery record and the shadowed legacy template mapping before
the fixes. After the fixes:

- `bun test/chat-recovery.mjs`: passes real Git dirty and clean-unmerged recovery
  for both branch prefixes, preserved branch contents/owning repo and repeat recovery.
- `bun test/html-source.mjs`: passes legacy/current template mapping preservation,
  nested canonical stamping and repeated stamping alongside existing splice tests.
- `bun run typecheck` and `bun run typecheck:native`: pass.
- `bun test/rename-compat.mjs`, `bun test/chat-worktrees.mjs` and
  `bun test/docs-links.mjs`: pass.
- `bun scripts/audit-rename.mjs` and `git diff --check`: pass. The residual report
  records concrete commit references and explicitly identifies its working-tree scan.
- Pinned candidate-to-head diff of `docs/SWIFT-BACKEND-*.md`: empty; LKM-84 snapshots
  are preserved. Coordination now documents the actual target and integration order.

No configured manager command, native GUI/smoke suite or provider calls were run
for these corrections. The earlier manager result below predates this follow-up;
the manager owns staging, commits and final integration verification.

# Previous recovery verification — 2026-09-27

Native smoke now reaches NATIVE ISLANDS PASS and NATIVE CORE PASS after fixing
the document-restoration and synthetic style-selection races. Real keyboard and
pointer checks remain enabled; the disposable window was foregrounded through
desktop automation. Full/native typechecks pass. Premature host exit fails the
test. Manager run 57fbd3e4-bc79-44e1-ac78-e69ea434dbd4 passed full/native typechecks,
all 101 unit tests, NATIVE ISLANDS PASS, NATIVE CORE PASS and direct-launch checks.
Independent integration review remains pending.

# Verification — 2026-09-27

## Latest manager feedback: native input

Manager run `run-eFpM7F` passed all 101 unit checks and both typechecks, then failed
its real native inline-edit gesture (`#native-title.isContentEditable` timeout).
The worker inspected `test/artifacts/native/failure.png`; its inactive-looking
window chrome and blank WebKit capture are evidence to investigate, not conclusive
proof of the failure cause (offscreen capture has known limits).

Read-only comparison against candidate `eb02154` found no focus prerequisite in
its otherwise unchanged native event injection. The ephemeral/test-only input
command now activates the app, brings the main window forward, makes WebKit the
responder and reports readiness. The smoke fixture awaits native/document focus,
checks the pointer hit target, and awaits the first click's selection toolbar before
the double-click. The original trusted gestures and editing assertions remain.
Timeouts now include focus, active element, cursor, heading markup and hit target.
The change does not accept synthetic DOM double-clicks or skip failed gestures.

The MCP declaration now matches candidate's existing `^1.29.0` dependency fix.
`@types/react` 18.3.31 and its type-only dependencies are declared and locked.
Bun 1.3.13 validated the full frozen lock and installed the three-package type graph
into an empty temporary fixture from cache; this supersedes the previous manual
`node_modules` workaround. See the updated dependency evidence below.

Worker checks: full/native typechecks, native-boundary, test-runner, setup-next,
docs-links and native compilation pass. The normal native build is compile-only;
no app launch, GUI/smoke suite or manager verification command was run this turn.
Manager must rerun the real native gesture suite under the shared desktop lock.
The successful build does not establish that the input timeout is resolved on screen.


## Manager feedback follow-up

Manager run `run-vvLVHk`: 98 pass, 3 fail; docs-links and the socket/network tests
passed there. [Baseline evidence and focused fixes](BASELINE-FAILURES.md) supersede
the earlier unresolved-failure descriptions below. All three reported failures
reproduced at the original native base. SDK declaration and runner fixtures are
repaired; the missing React fixture dependency remains a baseline clean-install
limitation, with a passing diagnostic run using local cached types.

Focused follow-up results: `bun run typecheck`, `bun run typecheck:native`,
`bun test/native-boundary.mjs`, `bun test/test-runner.mjs`, `bun test/docs-links.mjs`
and `git diff --check` pass. `bun test/setup-next.mjs` passes only after the local
cached fixture dependencies described in the evidence document were supplied.

No configured manager sequence or native GUI/smoke suites were run in this
follow-up. Manager retains desktop verification and staging/commits.

## Initial worker verification

Executed in the supplied native worktree using Bun 1.3.13. No provider calls,
Git staging/commits, external resource mutations or other worktree edits.

| Check | Result |
| --- | --- |
| Configured Bun loop: `typecheck`, `typecheck:native`, `test:native` | Exit 0 |
| `bun run typecheck` | Pass (backend and preview) |
| `bun run typecheck:native` | Pass |
| `bun run test:native` | Exit 0; normal build produced Trezi Native.app and direct-launch argument checks passed |
| `bun test/rename-compat.mjs` | Pass, including real Git worktree paths, live profile-lock refusal and both CLI names |
| `bun test/sidecar-migrate.mjs` | Pass (existing dsgn behavior) |
| `bun test/provider-skills.mjs`, `bun test/skills-install.mjs`, `bun test/trezi-cli.mjs` | Pass |
| `bun test/run.mjs unit` | 92 pass, 9 fail, 101 total |
| `bun test/docs-links.mjs` | Fails only because new rename docs are not yet in the manager-owned index |
| `bash -n install.sh`, `git diff --check` | Pass |
| `bun scripts/audit-rename.mjs` | Residual occurrence report regenerated |
| `bun run check` | Not applicable: package has no `check` script |

Final unit report: `test/artifacts/runs/run-6OUUdc/summary.json` (ignored runtime
artifact). The earlier run before new docs/fixtures had 92 pass and 8 fail.
Failures in the final run:

- `trezi-agent-tools`, `codex-mcp`: sandbox EPERM when binding a Unix socket.
- `native-shutdown`, `native-preview-recovery`, `devserver-net`: fixture listeners
  cannot bind here (EADDRINUSE/failed-listener/no-free-port outcomes).
- `native-boundary`: undeclared `@modelcontextprotocol/sdk` runtime dependency,
  already reported in the baseline progress log; the runner also reports EPERM
  trying to kill the failed subprocess.
- `setup-next`: missing `@types/react/package.json` fixture dependency.
- `test-runner`: its subprocess success assertion gets exit 1; not resolved here.
- `docs-links`: README references the two new rename documents. This check uses
  the Git index, not file existence. The files exist; the manager must stage them
  and rerun the check. The worker did not weaken the check or stage files.

The native command emitted no smoke-completion evidence or PNGs in this sandbox.
Its successful exit proves build/direct-launch checks, not visible UI acceptance.
No screenshot could be inspected. Native visual behavior and real Keychain access
remain release checks in an unrestricted, unlocked macOS session. Background-test
mode was not enabled. Retained bundle/Keychain identities are documented and were
not tested by reading personal credentials.

Migration coverage uses disposable fixtures: fresh profile naming; legacy profile
and session aliases; repeated/restarted alias creation; partially copied project
data; old/new profile and session collisions; canonical sidecar collision precedence
with both copies preserved; symlink rejection; preference precedence and canonical
writes; environment precedence; legacy sidecar protections; old source stamps and
branches; and actual Git worktree resolution after logical migration. Simulated
interruption checks do not represent a power-loss/fsync durability guarantee.

Manager follow-up: stage the complete new files, rerun docs-links, supply the final
head hash in the coordination report, and rerun blocked native/MCP/network checks
in an unrestricted environment before acceptance.

## Diagnostic escalation — composer sizing (2026-09-27)

The latest manager run passed 102 unit checks and reached NATIVE ISLANDS PASS,
then failed `Soft-wrapped draft fits before reaching the cap`. Earlier success
records above do not establish acceptance of this latest state. Prior attempt
artifact directories inspected here contain result-schema files; the supplied
manager log and local test artifacts provide the failure evidence.

A windowless fixture compiling the production composer reproduced the same
assertion before editing. After a painted 80-line draft is replaced, TextKit
invalidates layout but leaves the document's old height until sizing/paint.
The measured wrapped draft requires 76pt; the capped draft document is 1368pt.
`NativeComposer.layout()` now calls `sizeToFit()` for nonempty text at the current
viewport size. The reproducer then reports a 76pt document in a 76pt viewport.
This fixes document geometry instead of delaying or relaxing the smoke assertion.

`test/native-composer-layout.mjs` compiles production Swift and runs without an
NSApplication, window, event loop or desktop input. It covers long-to-wrapped and
long-to-short replacement, three widths, empty drafts, trailing caret lines and
capped overflow. It is registered in the unit tier; non-macOS runs explicitly SKIP.
Full desktop smoke verification remains required under the manager's desktop lock.

Focused verification for this correction:

- The checked-in windowless regression compiled against a temporary copy of the
  pre-fix composer exits 1: replacement document 1369pt, viewport 76pt at width 420.
  The same regression passes against the fixed production composer.
- `bun run typecheck`, `bun run typecheck:native`, `bun run build:native`: pass.
- `bun test/native-composer-layout.mjs`, `bun test/native-chat-controller.mjs`,
  `bun test/test-runner.mjs`, `bun test/rename-compat.mjs`,
  `bun test/docs-links.mjs`, `git diff --check`: pass.
- Configured manager verification and native GUI/smoke suites were not run.
  Existing manager-staged changes were preserved; this correction is unstaged.

## Independent review correction — source selector precedence (2026-09-27)

`sourceStamp` already preferred a present canonical attribute (including empty),
but `sourceSelector` also matched conflicting legacy values. The legacy selector
now excludes elements carrying the canonical attribute. Selection grouping and
first-match HMR style lookup therefore agree with source reads.

`bun test/source-stamp.mjs` reproduced the failure before the fix and passes after
it. It uses Bun's HTML selector engine on the equivalent selector list because
that engine does not implement the outer `:is` wrapper. The registered unit check
covers conflicts, legacy-only, canonical-only, empty, equal and unspecified stamps.
The native smoke suite additionally exercises the unmodified selector in a real
DOM, CSS escaping and first-match HMR lookup using a detached document. This new
DOM check remains unexecuted here; the manager owns desktop verification.

A DOM dependency installation was blocked by sandbox network access. No dependency
or lockfile change was retained; the checks use existing Bun and native WebKit.

Focused results: `bun run typecheck`, `bun run typecheck:native`,
`bun test/source-stamp.mjs`, `bun test/rename-compat.mjs`,
`bun test/html-source.mjs`, `bun test/test-runner.mjs`,
`bun test/docs-links.mjs`, `bun scripts/audit-rename.mjs` and
`git diff --check` pass. The generated DOM-check JavaScript also parses; this
syntax check is not DOM execution. No native GUI/smoke suite or configured manager
verification loop was run.
`bun run build:native` also passes and regenerates the preview/native outputs.
