/**
 * Preview preload — injected into the previewed app's native WebContentsView.
 *
 * This is what makes dsgn's differentiator possible: a click-to-select overlay
 * laid over the *real running repo*. When "select mode" is on it highlights the
 * hovered element and, on click, captures that element's identity (tag, a
 * best-effort CSS selector, its `data-dsgn-source` stamp if the repo opts in,
 * and a few key computed styles) and ships it to the main process, which relays
 * it to the chat renderer.
 *
 * Runs sandboxed + contextIsolated, so it only uses `ipcRenderer` (no Node, no
 * contextBridge — it exposes nothing to the page). The overlay lives in a
 * shadow root with `pointer-events:none` so it can never clash with or swallow
 * events from the previewed app.
 */
import { ipcRenderer } from 'electron'
import type { SelectedElement } from '../shared/api'

// Channels (preview ⇄ main). Kept local — main mirrors these strings.
const SET_MODE = 'dsgn:preview:set-select-mode'
const PICKED = 'dsgn:preview:element-picked'
const CANCELLED = 'dsgn:preview:select-cancelled'
const SET_PINS = 'dsgn:preview:set-annotations'
const PIN_CLICK = 'dsgn:preview:pin-click'
const READINESS = 'dsgn:preview:readiness'

/** Computed styles worth surfacing in the inspector (curated, not the whole CSSOM). */
const TRACKED_STYLES = [
  'color',
  'background-color',
  'font-size',
  'font-family',
  'font-weight',
  'line-height',
  'padding',
  'margin',
  'border-radius',
  'display'
] as const

let active = false
let overlayHost: HTMLDivElement | null = null
let overlayBox: HTMLDivElement | null = null
let overlayLabel: HTMLDivElement | null = null
let pinsLayer: HTMLDivElement | null = null
let annotationPins: { id: string; selector: string }[] = []

/** Lazily build the shadow-DOM overlay (highlight box + label chip + pins layer). */
function ensureOverlay(): void {
  if (overlayHost) return
  const host = document.createElement('div')
  host.setAttribute('data-dsgn-overlay', '')
  // Host itself never paints or intercepts; the shadow tree draws the box.
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;'
  const shadow = host.attachShadow({ mode: 'open' })

  const box = document.createElement('div')
  box.style.cssText =
    'position:fixed;pointer-events:none;box-sizing:border-box;' +
    'border:2px solid #2563eb;border-radius:3px;background:rgba(37,99,235,0.08);' +
    'transition:all 60ms ease-out;display:none;'

  const label = document.createElement('div')
  label.style.cssText =
    'position:fixed;pointer-events:none;font:600 11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;' +
    'color:#fff;background:#2563eb;padding:2px 6px;border-radius:4px;white-space:nowrap;' +
    'transform:translateY(-100%);display:none;'

  const pins = document.createElement('div')
  pins.style.cssText = 'position:fixed;inset:0;pointer-events:none;'

  shadow.append(box, label, pins)
  document.documentElement.appendChild(host)
  overlayHost = host
  overlayBox = box
  overlayLabel = label
  pinsLayer = pins
}

// Dot nodes are built once per pin (on SET_PINS) and only repositioned on
// scroll/resize/tick — no per-frame teardown or listener churn.
const pinDots = new Map<string, { selector: string; dot: HTMLDivElement }>()

/** Rebuild the pin nodes from the current annotation list. */
function buildPins(): void {
  ensureOverlay()
  if (!pinsLayer) return
  pinsLayer.textContent = ''
  pinDots.clear()
  annotationPins.forEach((pin, i) => {
    const dot = document.createElement('div')
    dot.style.cssText =
      'position:fixed;pointer-events:auto;cursor:pointer;width:18px;height:18px;' +
      'display:none;align-items:center;justify-content:center;border-radius:50%;' +
      'background:#f59e0b;color:#fff;font:700 10px/1 ui-monospace,Menlo,sans-serif;' +
      'box-shadow:0 1px 3px rgba(0,0,0,0.3);transform:translate(-50%,-50%);'
    dot.textContent = String(i + 1)
    dot.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      ipcRenderer.send(PIN_CLICK, pin.id)
    })
    pinsLayer!.appendChild(dot)
    pinDots.set(pin.id, { selector: pin.selector, dot })
  })
  positionPins()
}

/** Move each existing pin dot to its element's current position (or hide it). */
function positionPins(): void {
  for (const { selector, dot } of pinDots.values()) {
    let el: Element | null = null
    try {
      el = document.querySelector(selector)
    } catch {
      el = null
    }
    if (!el || isOverlay(el)) {
      dot.style.display = 'none'
      continue
    }
    const r = el.getBoundingClientRect()
    dot.style.display = 'flex'
    dot.style.left = `${Math.max(r.right, 10)}px`
    dot.style.top = `${Math.max(r.top, 10)}px`
  }
}

function hideOverlay(): void {
  if (overlayBox) overlayBox.style.display = 'none'
  if (overlayLabel) overlayLabel.style.display = 'none'
}

/** True for our own overlay nodes — never select or highlight the highlighter. */
function isOverlay(el: Element | null): boolean {
  return !!el && !!overlayHost && (el === overlayHost || overlayHost.contains(el))
}

function shortLabel(el: Element): string {
  const id = el.id ? `#${el.id}` : ''
  const cls =
    typeof el.className === 'string' && el.className.trim()
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
      : ''
  return `${el.tagName.toLowerCase()}${id}${cls}`
}

