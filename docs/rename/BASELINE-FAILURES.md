# Manager verification follow-up — 2026-09-27

## Resolution after the next manager run

The remaining React fixture dependency is now declared and locked: `@types/react`
18.3.31, `@types/prop-types` 15.7.15 and `csstype` 3.2.3. React/csstype dependency and
integrity metadata came from the local npm registry cache. The prop-types integrity
was corroborated against published [Hugeicons dependency metadata](https://github.com/hugeicons/hugeicons-react/blob/main/pnpm-lock.yaml)
and the [Claude Code Router lockfile](https://github.com/musistudio/claude-code-router/blob/main/package-lock.json).
No registry checksum was invented or omitted. Bun 1.3.13 regenerated the lockfile,
accepted `bun install --ignore-scripts --frozen-lockfile --prefer-offline`, and
installed the three type packages into an empty temporary dependency fixture using
the same locked entries. The unchanged Next fixture passes.

Candidate `eb02154` already declares the MCP SDK with `^1.29.0`; this worktree now
matches that policy, without upgrading the resolved SDK. The runner fixture repair
is not present in candidate, so it remains part of this task. No merge was performed.
The historical diagnosis below records the earlier environment limitation, which
no longer blocks the clean type-dependency installation.

## Earlier baseline reproduction

Manager run `test/artifacts/runs/run-vvLVHk/summary.json`: 98 pass, 3 fail.
All three failures were reproduced with Bun 1.3.13 against the original native
commit `94b6dd6d3746e14cc0bf26e7fbd4a8fce1837f7e`, before the rename.

Method: export that commit with read-only `git archive` into a disposable `/tmp`
directory, link its `node_modules` to the installed dependencies, and run only
`bun test/native-boundary.mjs`, `bun test/setup-next.mjs` and
`bun test/test-runner.mjs`. No Git worktree was created or changed. The runner
self-test uses console-only native/live stubs, not GUI or provider suites.
Raw results are in the ignored `test/artifacts/rename-baseline-failures.json`.

| Test | Baseline result | Follow-up |
| --- | --- | --- |
| native-boundary | Exit 1 at test/native-boundary.mjs:17: undeclared `@modelcontextprotocol/sdk/client/index.js` | Declare the already-resolved SDK version 1.29.0 as a direct runtime dependency; regenerate Bun lockfile |
| setup-next | Exit 1: cannot find `@types/react/package.json` | Baseline fixture dependency gap; cached React 18 types make the unchanged test pass locally, but a clean-install dependency fix remains outstanding |
| test-runner | Exit 1 at test/test-runner.mjs:113: expected child exit 0, received 1 | Populate all four native member stubs instead of only native-runtime; assert four passes plus one live skip |

The runner's native membership already included `native-source-window`,
`native-chat-scroll` and `native-next-hmr` at the base commit. Their missing stub
files caused the nested suite failure. Production runner membership and outcome,
cleanup, timeout, cancellation and failure assertions remain unchanged. Assertion
failures now include child stdout as well as stderr for useful diagnostics.

Dependency resolution attempts could not reach registry manifests
(ConnectionRefused/FailedToOpenSocket/DNSResolveFailed). Cached packages and npm
metadata were copied read-only from the shared Bun cache into `/tmp`; shared cache
files were not changed. A cached Bun 1.4.2 was also tried for resolution, without
success. No incomplete React-type declaration, temporary dependency override or
unresolved lockfile entry is included in the patch.

For diagnosis only, cached `@types/react` 18.3.31, `@types/prop-types` 15.7.15 and
`csstype` 3.2.3 were copied into this worktree's ignored `node_modules`. The current
Next fixture passes with those files. This is **not** a reproducible clean-install
repair: manager follow-up with registry access must add and lock the missing
React fixture dev dependency. The baseline reproduction above was recorded before
these local copies were supplied. Do not count the locally passing fixture as
proof that the missing package declaration is fixed.

The SDK addition does not upgrade its resolved version or transitive dependencies.
Bun 1.3.13 successfully regenerated the lockfile using the temporary cache. Final
focused checks use Bun 1.3.13. Desktop/native smoke and the manager's configured
verification sequence were not run by this worker in this follow-up.
