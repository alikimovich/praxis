import { useEffect, useRef, useState } from 'react'
import type { SelectedElement } from '../../../shared/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronRight, Play } from 'lucide-react'
import {
  STYLE_PROP_META,
  formatCssNumber,
  formatMs,
  normalizeMs,
  parseCssNumber
} from '@/lib/css-values'
import ColorControl from './styles/ColorControl'
import ScrubInput from './styles/ScrubInput'

interface Props {
  root: string
  element: SelectedElement
  /** Seed a chat prompt for changes the styles engine can't land as a literal. */
  onSeedPrompt: (text: string) => void
}

/** Every v1 property (incl. the read-only chips) — one fresh read fills the panel. */
const ALL_PROPS = Object.keys(STYLE_PROP_META)

const SIDES = ['top', 'right', 'bottom', 'left'] as const

/** `gap` only means something on these computed display values. */
const FLEX_GRID = new Set(['flex', 'grid', 'inline-flex', 'inline-grid'])

/** Post-commit settle time before reconciling against a fresh read (lets HMR land). */
const RECONCILE_MS = 600

// ---------------------------------------------------------------------------
// pure row helpers
// ---------------------------------------------------------------------------

/**
 * The row's numeric value in its canonical unit, from the computed css text.
 * `normal` gets a scrubbable interpretation where one exists (letter-spacing/
 * gap → 0, line-height → font-size × 1.2); anything else non-numeric → null
 * (the row renders as a readout instead of a scrubber).
 */
function numericValue(prop: string, values: Record<string, string>): number | null {
  const raw = values[prop]
  if (raw === undefined) return null
  const meta = STYLE_PROP_META[prop]
  if (meta?.unit === 'ms') return normalizeMs(raw)
  const p = parseCssNumber(raw)
  if (p) return p.n
  if (raw === 'normal') {
    if (prop === 'letter-spacing' || prop === 'gap') return 0
    if (prop === 'line-height') {
      const fs = parseCssNumber(values['font-size'] ?? '')
      return fs ? Math.round(fs.n * 1.2) : null
    }
  }
  return null
}

/** Scrub value → the css text we preview/commit ('13px', '300ms', '0.5'). */
function toCssText(prop: string, n: number): string {
  const meta = STYLE_PROP_META[prop]
  if (meta?.unit === 'ms') return formatMs(n)
  return formatCssNumber({ n, unit: meta?.unit ?? '' })
}

/** '#rrggbb[aa]' / rgb()/rgba() / transparent → channels; anything else null. */
function parseColorLike(text: string): { r: number; g: number; b: number; a: number } | null {
  const t = text.trim().toLowerCase()
  if (t === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(t)) {
    let hex = t.slice(1)
    if (hex.length <= 4) hex = [...hex].map((c) => c + c).join('')
    const int = (at: number): number => parseInt(hex.slice(at, at + 2), 16)
    return { r: int(0), g: int(2), b: int(4), a: hex.length === 8 ? int(6) / 255 : 1 }
  }
  const m = /^rgba?\(([^)]+)\)$/.exec(t)
  if (!m) return null
  const parts = m[1].replace('/', ' ').trim().split(/[\s,]+/)
  if (parts.length !== 3 && parts.length !== 4) return null
  const nums = parts.map(Number)
  if (!nums.every(Number.isFinite)) return null
  return { r: nums[0], g: nums[1], b: nums[2], a: parts.length === 4 ? nums[3] : 1 }
}

/**
 * Does a fresh computed value equal what we committed? Textual equality is not
 * enough: we commit '#ff0000' and read back 'rgb(255, 0, 0)', commit '300ms'
 * and read back '0.3s'. Normalize per control kind before comparing.
 */
