# Running and improving tests

`bun run test` runs unit and Electron tiers. `bun run verify` adds live tests.
The build runs once before the first selected Electron or live tier, including
when running only `live`. A failed build blocks both tiers; unit failures do not
stop other tests.

```sh
node test/run.mjs unit --jobs=4
node test/run.mjs unit --serial
node test/run.mjs electron --filter=remote-indicator,smoke --electron-jobs=2
node test/run.mjs all --timeout-ms=900000
```

Filters are exact comma-separated test names and must belong to a selected tier.
Worker counts and timeouts must be positive integers. The default timeout is ten
minutes per test/build. Use a larger value for slow live scenarios.

## Concurrency and isolation

Unit tests use up to four workers, capped by available CPU parallelism. Each runs
in a separate process; filesystem tests use disposable temporary roots and socket
tests use dynamic ports or process-specific paths. Keep those properties when
adding tests.

Electron uses up to two workers only for the explicit `PARALLEL_ELECTRON` allowlist
in `test/run.mjs`. Currently these are store-only remote-indicator, smoke, and
composer-draft checks. They do not start project servers or edit shared fixtures.
Every other UI test is an exclusive barrier: earlier tests finish before it starts,
and later tests wait for it to finish. All live tests remain serial because of
provider limits and simulator ownership. Tiers never overlap.

Before expanding the UI allowlist, verify unique fixture copies, ports, screenshot
names, profiles, and any global display/focus dependencies. App-data isolation
alone is insufficient: prop/style tests still edit shared fixture source files.
New UI tests default to exclusive. New unit tests must avoid shared mutations.

The runner gives every test a temporary `PRAXIS_USER_DATA` and bypasses the intro
except for `startup-intro`. On macOS/Linux, each test gets its own process group.
Timeouts and interruption send TERM, then KILL after two seconds; completion also
kills leftover group members before profile cleanup. Independently detached
children escape that group and must be cleaned by their owning test. Windows
currently terminates the direct child only. Test-owned temporary fixtures remain
the test's responsibility; abrupt termination may bypass their cleanup.

The runner takes a per-checkout lock at `test/artifacts/runs/.runner-lock` to
prevent another suite from sharing fixtures/build output. It releases the lock
on normal completion, failure, or handled interruption. After a hard crash,
verify the recorded PID is no longer running before removing a stale lock.
Individual test scripts bypass this lock; do not run them alongside a suite.
Use separate checkouts for concurrent whole-suite runs.

## Evidence and results

Each invocation writes to a unique directory under `test/artifacts/runs/`:

- A combined stdout/stderr log for each test and the build.
- `summary.json`, with individual outcomes, durations, exit codes/signals,
  log paths, counts, build results, and total elapsed time.

Terminal output shows starts/completions and paths to failed-test logs without
interleaving test output. JSON results stay in manifest order despite concurrent
completion. FAIL, TIMEOUT, BLOCKED, and CANCELLED produce a nonzero exit status;
SIGINT/SIGTERM yield 130/143. PASS and SKIP do not fail the run.

Legacy tests declare skips through stdout. Only lines beginning `SKIP` or the
test's uppercase name followed by `SKIP` (optionally `LIVE SKIP`) are recognized.
A failing exit code always wins. A test that skips even one provider/scenario is
reported as SKIP, so it never counts as fully passing coverage. This is a
conservative per-file result, not a count of individual skipped assertions.
Arbitrary mentions of SKIP in assertion descriptions do not change the outcome.

Inspect PNGs from UI tests as usual. Keep serial and concurrent benchmark runs
sequential on an otherwise idle machine, compare outcomes as well as elapsed
time, and retain both reports. A fast run with missing coverage is not a speedup.

## Optional Jev evaluation pilot

The opt-in [Jev pilot](JEV_PILOT.md) has curated development/holdout cases,
a keyword baseline, redacted requests, offline safety/metrics tests, and reports.
Use `bun run pilot:jev --dry-run` to inspect requests without network access.
A live run requires `TYPESAFE_API_KEY` in the ignored `.env.local` or environment.
Normal test runs never call Jev. Its predictions remain advisory and cannot
change deterministic test outcomes.
