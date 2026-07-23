# Plan 001 — `line_height` / type-metrics agent tool

## Goal
Add a pure, deterministic tool that computes a recommended CSS **line-height** (and, as a
bonus, **letter-spacing/tracking**) for a given font size, grounded in real typographic
rules. It joins the existing family of design-system calculators in Praxis (spring_to_css,
check_contrast, fluid_clamp, color_scale, layered_shadow).

## Context you need (zero prior context assumed)
Praxis is an Electron AI design tool; a Claude agent edits the user's repo while they watch a
live preview. Praxis exposes pure "calculator" tools on an in-process MCP server so the agent
computes exact values instead of guessing. **Copy the established pattern exactly** — study
these exemplars before writing anything:
- Engine style: `src/main/spring.ts`, `src/main/apca.ts`, `src/main/fluid.ts` (pure TS, ESM,
  strict, NO external deps, no Electron import, JSDoc).
- Tool wiring: `src/main/backends/claude.ts` — the `previewServer` `tools: [...]` array, the
  zod `*Shape` schemas above it, and the `PRAXIS_TOOL_NAMES` auto-allow set. `fluid_clamp` is
  the closest analog — mirror it.
- Skill: `agent-plugin/skills/fluid-typography/SKILL.md`.
- Rules: `src/main/rules.ts` (`praxisRules`, `PRAXIS_RULES_VERSION`) + its test `test/rules.mjs`.
- Test tier registration: `test/run.mjs` (the `UNIT` array) + a `package.json` `test:*` alias.
- Test style: `test/fluid.mjs`, `test/apca.mjs` (bun, `import assert from 'node:assert'`,
  print `NAME OK — …` on success).

## Branch
```
git fetch origin && git checkout -b feat/line-height-tool origin/candidate
```
(`origin/candidate` already contains the calculator family + their skills; `main` does NOT.)

## The rules (verified, cite in code comments)
- **WCAG 2.1 SC 1.4.12 (Text Spacing):** body text must stay usable at line-height ≥ **1.5×**.
  → floor body line-height at 1.5. https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html
- **Inverse to size** (Material 3, Apple HIG, Tailwind all agree): larger type → tighter
  leading. Anchor points: 16px→~1.5, 24px→~1.33, 32px→~1.29, 48px→~1.17, 64px→~1.10.
- **Measure-aware** (Bringhurst/Butterick): longer lines need more leading; ideal ~66ch.
- **Tracking is size-specific** (Material 3 tokens): large display slightly negative, body ~0,
  small text slightly positive. Never negative on body.

## Files to create

### 1. `src/main/type-metrics.ts` (pure engine)
Exact exports (fixed contract):
```ts
export interface LineHeightInput {
  fontSizePx: number
  measureCh?: number            // characters per line; omitted = no measure adjustment
  role?: 'body' | 'heading' | 'display' | 'auto'  // default 'auto' (inferred from size)
}
export interface LineHeightResult {
  lineHeight: number            // unitless, rounded 3dp — THE css value
  lineHeightPx: number          // round(lineHeight * fontSizePx)
  rawRatio: number              // before clamping
  floored: boolean              // true if the WCAG 1.5 body floor was applied
  role: 'body' | 'heading' | 'display'
  rationale: string
}
export function lineHeight(input: LineHeightInput): LineHeightResult

export interface LetterSpacingResult { em: number; css: string; rationale: string } // css e.g. "-0.02em"
export function letterSpacing(fontSizePx: number, opts?: { allCaps?: boolean }): LetterSpacingResult

export interface TypeMetrics {
  fontSizePx: number; lineHeight: number; lineHeightPx: number; letterSpacingEm: number
  floored: boolean; role: 'body' | 'heading' | 'display'
}
export function typeMetrics(input: LineHeightInput & { allCaps?: boolean }): TypeMetrics
```

**Line-height model** (implement exactly; keep coefficients as named consts with a comment
citing the fit to M3/Apple/Tailwind):
```
baseRatio(s)  = 1.0 + 0.855 * Math.exp(-s / 29.8)          // s = fontSizePx; 16→1.500, 32→1.292, 48→1.171, 64→1.100
measureAdj(m) = clamp(0.0015 * (m - 66), -0.04, 0.04)      // only when measureCh provided
raw           = baseRatio(s) + (measureCh != null ? measureAdj(measureCh) : 0)
role (auto)   = s <= 20 ? 'body' : s <= 48 ? 'heading' : 'display'
MIN           = role === 'body' ? 1.5 : role === 'heading' ? 1.05 : 1.0
MAX           = 1.6
lineHeight    = clamp(raw, MIN, MAX)  rounded to 3dp;  floored = raw < MIN && role === 'body'
```
An explicit `role` overrides the inferred one (and thus the MIN floor).