function sameCssValue(prop: string, a: string, b: string): boolean {
  if (a === b) return true
  const meta = STYLE_PROP_META[prop]
  if (meta?.control === 'color') {
    const ca = parseColorLike(a)
    const cb = parseColorLike(b)
    if (!ca || !cb) return false
    return ca.r === cb.r && ca.g === cb.g && ca.b === cb.b && Math.abs(ca.a - cb.a) < 0.02
  }
  if (meta?.unit === 'ms') {
    const ma = normalizeMs(a)
    return ma !== null && ma === normalizeMs(b)
  }
  const na = parseCssNumber(a)
  const nb = parseCssNumber(b)
  if (na && nb) return na.n === nb.n && na.unit === nb.unit
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** What the row functions need from the panel — threaded to every row. */
interface RowCtx {
  values: Record<string, string>
  disabled: boolean
  preview: (prop: string, css: string) => void
  commit: (prop: string, css: string) => void
}

/**
 * The Styles tab body — content-only, rendered inside IslandCard's styles
 * TabsContent (which is `flex min-h-0 flex-col`, so the rows div scrolls under
 * the card's maxHeight). Fresh computed values come from `styles.read` on
 * mount / selection change — the pick-time `element.styles` snapshot only
 * primes the first paint. Scrubs preview live (rAF-throttled CSS injection);
 * release commits through `styles.apply` (Tailwind rewrite → inline splice →
 * agent seed). Styles always target `element.source` — the host element's own
 * stamp — never `componentSource` (a css edit lands on the element, not the
 * component call site).
 */
export default function StylePanel({ root, element, onSeedPrompt }: Props): React.JSX.Element {
  const [values, setValuesRaw] = useState<Record<string, string>>(() => ({ ...element.styles }))
  const [lost, setLost] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Async flows (commit chains, reconcile timers) read through the ref so they
  // never act on a stale snapshot; every write goes through merge/setValues.
  const valuesRef = useRef(values)
  const setValues = (v: Record<string, string>): void => {
    valuesRef.current = v
    setValuesRaw(v)
  }
  const merge = (patch: Record<string, string>): void =>
    setValues({ ...valuesRef.current, ...patch })

  /** Latest un-flushed preview per prop; one rAF flush sends the trailing edge. */
  const pendingRef = useRef(new Map<string, string>())
  const rafRef = useRef<number | null>(null)
  /** Pending post-commit reconcile timers — cancelled on selection change. */
  const timersRef = useRef(new Set<number>())
  /** Last committed change, for Replay (fallback: the opacity demo). */
  const lastCommitRef = useRef<{ prop: string; from: string; to: string } | null>(null)

  const source = element.source
  const disabled = !source

  // Selection identity — NOT the element object (PanelHost re-pushes state for
  // reasons that aren't a new selection, e.g. inspection updates).
  const elKey = `${source ?? ''}|${element.selector}`

  // biome-ignore lint/correctness/useExhaustiveDependencies: elKey is the
  // selection identity; element.styles/read intentionally refresh only then.
  useEffect(() => {
    let alive = true
    setLost(false)
    setError(null)
    lastCommitRef.current = null
    setValues({ ...element.styles }) // instant paint from the pick-time snapshot…
    window.api.styles.read(ALL_PROPS).then((res) => {
      if (!alive) return
      if (res) merge(res) // …then the fresh truth
      else setLost(true)
    })
    return () => {
      alive = false
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      pendingRef.current.clear()
      for (const t of timersRef.current) window.clearTimeout(t)
      timersRef.current.clear()
    }
  }, [elKey])

  /** rAF-throttled (trailing-edge) live injection — scrubs call this per move. */
  const preview = (prop: string, css: string): void => {
    pendingRef.current.set(prop, css)
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      for (const [p, v] of pendingRef.current) window.api.styles.preview(p, v)
      pendingRef.current.clear()
    })
  }

  /**
   * Post-commit reconciliation: do NOT clear the live override immediately
   * (HMR flash); after a settle delay re-read the prop — equal to what we
   * committed → the source now provides it, clear the override; selection gone
   * → nothing; mismatch → keep the override (the committed source is still
   * correct, something else diverged).
   */
  const scheduleReconcile = (prop: string, committed: string): void => {
    const id = window.setTimeout(async () => {
      timersRef.current.delete(id)
      const res = await window.api.styles.read([prop])
      if (!res) return
      const fresh = res[prop]
      if (fresh === undefined) return
      merge({ [prop]: fresh })
      if (sameCssValue(prop, fresh, committed)) window.api.styles.clearPreview(prop)
    }, RECONCILE_MS)
    timersRef.current.add(id)
  }

  const commit = async (prop: string, css: string): Promise<void> => {
    if (!source) return
    setError(null)
    // Tuning a duration/delay with transitions off would commit an invisible
    // change — enable `transition-property: all` first so the tweak is real.
    if (prop === 'transition-duration' || prop === 'transition-delay') {
      const tp = valuesRef.current['transition-property']
      if (!tp || tp === 'none') await commit('transition-property', 'all')
    }
    const prev = valuesRef.current[prop] ?? css
    preview(prop, css) // non-scrub commits (select / Enter) show instantly too
    merge({ [prop]: css })
    try {
      const res = await window.api.styles.apply(root, {
        source,
        prop,
        value: css,
        classes: element.classes
      })
      if (res.applied) {
        lastCommitRef.current = { prop, from: prev, to: css }
        scheduleReconcile(prop, css)
      } else if (res.needsAgent) {
        onSeedPrompt(
          res.agentPrompt ?? `In ${source}, set \`${prop}\` to \`${css}\` on the <${element.tag}> element.`
        )
        window.api.styles.clearPreview(prop)
      } else {
        setError(res.error ?? 'Could not apply the change.')
        window.api.styles.clearPreview(prop)
      }
    } catch {
      setError('The edit could not be sent.')
      window.api.styles.clearPreview(prop)
    }
  }

  /** Replay the last committed change; before any commit, a small opacity demo. */
  const replay = (): void => {
    const last = lastCommitRef.current
    if (last && last.from !== last.to) window.api.styles.replay(last.prop, last.from, last.to)
    else window.api.styles.replay('opacity', '0.5', valuesRef.current.opacity || '1')
  }

  const seedColorEdit = (prop: string): void =>
    onSeedPrompt(
      `In ${source ?? 'the selected element'}, change the \`${prop}\` (currently \`${
        values[prop] ?? 'unset'
      }\`) of the <${element.tag}> element.`
    )

  if (lost) {
    return (
      <div className="stylepanel__rows flex flex-col gap-2 overflow-y-auto px-3 pb-3 pt-1.5">
        <div className="stylepanel__lost text-[12px] text-muted-foreground">
          Selection lost — click the element again.
        </div>
      </div>
    )
  }

  const ctx: RowCtx = { values, disabled, preview, commit }
  const display = values.display ?? ''
  const timing = values['transition-timing-function'] ?? 'ease'

  return (
    <>
      {error && (
        <div className="stylepanel__error mx-3 mt-1 text-[11.5px] text-red-700">{error}</div>
      )}
      {disabled && (
        <div className="stylepanel__note mx-3 mt-1 text-[11.5px] text-muted-foreground">
          Not set up for style editing — changes can't be saved. Ask Praxis below.
        </div>
      )}
      <div className="stylepanel__rows flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3 pt-1.5">
        <StyleGroup title="Layout">
          <SideRows base="padding" ctx={ctx} />
          <SideRows base="margin" ctx={ctx} />
          {FLEX_GRID.has(display) && <NumberRow prop="gap" ctx={ctx} />}
        </StyleGroup>

        <StyleGroup title="Appearance">
          <ColorRow prop="color" ctx={ctx} onNeedsAgent={() => seedColorEdit('color')} />
          <ColorRow
            prop="background-color"
            ctx={ctx}
            onNeedsAgent={() => seedColorEdit('background-color')}
          />
          <NumberRow prop="border-radius" ctx={ctx} />
          <NumberRow prop="opacity" ctx={ctx} />
        </StyleGroup>

        <StyleGroup title="Typography">
          <NumberRow prop="font-size" ctx={ctx} />
          <NumberRow prop="font-weight" ctx={ctx} />
          <NumberRow prop="line-height" ctx={ctx} />
          <NumberRow prop="letter-spacing" ctx={ctx} />
          <ChipRow label="font-family" value={values['font-family'] ?? '—'} />
          <ChipRow label="display" value={display || '—'} />
        </StyleGroup>

        <StyleGroup title="Transition">
          <TransitionPropertyRow ctx={ctx} />
          <NumberRow prop="transition-duration" ctx={ctx} />
          <NumberRow prop="transition-delay" ctx={ctx} />
          {/* TODO(bezier): replace this readout with <BezierEditor value={timing}
              onChange/onCommit → preview/commit('transition-timing-function', …)>
              when it lands (phase 4). */}
          <ReadoutRow label="timing-function" value={timing} />
          <div className="stylepanel__row grid min-h-7 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2">
            <span />
            <Button
              variant="outline"
              size="sm"
              className="stylepanel__replay h-7 justify-self-end px-2 text-[11.5px]"
              onClick={replay}
              title="Replay the last change as a transition"
            >
              <Play className="size-3" aria-hidden="true" />
              Replay
            </Button>
          </div>
        </StyleGroup>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// rows
// ---------------------------------------------------------------------------

function StyleGroup({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="stylepanel__group flex flex-col gap-1">
      <h3 className="stylepanel__grouptitle pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
        {title}
      </h3>
      {children}
    </section>
  )
}

/** Numeric scrub row; non-numeric computed text degrades to a readout. */
function NumberRow({ prop, ctx }: { prop: string; ctx: RowCtx }): React.JSX.Element {
  const meta = STYLE_PROP_META[prop]
  const n = numericValue(prop, ctx.values)
  if (!meta || n === null) return <ReadoutRow label={prop} value={ctx.values[prop] ?? '—'} />
  return (
    <ScrubInput
      label={prop}
      value={n}
      min={meta.min ?? 0}
      max={meta.max ?? 1000}
      step={meta.step ?? 1}
      unit={meta.unit}
      disabled={ctx.disabled}
      onScrub={(v) => ctx.preview(prop, toCssText(prop, v))}
      onInput={(v) => ctx.preview(prop, toCssText(prop, v))}
      onCommit={(v) => void ctx.commit(prop, toCssText(prop, v))}
    />
  )
}

/**
 * padding/margin: one linked scrubber while all four computed sides are equal
 * (chevron expands to per-side); unequal sides always render per-side (a
 * linked value would lie about three of them).
 */
function SideRows({ base, ctx }: { base: 'padding' | 'margin'; ctx: RowCtx }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const props = SIDES.map((s) => `${base}-${s}`)
  const nums = props.map((p) => numericValue(p, ctx.values))
  const allEqual = nums[0] !== null && nums.every((v) => v === nums[0])
  const meta = STYLE_PROP_META[props[0]]

  const previewAll = (v: number): void => {
    for (const p of props) ctx.preview(p, toCssText(p, v))
  }
  const commitAll = async (v: number): Promise<void> => {
    // Sequential: four longhand writes into the same file/class list must not race.
    for (const p of props) await ctx.commit(p, toCssText(p, v))
  }

  if (allEqual && !open) {
    return (
      <div className="stylepanel__sides flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="stylepanel__expand-sides size-5 shrink-0 text-muted-foreground"
          onClick={() => setOpen(true)}
          aria-label={`Edit ${base} sides separately`}
          title="Edit sides separately"
        >
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </Button>
        <div className="min-w-0 flex-1">
          <ScrubInput
            label={base}
            value={nums[0] as number}
            min={meta.min ?? 0}
            max={meta.max ?? 400}
            step={meta.step ?? 1}
            unit={meta.unit}
            disabled={ctx.disabled}
            onScrub={previewAll}
            onInput={previewAll}
            onCommit={(v) => void commitAll(v)}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="stylepanel__sides flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="stylepanel__collapse-sides size-5 shrink-0 text-muted-foreground"
          onClick={() => setOpen(false)}
          disabled={!allEqual}
          aria-label={`Link ${base} sides`}
          title={allEqual ? 'Link sides' : 'Sides differ — scrub them equal to relink'}
        >
          <ChevronDown className="size-3.5" aria-hidden="true" />
        </Button>
        <span className="select-none text-[12px] text-muted-foreground">{base}</span>
      </div>
      <div className="flex flex-col gap-1 pl-3">
        {props.map((p, i) =>
          nums[i] === null ? (
            <ReadoutRow key={p} label={p} value={ctx.values[p] ?? '—'} />
          ) : (
            <ScrubInput
              key={p}
              label={p}
              value={nums[i] as number}
              min={meta.min ?? 0}
              max={meta.max ?? 400}
              step={meta.step ?? 1}
              unit={meta.unit}
              disabled={ctx.disabled}
              onScrub={(v) => ctx.preview(p, toCssText(p, v))}
              onInput={(v) => ctx.preview(p, toCssText(p, v))}
              onCommit={(v) => void ctx.commit(p, toCssText(p, v))}
            />
          )
        )}
      </div>
    </div>
  )
}

function ColorRow({
  prop,
  ctx,
  onNeedsAgent
}: {
  prop: string
  ctx: RowCtx
  onNeedsAgent: () => void
}): React.JSX.Element {
  return (
    <div className="stylepanel__row grid min-h-7 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2">
      <span
        className="stylepanel__name select-none overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-muted-foreground"
        title={prop}
      >
        {prop}
      </span>
      <ColorControl
        value={ctx.values[prop] ?? ''}
        disabled={ctx.disabled}
        onChange={(c) => ctx.preview(prop, c)}
        onCommit={(c) => void ctx.commit(prop, c)}
        onNeedsAgent={onNeedsAgent}
      />
    </div>
  )
}

/**
 * transition-property picker. A NATIVE select on purpose: the island
 * WebContentsView is sized to hug the card (PanelApp reports its rect), so a
 * portal dropdown (radix Select) would be clipped at the view edge — the OS
 * popup of a native select isn't. Options are REAL css values from
 * STYLE_PROP_META (they feed the commit path verbatim); optionLabels prettify
 * the unwieldy ones. A computed value outside the set (e.g. 'none', a custom
 * list) shows as a disabled leading option until the user picks one of ours.
 */
function TransitionPropertyRow({ ctx }: { ctx: RowCtx }): React.JSX.Element {
  const meta = STYLE_PROP_META['transition-property']
  const options = meta.options ?? []
  const labels = meta.optionLabels ?? {}
  const current = ctx.values['transition-property'] ?? ''
  const known = options.includes(current)
  return (
    <div className="stylepanel__row grid min-h-7 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2">
      <span
        className="stylepanel__name select-none overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-muted-foreground"
        title="transition-property"
      >
        transition-property
      </span>
      <select
        className="stylepanel__select select h-7 w-[128px] justify-self-end rounded-md border bg-transparent px-1.5 text-xs"
        value={current}
        disabled={ctx.disabled}
        onChange={(e) => void ctx.commit('transition-property', e.target.value)}
      >
        {!known && (
          <option value={current} disabled>
            {current || '—'}
          </option>
        )}
        {options.map((o) => (
          <option key={o} value={o}>
            {labels[o] ?? o}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Read-only value row (mono-ish readout; used for timing + non-numeric text). */
function ReadoutRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="stylepanel__row stylepanel__row--readonly grid min-h-7 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2">
      <span
        className="stylepanel__name select-none overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-muted-foreground"
        title={label}
      >
        {label}
      </span>
      <span
        className="stylepanel__readout max-w-[128px] justify-self-end overflow-hidden text-ellipsis whitespace-nowrap text-xs text-muted-foreground/80"
        title={value}
      >
        {value}
      </span>
    </div>
  )
}

/** Read-only chip row (font-family / display). */
function ChipRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="stylepanel__row stylepanel__row--chip grid min-h-7 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2">
      <span
        className="stylepanel__name select-none overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-muted-foreground"
        title={label}
      >
        {label}
      </span>
      <Badge
        variant="secondary"
        className="stylepanel__chip max-w-[128px] justify-self-end font-normal"
        title={value}
      >
        <span className="truncate">{value}</span>
      </Badge>
    </div>
  )
}