function drawOverlay(el: Element): void {
  ensureOverlay()
  if (!overlayBox || !overlayLabel) return
  const r = el.getBoundingClientRect()
  overlayBox.style.display = 'block'
  overlayBox.style.left = `${r.left}px`
  overlayBox.style.top = `${r.top}px`
  overlayBox.style.width = `${r.width}px`
  overlayBox.style.height = `${r.height}px`
  overlayLabel.style.display = 'block'
  overlayLabel.style.left = `${r.left}px`
  overlayLabel.style.top = `${Math.max(r.top - 2, 12)}px`
  overlayLabel.textContent = shortLabel(el)
}

/** A short, reasonably-stable CSS selector path (id wins; else tag:nth-of-type). */
function cssPath(el: Element): string {
  const parts: string[] = []
  let node: Element | null = el
  while (node && node.nodeType === 1 && parts.length < 5) {
    if (node.id) {
      parts.unshift(`#${CSS.escape(node.id)}`)
      break
    }
    const tag = node.tagName.toLowerCase()
    const parent: Element | null = node.parentElement
    if (!parent) {
      parts.unshift(tag)
      break
    }
    const sameTag = Array.from(parent.children).filter((c) => c.tagName === node!.tagName)
    const part = sameTag.length > 1 ? `${tag}:nth-of-type(${sameTag.indexOf(node) + 1})` : tag
    parts.unshift(part)
    node = parent
  }
  return parts.join(' > ')
}

/**
 * The source stamp the opened repo opts into (see DESIGN.md): a
 * `data-dsgn-source="path/to/File.tsx:line"` attribute. We walk up to the
 * nearest stamped ancestor so a click on a deep text node still resolves to the
 * component that owns it.
 */
function findSource(el: Element): string | null {
  let node: Element | null = el
  while (node) {
    const stamp = node.getAttribute('data-dsgn-source')
    if (stamp) return stamp
    node = node.parentElement
  }
  return null
}

function describe(el: Element): SelectedElement {
  const cs = getComputedStyle(el)
  const styles: Record<string, string> = {}
  for (const prop of TRACKED_STYLES) {
    const v = cs.getPropertyValue(prop)
    if (v) styles[prop] = v.trim()
  }
  const r = el.getBoundingClientRect()
  const rawText = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  const classes =
    typeof el.className === 'string' && el.className.trim()
      ? el.className.trim().split(/\s+/).slice(0, 20)
      : []
  // The previewed page is only semi-trusted; cap every page-controlled field so
  // a pathological/hostile attribute can't bloat the IPC payload, store, or prompt.
  return {
    tag: el.tagName.toLowerCase().slice(0, 50),
    id: (el.id || '').slice(0, 100) || null,
    classes,
    selector: cssPath(el).slice(0, 300),
    source: (findSource(el) ?? '').slice(0, 256) || null,
    text: rawText ? rawText.slice(0, 120) : null,
    rect: { x: r.x, y: r.y, width: r.width, height: r.height },
    styles
  }
}

function onMove(e: MouseEvent): void {
  if (!active) return
  const el = e.target as Element | null
  if (!el || isOverlay(el)) return
  drawOverlay(el)
}

function onClick(e: MouseEvent): void {
  if (!active) return
  // Only genuine user input picks — a hostile page can dispatch synthetic click
  // events while select mode is armed; isTrusted is false for those.
  if (!e.isTrusted) return
  const el = e.target as Element | null
  if (!el || isOverlay(el)) return
  // Swallow the click so the previewed app doesn't also act on it.
  e.preventDefault()
  e.stopPropagation()
  ipcRenderer.send(PICKED, describe(el))
}

function onKey(e: KeyboardEvent): void {
  if (active && e.isTrusted && e.key === 'Escape') {
    e.preventDefault()
    setActive(false)
    ipcRenderer.send(CANCELLED)
  }
}

function setActive(next: boolean): void {
  active = next
  if (active) {
    ensureOverlay()
    document.documentElement.style.cursor = 'crosshair'
  } else {
    hideOverlay()
    document.documentElement.style.cursor = ''
  }
}

// Capture-phase so we see events before the page and can suppress the click.
window.addEventListener('mousemove', onMove, true)
window.addEventListener('click', onClick, true)
window.addEventListener('keydown', onKey, true)
window.addEventListener('scroll', () => {
  if (active) hideOverlay()
  if (pinDots.size) positionPins()
}, true)
window.addEventListener('resize', () => pinDots.size && positionPins())
// Pins track layout changes (hot-reload, async content) on a light cadence.
const pinTimer = setInterval(() => pinDots.size && positionPins(), 600)
window.addEventListener('pagehide', () => clearInterval(pinTimer))

// Report whether the previewed app is "dsgn-ready" — i.e. its elements carry
// data-dsgn-source stamps — so the app can offer to set up an unprepared project.
// Re-sampled a few times so a slow-rendering SPA (stamps appear after `load`)
// isn't falsely flagged; the renderer retracts the offer on any stamps>0 report.
function reportReadiness(): number {
  if (!location.protocol.startsWith('http')) return -1 // skip the placeholder
  const stamps = document.querySelectorAll('[data-dsgn-source]').length
  ipcRenderer.send(READINESS, { stamps })
  return stamps
}
window.addEventListener('load', () => {
  const delays = [600, 1500, 3000]
  const tick = (i: number): void => {
    if (i >= delays.length) return
    setTimeout(() => {
      if (reportReadiness() <= 0) tick(i + 1) // keep checking until stamps appear
    }, delays[i])
  }
  tick(0)
})

ipcRenderer.on(SET_MODE, (_e, next: boolean) => setActive(next))
ipcRenderer.on(SET_PINS, (_e, pins: { id: string; selector: string }[]) => {
  annotationPins = Array.isArray(pins) ? pins : []
  buildPins()
})
