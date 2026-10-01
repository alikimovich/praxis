/**
 * A chat island gesture's temporary box-shadow (LKM-140).
 *
 * While someone drags a Shadow island, Bun shows each frame here instead of writing the
 * source, so the dev server runs no HMR update mid-gesture. The override is an inline
 * `!important` box-shadow on the elements that showed the island's derived value when the
 * gesture began; it lives in this isolated world only, so a navigation drops it.
 *
 * It is removed only by `settle`, once every target's own style (the override taken away)
 * computes to the written value: the HMR update with the final value has applied. The check
 * and the removal run in one task, so no frame is painted in between and a CSS swap that
 * drops the old rule before the new one applies never shows.
 */
const PROP = 'box-shadow'
const MAX_TARGETS = 64
interface Target { el: HTMLElement; original: string; priority: string; shown: string | null }
interface Override { targets: Target[]; css: string }
const overrides = new Map<string, Override>()

export type IslandOverrideMessage =
  | { op: 'apply'; key: string; from: string; css: string }
  | { op: 'settle'; key: string; css: string }
  | { op: 'clear'; key: string }

/** A computed box-shadow without fully transparent empty layers (Tailwind's ring slots). */
export function shadowLayers(value: string): string {
  const layers: string[] = []
  let depth = 0, start = 0
  for (let i = 0; i <= value.length; i++) {
    const c = value[i]
    if (c === '(') depth++
    else if (c === ')') depth--
    else if ((c === ',' && depth === 0) || i === value.length) { layers.push(value.slice(start, i).trim()); start = i + 1 }
  }
  return layers.filter(layer => !/^rgba\(0, 0, 0, 0\)( 0px){2,4}$/.test(layer)).join(', ')
}

/** The computed form of `css`, so authored and computed shadows compare. */
function computed(css: string): string {
  const probe = document.createElement('div')
  probe.style.setProperty('display', 'none')
  probe.style.setProperty(PROP, css)
  document.documentElement.append(probe)
  const value = getComputedStyle(probe).boxShadow
  probe.remove()
  return shadowLayers(value)
}

/** The elements that show `from` now: the island's bound elements. */
function discover(from: string): Target[] {
  const expected = computed(from)
  if (!expected || expected === 'none' || !document.body) return []
  const found: Target[] = []
  for (const el of [document.body, ...document.body.querySelectorAll('*')]) {
    if (!(el instanceof HTMLElement)) continue
    const shown = shadowLayers(getComputedStyle(el).boxShadow)
    if (shown !== expected) continue
    found.push({ el, original: el.style.getPropertyValue(PROP), priority: el.style.getPropertyPriority(PROP), shown: null })
    if (found.length >= MAX_TARGETS) break
  }
  return found
}

/** The page (a React render, HMR) may rewrite the inline value we took over. */
function owned(target: Target): boolean {
  const style = target.el.style
  return target.shown !== null && style.getPropertyValue(PROP) === target.shown && style.getPropertyPriority(PROP) === 'important'
}

/** A box-shadow transition would make the computed value lag; the check needs the end value. */
function settledShadow(el: HTMLElement): string {
  getComputedStyle(el).boxShadow
  for (const animation of el.getAnimations?.() ?? [])
    if (animation instanceof CSSTransition && animation.transitionProperty === PROP) animation.cancel()
  return shadowLayers(getComputedStyle(el).boxShadow)
}

function show(target: Target, css: string) {
  const style = target.el.style
  if (target.shown !== null && !owned(target)) {
    target.original = style.getPropertyValue(PROP)
    target.priority = style.getPropertyPriority(PROP)
  }
  style.setProperty(PROP, css, 'important')
  target.shown = style.getPropertyValue(PROP)
}

function restore(target: Target) {
  if (!owned(target)) return
  const style = target.el.style
  if (target.original) style.setProperty(PROP, target.original, target.priority)
  else style.removeProperty(PROP)
  target.shown = null
}

function apply(key: string, from: string, css: string): number {
  let override = overrides.get(key)
  if (override) override.targets = override.targets.filter(t => t.el.isConnected)
  // HMR may have replaced every node; the new ones show the source value again.
  if (!override?.targets.length) {
    const targets = discover(from)
    if (!targets.length) { overrides.delete(key); return 0 }
    override = { targets, css }
    overrides.set(key, override)
  }
  override.css = css
  for (const target of override.targets) show(target, css)
  return override.targets.length
}

/** True when some connected element already shows `css` without an override. */
function pageShows(css: string): boolean {
  const expected = computed(css)
  if (!expected || expected === 'none' || !document.body) return false
  for (const el of [document.body, ...document.body.querySelectorAll('*')]) {
    if (!(el instanceof HTMLElement)) continue
    if (settledShadow(el) === expected) return true
  }
  return false
}

/** Remove the override once the page's own style shows `css`; true when nothing is held. */
function settle(key: string, css: string): boolean {
  const override = overrides.get(key)
  if (!override) return true
  if (override.css !== css) return false
  const expected = computed(css)
  if (!expected || expected === 'none') return false
  override.targets = override.targets.filter(t => t.el.isConnected)
  if (!override.targets.length) {
    if (!pageShows(css)) return false
    overrides.delete(key)
    return true
  }
  for (const target of override.targets) {
    if (!owned(target)) show(target, css)
    const withOverride = settledShadow(target.el)
    restore(target)
    const own = settledShadow(target.el)
    show(target, css)
    settledShadow(target.el)
    if (withOverride !== expected || own !== expected) return false
  }
  for (const target of override.targets) restore(target)
  overrides.delete(key)
  return true
}

function clear(key: string): boolean {
  for (const target of overrides.get(key)?.targets ?? []) if (target.el.isConnected) restore(target)
  overrides.delete(key)
  return true
}

const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max

/** One validated message from Bun; the answer goes back on the reply channel. */
export function islandOverride(message: unknown): number | boolean | null {
  const m = message as Partial<Record<'op' | 'key' | 'from' | 'css', unknown>> | null
  if (!m || !text(m.key, 200)) return null
  if (m.op === 'clear') return clear(m.key)
  if (!text(m.css, 8192) || /[<>{};]/.test(m.css)) return null
  if (m.op === 'settle') return settle(m.key, m.css)
  if (m.op === 'apply' && text(m.from, 8192) && !/[<>{};]/.test(m.from)) return apply(m.key, m.from, m.css)
  return null
}
