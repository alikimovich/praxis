# Native versus Electron — 2026-09-23

Native is smaller on disk and uses less resident memory in this workload.
Electron starts faster, with more reliable startup in this sample. Neither
showed an advantage in the simple preview scroll test.

Measured on this workspace's Mac mini, Apple M4 Pro (12 cores), 48 GB RAM,
macOS 26.4.1; Bun 1.3.13 and Electron 43.1.0. Application source: `c9db2e8`.
These are local measurements of the current builds, not general engine rankings.

| Measurement | Native | Electron |
| --- | ---: | ---: |
| Runtime + application files, excluding external dependencies | 63.7 MiB | 309.0 MiB |
| Launch to ready UI, successful runs | 2.54 s | 0.66 s |
| Open project to ready preview | 1.62 s | 1.13 s |
| Settled total process RSS | 732 MiB | 1,022 MiB |
| RSS excluding the automatically launched Claude helper | 386 MiB | 652 MiB |
| Idle CPU, percent of one core | 3.48% | 1.49% |
| Median preview animation-frame interval | 33 ms | 33.3 ms |
| Successful / attempted benchmark launches | 2 / 4 | 3 / 3 |

Values are medians across successful runs. Native total RSS was 728–737 MiB;
Electron was 1,020–1,034 MiB. Successful native startup was 2.38–2.70 s versus
0.56–0.74 s for Electron. CPU varied from 2.82–4.14% native and 0.83–2.65%
Electron. This small sample does not establish a stable CPU advantage.

## Size accounting

Native: Bun 60.15 MiB, AppKit host 0.50 MiB, and application/preload/renderer files
3.03 MiB. Electron: runtime distribution including licenses 295.18 MiB and
application/preload/renderer files 13.82 MiB. This measured subset is 79% smaller
for native. It is **not** a complete standalone installer comparison.

Both builds depend on external packages. In this checkout, the Claude platform
package alone occupies roughly 208 MiB on disk and Codex's platform package about
288 MiB; these are not removed by switching rendering engines. Native also uses
macOS's installed WebKit, which is not counted as application disk usage. The
native output directory contains a roughly 297 MiB Swift module cache, excluded
because it is a compiler artifact. Source maps, temporary benchmark wrappers and
compiler sources are excluded. Build bundling/minification differs between the
current pipelines, so the application-code delta is not solely an engine effect.

## Workload and measurement

- Built the current Electron output; used the freshly built native output.
- Launched isolated profiles with onboarding skipped. Used 1320 × 860 windows.
- Opened equivalent fresh Git repositories containing the same static HTML page:
  200 cards with headings, text and buttons. Praxis owned its preview server.
- No prompts were sent to a provider. Both apps nevertheless launched a Claude
  SDK helper while opening the project; total RSS includes that helper.
- Used lightweight temporary stdin bridges in copies of the built entrypoints
  to check readiness. Launch timing ends when the main API and Open Project
  control exist and two animation frames complete. Project timing ends when the
  preview marker exists and two animation frames complete. Build time is excluded.
- Allowed four seconds after preview readiness, then sampled RSS every 250 ms
  for six seconds. CPU is the sum of process CPU-time deltas over that interval,
  where 100% means one fully occupied core. The launcher itself is excluded.
- Counted app descendants plus newly created WebKit XPC helpers (which are
  parented by launchd). Existing WebKit processes were excluded using a baseline.
  All recorded benchmark processes were confirmed gone after cleanup.
- Reported total resident set size, **not** macOS physical footprint or unique
  memory. Summed RSS can count shared pages more than once. Core-only RSS is
  a settled end-of-interval snapshot with the Claude helper subtracted.
- Scrolled the preview for 120 requestAnimationFrame callbacks. Both engines
  delivered about 30 callbacks/second on this setup. This is not a maximum-FPS
  result or a comprehensive test of input latency, native transitions or chat.
- Other existing desktop apps, including the user's native Praxis instance,
  remained open. Runs were sequential, using fresh profiles but warm OS caches.

## Failures and limits

Two native attempts failed the 45-second readiness check with the existing
WebKit/evaluation unsupported-result issue. They are retained in the raw results
but excluded from successful-run timing and memory medians. This does not prove
a general 50% failure rate; it does make startup reliability an unresolved issue.
Electron completed all three measured attempts.

An earlier Playwright-based exploratory harness stalled attaching to Electron;
that harness and its measurements were discarded. The reported comparison uses
the same lightweight readiness approach for both runtimes. An abandoned isolated
Electron process overlapped part of the measured sequence before cleanup, adding
a further desktop-load limitation to these exploratory timing/CPU results.

Raw process samples, sizes, summaries and the temporary measurement harness are
in `test/artifacts/runtime-benchmark/` (ignored local artifacts). The benchmark
copies of built entrypoints were removed afterwards; product source was not
instrumented or changed.

The next useful measurements are long chat transcripts, a representative Next.js
project, repeated layout transitions, and longer settled memory/CPU sampling.
First, address native startup reliability; the current evidence supports a
size/memory benefit, not an overall performance win.