**Tracking model** (`letterSpacing`, em, round 3dp; `css = ${em}em`, and `"0"` when 0):
```
allCaps            → +0.06
fontSizePx >= 60   → -0.02
fontSizePx >= 40   → -0.015
fontSizePx >= 24   → -0.01
fontSizePx >= 18   → -0.005
fontSizePx >= 12   → 0
else (< 12)        → +0.02
```

### 2. `test/type-metrics.mjs` (bun unit test)
Import from `../src/main/type-metrics.ts`. Assert:
- WCAG floor: `lineHeight({fontSizePx})` for 12/14/16/18/20 all return `lineHeight >= 1.5`.
- Inverse: 32px < 1.35, 48px < 1.25, 64px < 1.15; strictly non-increasing across
  [16,24,32,48,64,96] once past the body-floor region (compare 24→32→48→64→96 strictly decreasing).
- Anchor sanity vs the fit: 16px ≈ 1.5 (±0.02), 64px ≈ 1.10 (±0.03).
- Measure: `measureCh: 90` yields a higher lineHeight than `measureCh: 45` at the same size,
  and the delta is within ±0.04.
- `role: 'display'` on a 40px size drops below the heading floor (allows < 1.05).
- Tracking: 72px < 0 (negative), 16px === 0, 10px > 0, `allCaps` positive; all `css` end in `em` or are `"0"`.
- `typeMetrics(...)` returns consistent lineHeight + letterSpacingEm together.
Print `TYPE-METRICS OK — …`.

## Files to edit

### 3. `src/main/backends/claude.ts`
- Import: `import { lineHeight, letterSpacing } from '../type-metrics'` (biome will reorder — fine).
- Add `'mcp__praxis__line_height'` to `PRAXIS_TOOL_NAMES` (pure/side-effect-free → auto-allowed).
- Add a zod `lineHeightShape` next to the other `*Shape` consts:
  `fontSizePx` (number, required), `measureCh` (number, optional), `role`
  (enum ['auto','body','heading','display'], optional), `includeTracking` (boolean, optional),
  `format` (enum ['value','css'], optional; 'value' = the unitless number, 'css' =
  `line-height: <n>;` plus `letter-spacing` when includeTracking).
- Add a `line_height` tool to the `previewServer` `tools: [...]` array (mirror `fluid_clamp`).
  Description: computes an accessible, size-appropriate line-height (and optional letter-spacing)
  — tell the model to CALL it whenever it sets font-size/line-height rather than defaulting to
  1.5 everywhere. Handler: call `lineHeight(...)`, optionally `letterSpacing(...)`, return the
  value(s) + a one-line rationale + a WCAG note when `floored`.
- Update the two stale inline comments that enumerate the praxis tool set (grep
  `spring_to_css / check_contrast`) to append `line_height`.

### 4. `src/main/rules.ts` + `test/rules.mjs`
- In the `previewTools` "Design-system calculators" block, add one line teaching `line_height`
  ("set line-height with `line_height`, not a hardcoded 1.5 — it's size-aware and WCAG-floored").
- Bump `PRAXIS_RULES_VERSION` by 1 (candidate base is 7 → set 8). Update `test/rules.mjs`:
  change the `=== 7` assertion to the new number, and add `assert(/line_height/.test(withTools))`
  + `assert(!/line_height/.test(r))`. **If plan 002 already bumped the version, use the next
  integer and keep both assertions.**

### 5. `test/run.mjs` + `package.json`
- Add `'type-metrics'` to the `UNIT` array in `test/run.mjs`.
- Add `"test:type-metrics": "bun test/type-metrics.mjs"` to `package.json` scripts.

### 6. `CLAUDE.md`
- In the `src/main/` architecture map, add a line for `type-metrics.ts` next to
  `fluid.ts / oklch.ts / shadows.ts` ("line-height + letter-spacing recommender; powers the
  line_height tool").

## Verify (all must pass)
```
bun test/type-metrics.mjs          # the new unit test
bun test/rules.mjs                 # version + line_height assertions
bun run typecheck:node             # clean
bunx biome check --write src/main/type-metrics.ts test/type-metrics.mjs   # your new files must be clean
node test/run.mjs unit             # whole unit tier green (34→35 tests)
bun run build                      # succeeds; grep out/main/index.js for "line_height" (should be >0)
```
Only the pre-existing `claude.ts` biome findings (noNonNullAssertion / useOptionalChain /
noAssignInExpressions) are acceptable — introduce no new ones.

## Commit
Small focused commit, Co-Authored-By trailer. Do NOT push unless asked; leave the branch for review.

## Notes / decisions already made
- **Vendored, not a dependency** — this is pure arithmetic (unlike apca.ts which needs apca-w3).
- The measure coefficient and display-tracking magnitudes are the *contested/taste* part
  (Apple runs ~1.29 body vs web 1.5; M3 display tracking is far milder than web practice).
  Keep them as named constants so they're tunable; the body 1.5 floor and the inverse shape are
  the settled, defensible core.
- This composes with `fluid_clamp` / the type scale: same size in → paired size + leading + tracking.
```
