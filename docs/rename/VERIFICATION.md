# Current recovery verification — 2026-09-27

Native smoke now reaches NATIVE ISLANDS PASS and NATIVE CORE PASS after fixing
the document-restoration and synthetic style-selection races. Real keyboard and
pointer checks remain enabled; the disposable window was foregrounded through
desktop automation. Full/native typechecks pass. Premature host exit fails the
test. Manager exact-commit verification and review remain pending.

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
