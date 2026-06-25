# PLAN — Proactive problem detection ("preflight rules")

How dsgn moves from *diagnosing failures after they happen* to *catching a known
class of environment/setup problems before the build runs* — and hands the user
the fix up front. Written after the iOS-26.5 incident (below), which is the
motivating example and the first concrete rule.

## The incident (why this exists)

Opening an Expo project, dsgn booted a simulator and ran `expo run:ios`, which
spent minutes compiling and then died with `iOS 26.5 is not installed`. The
signal was knowable *before* any of that: Xcode's active simulator SDK was 26.5,
but the newest installed runtime was 26.1, and modern Xcode couples a simulator
*build* to a runtime ≥ its SDK version. `simctl list devices available` happily
listed 26.0/26.1 devices, so the old preflight (which only counts devices) went
green while the build was already doomed.

The fix shipped with this plan — `simBuildDestination()` in `src/main/xcode.ts`,
called from `preflight()` — reads the SDK version + installed runtime versions
and fails preflight *immediately* with the one-line fix (`xcodebuild
-downloadPlatform iOS`). That's one rule. This plan is about the shape that lets
us add the next twenty cheaply.

## Three layers (cheapest signal first)

dsgn already has layer 3. This plan adds 1 and 2 in front of it, and they all
feed the **same propose-first card** and the **same per-machine memory** that the
diagnose feature already built.

1. **Proactive preflight rules** — run on *open*, before booting/building.
   Read-only probes (versions, file existence, port availability, env vars)
   matched against known-bad shapes. Cheap, deterministic, no AI, no network.
   Catch the problem before the user pays for a failing build.
   *Examples:* SDK-vs-runtime gap (shipped); no `ios/` dir for a native build;
   CocoaPods not installed; Node major mismatch vs `.nvmrc`/`engines`; missing
   `.env` a `vite.config` references; a `packageManager` field that disagrees
   with the lockfile present.

2. **Rule-based failure matching** — on a failure, before calling the AI, match
   the error against a table of known signatures → known fixes. Instant, free,
   offline, and identical every time. The AI is the *fallback*, not the first
   responder.
   *Examples:* `EADDRINUSE` → port suggestion; `license has not been agreed` →
   `sudo xcodebuild -license accept` (already in `xcodeFailureReason`); `command
   not found: pod` → `brew install cocoapods`.

3. **AI diagnose (already built)** — for unknown errors. `diagnose:run` recalls
   from the per-machine cache, else one-shot SDK `query` → `{summary, steps[]}`,
   then remembers. Stays exactly as is; it just fires less often because 1 and 2
   handle the known cases.

The win: known problems get an *instant, identical, offline* answer and most are
caught **before** the failure. Unknown problems still get the AI. Both paths land
in the same card and the same memory, so a one-off AI diagnosis can later be
"promoted" into a rule.

## Proposed shape — a check registry

A `Check` is a pure-ish probe + a verdict. Keep them in one module
(`src/main/checks/` — pure, bun-testable, no electron), registered in a list the
preflight + failure paths both walk.

```ts
interface CheckContext {
  root: string
  framework: Framework
  previewKind: PreviewKind
  // lazily-run, cached probes so N checks don't re-shell the same commands:
  probe: {
    cmd(bin: string, args: string[]): Promise<{ ok: boolean; stdout: string; code: number }>
    file(rel: string): Promise<boolean>
    json(rel: string): Promise<any | null>
  }
}

interface CheckResult {
  id: string                       // stable, e.g. 'ios-sdk-runtime-gap'
  ok: boolean
  severity: 'block' | 'warn'       // block = don't start; warn = start but surface
  summary: string
  steps: DiagStep[]                // SAME shape the DiagnoseCard already renders
}

interface Check {
  id: string
  appliesTo(ctx: CheckContext): boolean   // gate by framework/previewKind — keep probes cheap
  run(ctx: CheckContext): Promise<CheckResult>
}
```

Reusing `DiagStep` (`{ text, command?, scope: 'repo' | 'host' }`) means the
existing `DiagnoseCard` renders rule output with **zero UI work** — repo steps
stay applyable, host steps (sudo/global/download) stay copy-only. Same propose-
first contract: dsgn never auto-runs a fix.

### Failure path reuses the registry

On failure, run the same checks but let each one *also* match an error string
(`matches(err): CheckResult | null`). First match wins → instant card, no AI.
No match → fall through to `diagnose:run` (layer 3). The registry is the single
source of truth for "things dsgn knows about."

## Memory: per-machine now, opt-in project playbook later

- **Per-machine (today).** `diag-cache.ts` already stores resolved diagnoses in
  `userData`, keyed by `{root}{signature}`, never committed. Rule *outcomes*
  (applied/dismissed) record the same way, so a dismissed rule can go quiet on
  this machine.
- **Project playbook (Phase 2, opt-in).** A committed `.dsgn/checks.json` a
  teammate inherits: project-specific requirements ("needs Node 20", "run
  `supabase start` first", "iOS build needs runtime ≥ SDK"). The *built-in*
  registry covers the universal cases; the playbook covers per-repo ones. This
  is the only piece that touches the repo, so it stays explicitly opt-in — matches
  the earlier "per-machine only" decision unless the user chooses to commit a
  playbook.

## Slices (small, each shippable + testable on its own)

- **C1 — extract the registry.** Define `Check`/`CheckResult`, fold the two rules
  that already exist (`simBuildDestination`, `xcodeFailureReason`) behind it.
  Pure unit tests. No behavior change — just the seam. ✅ partially done: the
  iOS rule logic already lives pure in `xcode.ts`.
- **C2 — wire preflight to walk applicable checks** and return the first `block`.
  Generalizes the simulator preflight; web preview gets the same entry point.
- **C3 — failure path consults the registry before the AI.** Move the
  `EADDRINUSE`/license/`pod`-not-found matchers into checks; `diagnose.ts`
  becomes the fallback.
- **C4 — a "Checks" surface** (optional): show the green/blocked checks for the
  open project so the user sees *why* dsgn is happy or stuck, not just on failure.
- **C5 — `.dsgn/checks.json` playbook loader** (opt-in, Phase 2).

## Non-goals / guardrails (unchanged)

- Never auto-run a fix — propose-first, always. Host-scoped steps are copy-only.
- The agent never runs `sudo`.
- Don't auto-download multi-GB SDKs without consent (the 26.5 download was
  explicitly consented).
- Probes are read-only and time-boxed; a check that can't determine an answer
  returns `ok: true` (degrade safe — never block on uncertainty, exactly how
  `simBuildDestination(null, …)` behaves).
