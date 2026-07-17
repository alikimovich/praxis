/**
 * css-values.ts — pure CSS value math for the Styles panel (v1).
 *
 * Parse/format numeric CSS text ('12px' ⇄ {n, unit}), the per-property
 * metadata table for the v1 style set (unit/min/max/step/group + flags),
 * time normalization ('0.3s' → 300ms), and cubic-bezier parse/format/snap
 * for the transition-timing-function editor.
 *
 * DOM-free by design (no window/document): it runs in the island renderer
 * AND under plain bun in `test/css-values.mjs`.
 */

export interface CssNumber {
  n: number
  unit: string // '' for unitless (opacity, font-weight)
}

export type StyleGroup = 'layout' | 'appearance' | 'typography' | 'transition'

/** Which control the panel renders for the property. */
export type StyleControl = 'number' | 'color' | 'select' | 'bezier' | 'readonly'

export interface StylePropMeta {
  group: StyleGroup
  control: StyleControl
  /** Canonical unit scrub values are expressed in ('' = unitless). */
  unit?: string
  min?: number
  max?: number
  step?: number
  /** For control 'select'. */
  options?: string[]
  /** Only shown when the element computes to display flex/grid (gap). */
  flexGridOnly?: boolean
}

/** Panel rendering order for the four groups. */
export const STYLE_GROUPS: StyleGroup[] = ['layout', 'appearance', 'typography', 'transition']

const pxMeta = (
  group: StyleGroup,
  min: number,
  max: number,
  step = 1,
  extra: Partial<StylePropMeta> = {}
): StylePropMeta => ({ group, control: 'number', unit: 'px', min, max, step, ...extra })

const SIDES = ['top', 'right', 'bottom', 'left'] as const

/**
 * The ENTIRE v1 property set (longhands), keyed by css property name.
 * Out of scope for v1 (width/height, box-shadow, per-corner radius, borders,
 * position/inset, variants) is deliberately absent — the styles engine
 * allowlist mirrors this table.
 */
export const STYLE_PROP_META: Record<string, StylePropMeta> = {
  // --- layout ---
  ...Object.fromEntries(SIDES.map((s) => [`padding-${s}`, pxMeta('layout', 0, 400)])),
  ...Object.fromEntries(SIDES.map((s) => [`margin-${s}`, pxMeta('layout', -400, 400)])),
  gap: pxMeta('layout', 0, 400, 1, { flexGridOnly: true }),

  // --- appearance ---
  color: { group: 'appearance', control: 'color' },
  'background-color': { group: 'appearance', control: 'color' },
  'border-radius': pxMeta('appearance', 0, 200),
  opacity: { group: 'appearance', control: 'number', unit: '', min: 0, max: 1, step: 0.01 },

  // --- typography ---
  'font-size': pxMeta('typography', 4, 200),
  'font-weight': { group: 'typography', control: 'number', unit: '', min: 100, max: 900, step: 100 },
  'line-height': pxMeta('typography', 0, 400),
  'letter-spacing': pxMeta('typography', -10, 20, 0.1),
  'font-family': { group: 'typography', control: 'readonly' },
  display: { group: 'typography', control: 'readonly' },

  // --- transition ---
  'transition-property': {
    group: 'transition',
    control: 'select',
    options: ['all', 'colors', 'opacity', 'transform', 'shadow']
  },
  'transition-duration': {
    group: 'transition',
    control: 'number',
    unit: 'ms',
    min: 0,
    max: 5000,
    step: 10
  },
  'transition-delay': {
    group: 'transition',
    control: 'number',
    unit: 'ms',
    min: 0,
    max: 5000,
    step: 10
  },
  'transition-timing-function': { group: 'transition', control: 'bezier' }
}

/** Metadata for a v1 property, or null when the prop isn't in the set. */
export function stylePropMeta(prop: string): StylePropMeta | null {
  return STYLE_PROP_META[prop] ?? null
}

// ---------------------------------------------------------------------------
// numeric css text ⇄ {n, unit}
// ---------------------------------------------------------------------------

const NUM_RE = /^(-?(?:\d+\.?\d*|\.\d+))([a-z%]*)$/i

/** '12px' → {n:12, unit:'px'}; '0.5' → {n:0.5, unit:''}; non-numeric → null. */
export function parseCssNumber(text: string): CssNumber | null {
  const m = NUM_RE.exec(text.trim())
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isFinite(n)) return null
  return { n, unit: m[2].toLowerCase() }
}

/** Round away float noise (0.30000000000000004 → 0.3) without losing steps like 0.01. */
function fmtNum(n: number): string {
  return String(Number(n.toFixed(4)))
}

/** {n:13, unit:'px'} → '13px'; unitless → '13'. */
export function formatCssNumber(v: CssNumber): string {
  return `${fmtNum(v.n)}${v.unit}`
}

// ---------------------------------------------------------------------------
// time normalization — durations/delays are always handled in ms
// ---------------------------------------------------------------------------

/** '0.3s' → 300, '250ms' → 250, '0' → 0; anything else → null. */
export function normalizeMs(text: string): number | null {
  const v = parseCssNumber(text)
  if (!v) return null
  if (v.unit === 'ms') return v.n
  if (v.unit === 's') return v.n * 1000
  if (v.unit === '' && v.n === 0) return 0 // css allows bare 0 for times
  return null
}

/** 300 → '300ms'. */
export function formatMs(ms: number): string {
  return `${fmtNum(ms)}ms`
}

// ---------------------------------------------------------------------------
// cubic-bezier — parse/format, keyword presets, snap, clamp
// ---------------------------------------------------------------------------

export interface Bezier {
  x1: number
  y1: number
  x2: number
  y2: number
}

/** CSS spec coordinates for the timing-function keywords. */
export const BEZIER_PRESETS: Record<string, Bezier> = {
  linear: { x1: 0, y1: 0, x2: 1, y2: 1 },
  ease: { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 },
  'ease-in': { x1: 0.42, y1: 0, x2: 1, y2: 1 },
  'ease-out': { x1: 0, y1: 0, x2: 0.58, y2: 1 },
  'ease-in-out': { x1: 0.42, y1: 0, x2: 0.58, y2: 1 }
}

const BEZIER_RE = /^cubic-bezier\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/i

/**
 * 'cubic-bezier(.17,.67,.83,.67)' or a keyword (ease/ease-in/…/linear) →
 * {x1,y1,x2,y2}. Rejects spec-invalid input (x coords outside [0,1]) → null.
 */
export function parseBezier(text: string): Bezier | null {
  const t = text.trim().toLowerCase()
  const preset = BEZIER_PRESETS[t]
  if (preset) return { ...preset }
  const m = BEZIER_RE.exec(t)
  if (!m) return null
  const [x1, y1, x2, y2] = [m[1], m[2], m[3], m[4]].map(Number)
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null
  if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) return null // css requires x ∈ [0,1]
  return { x1, y1, x2, y2 }
}

/** {x1,y1,x2,y2} → 'cubic-bezier(0.17, 0.67, 0.83, 0.67)'. */
export function formatBezier(b: Bezier): string {
  return `cubic-bezier(${fmtNum(b.x1)}, ${fmtNum(b.y1)}, ${fmtNum(b.x2)}, ${fmtNum(b.y2)})`
}

/** Tolerance per coordinate for keyword snapping (plan: 0.01/coord). */
export const BEZIER_SNAP_TOLERANCE = 0.01
const SNAP_EPS = 1e-9 // absorb float noise so "exactly 0.01 off" still snaps

/**
 * Nearest keyword preset when EVERY coordinate is within 0.01, else null.
 * Commits use this to write `ease-out` instead of its raw coords.
 */
export function snapBezierPreset(b: Bezier): string | null {
  let best: string | null = null
  let bestDist = Infinity
  for (const [name, p] of Object.entries(BEZIER_PRESETS)) {
    const ds = [b.x1 - p.x1, b.y1 - p.y1, b.x2 - p.x2, b.y2 - p.y2].map(Math.abs)
    if (ds.some((d) => d > BEZIER_SNAP_TOLERANCE + SNAP_EPS)) continue
    const total = ds.reduce((a, d) => a + d, 0)
    if (total < bestDist) {
      bestDist = total
      best = name
    }
  }
  return best
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/** Bezier handle x — spec-constrained to [0,1]. */
export function clampBezierX(x: number): number {
  return clamp(x, 0, 1)
}

/** Bezier handle y — editor range [-1,2] (overshoot allowed, bounded canvas). */
export function clampBezierY(y: number): number {
  return clamp(y, -1, 2)
}

/** Clamp all four handles into the editor's legal ranges. */
export function clampBezier(b: Bezier): Bezier {
  return {
    x1: clampBezierX(b.x1),
    y1: clampBezierY(b.y1),
    x2: clampBezierX(b.x2),
    y2: clampBezierY(b.y2)
  }
}
