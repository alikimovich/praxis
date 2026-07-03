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
import { FRAME_DATA_URI, FRAME_INSET } from '../shared/iphone-frame'

// Channels (preview ⇄ main). Kept local — main mirrors these strings.
const SET_MODE = 'dsgn:preview:set-select-mode'
const PICKED = 'dsgn:preview:element-picked'
const CANCELLED = 'dsgn:preview:select-cancelled'
const SET_PINS = 'dsgn:preview:set-annotations'
const PIN_CLICK = 'dsgn:preview:pin-click'
const READINESS = 'dsgn:preview:readiness'
const TEXT_EDIT = 'dsgn:preview:text-edit'
// Figma-style inline commenting: comment-to-agent (C) and annotation (Y).
const SET_COMMENT_MODE = 'dsgn:preview:set-comment-mode' // renderer → preload
const COMMENT_MODE = 'dsgn:preview:comment-mode' // preload → renderer (keyboard-initiated)
const COMMENT = 'dsgn:preview:comment' // preload → renderer (submitted)
const SET_FRAME = 'dsgn:preview:set-frame' // renderer → preload (mobile bezel overlay)
const SET_CORNERS = 'dsgn:preview:set-corners' // main → preload (bottom corner masks)

type CommentMode = 'comment' | 'annotate' | null

// The simulator preview loads dsgn's own sim-bridge page (an MJPEG <img> of the
// booted device), flagged with `?dsgnSim=1`. There's no previewed-app DOM there
// to highlight/stamp/inspect, so the entire web overlay below is skipped. The
// query param (not a page global) is the signal because the preload runs in an
// isolated world and can't see the page's `window`, but `location` is shared.
// Phase 2/3 add the simulator-specific overlay separately.
const IS_SIM_BRIDGE =
  typeof location !== 'undefined' && /[?&]dsgnSim=1\b/.test(location.search)

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

// Inline-comment state. `commentMode` is the armed mode (C/Y); `commenting` is the
// element a composer is currently anchored to (the click froze it).
let commentMode: CommentMode = null
let commenting: Element | null = null
let composerEl: HTMLDivElement | null = null
let composerInput: HTMLTextAreaElement | null = null
let composerHint: HTMLDivElement | null = null

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

  // Inline composer — a floating pill anchored to the clicked element. It's the
  // only interactive part of the overlay (pointer-events:auto), so a hostile page
  // can't reach it and our own clicks on it are ignored via isOverlay().
  const composer = document.createElement('div')
  composer.setAttribute('data-dsgn-composer', '')
  composer.style.cssText =
    'position:fixed;pointer-events:auto;display:none;align-items:flex-end;gap:6px;' +
    'box-sizing:border-box;width:300px;max-width:80vw;padding:8px 8px 8px 14px;' +
    'background:#fff;border-radius:22px;box-shadow:0 6px 24px rgba(0,0,0,0.16);' +
    'font:400 14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;' +
    'z-index:1;border:1px solid rgba(0,0,0,0.06);'

  const input = document.createElement('textarea')
  input.rows = 1
  input.style.cssText =
    'flex:1;border:none;outline:none;resize:none;background:transparent;color:#111;' +
    'font:inherit;max-height:120px;padding:5px 0;'

  const send = document.createElement('button')
  send.type = 'button'
  send.setAttribute('aria-label', 'Submit')
  send.textContent = '↑'
  send.style.cssText =
    'flex:0 0 auto;width:28px;height:28px;border:none;border-radius:50%;cursor:pointer;' +
    'background:#2563eb;color:#fff;font:600 15px/1 system-ui;display:flex;' +
    'align-items:center;justify-content:center;'

  const hint = document.createElement('div')
  hint.style.cssText =
    'position:fixed;pointer-events:none;font:600 11px/1.4 system-ui,sans-serif;color:#fff;' +
    'background:#111;opacity:0.82;padding:3px 8px;border-radius:5px;white-space:nowrap;display:none;'

  // Keep composer mouse events from bubbling out to the previewed page. Bubble
  // phase (not capture) so the send button's own click handler still fires first;
  // the overlay's window-level capture handlers already ignore overlay targets.
  const swallow = (e: Event): void => e.stopPropagation()
  composer.addEventListener('mousedown', swallow)
  composer.addEventListener('click', swallow)
  input.addEventListener('keydown', onComposerKey, true)
  input.addEventListener('input', autoGrow)
  send.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    submitComposer()
  })
  composer.append(input, send)

  shadow.append(box, label, pins, composer, hint)
  document.documentElement.appendChild(host)
  overlayHost = host
  overlayBox = box
  overlayLabel = label
  pinsLayer = pins
  composerEl = composer
  composerInput = input
  composerHint = hint
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

/**
 * The nearest COMPONENT-instance call site (v8 F3a): `data-dsgn-component-source`,
 * which the stamp plugin forwards through `{...props}` so the authored
 * `<Component …/>` wins over the innermost host's `data-dsgn-source`. Walk up the
 * same way so a click on a deep child still resolves to its owning instance.
 */
function findComponentSource(el: Element): string | null {
  let node: Element | null = el
  while (node) {
    const stamp = node.getAttribute('data-dsgn-component-source')
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
    componentSource: (findComponentSource(el) ?? '').slice(0, 256) || null,
    text: rawText ? rawText.slice(0, 120) : null,
    rect: { x: r.x, y: r.y, width: r.width, height: r.height },
    styles
  }
}

function onMove(e: MouseEvent): void {
  // Self-heal: if the frozen node was swapped out (HMR) without a blur, clear it
  // so a mode isn't stranded anchored to a detached element.
  if (editing && !editing.isConnected) endEdit()
  if (commenting && !commenting.isConnected) {
    closeComposer()
    setCommentMode(null)
  }
  if (editing || commenting) return // frozen while editing / composing
  if (!active && !commentMode) return
  const el = e.target as Element | null
  if (!el || isOverlay(el)) return
  drawOverlay(el)
}

function onClick(e: MouseEvent): void {
  if (editing) return
  // Only genuine user input acts — a hostile page can dispatch synthetic clicks
  // while a mode is armed; isTrusted is false for those.
  if (!e.isTrusted) return
  const el = e.target as Element | null
  if (!el || isOverlay(el)) return
  if (active) {
    // Swallow the click so the previewed app doesn't also act on it.
    e.preventDefault()
    e.stopPropagation()
    ipcRenderer.send(PICKED, describe(el))
  } else if (commentMode) {
    e.preventDefault()
    e.stopPropagation()
    openComposer(el) // freeze this element and anchor the composer to it
  }
}

// ---- Inline text editing: double-click a stamped, text-only element ---------
let editing: HTMLElement | null = null
let editOriginal = ''

function onDblClick(e: MouseEvent): void {
  if (!active || editing || !e.isTrusted) return
  const el = e.target as HTMLElement | null
  // Only a directly-stamped element with plain text (no child elements) — so the
  // source maps to exactly this element's text child.
  if (!el || isOverlay(el) || el.childElementCount > 0 || !el.hasAttribute('data-dsgn-source')) {
    return
  }
  e.preventDefault()
  e.stopPropagation()
  editing = el
  editOriginal = el.textContent ?? ''
  hideOverlay()
  el.setAttribute('contenteditable', 'plaintext-only')
  el.style.outline = '2px solid #2563eb'
  el.focus()
  const range = document.createRange()
  range.selectNodeContents(el)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
  el.addEventListener('blur', commitEdit, { once: true })
  el.addEventListener('keydown', onEditKey, true)
}

function endEdit(): HTMLElement | null {
  const el = editing
  if (!el) return null
  el.removeEventListener('keydown', onEditKey, true)
  el.removeAttribute('contenteditable')
  el.style.outline = ''
  editing = null
  return el
}

function commitEdit(): void {
  const el = endEdit()
  if (!el) return
  const text = el.textContent ?? ''
  const source = el.getAttribute('data-dsgn-source')
  if (source && text.trim() !== editOriginal.trim()) {
    ipcRenderer.send(TEXT_EDIT, { source: source.slice(0, 256), text: text.slice(0, 2000) })
  }
}

function onEditKey(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    ;(editing as HTMLElement | null)?.blur() // triggers commitEdit (once)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    const el = endEdit()
    if (el) {
      el.textContent = editOriginal // restore
      el.blur()
    }
  }
}

// ---- Inline commenting: C → comment-to-agent, Y → annotation ----------------

function autoGrow(): void {
  const t = composerInput
  if (!t) return
  t.style.height = 'auto'
  t.style.height = `${Math.min(t.scrollHeight, 120)}px`
}

/** Anchor the composer just above the frozen element (clamped to the viewport). */
function positionComposer(): void {
  if (!composerEl || !commenting) return
  const r = commenting.getBoundingClientRect()
  const w = composerEl.offsetWidth || 300
  const h = composerEl.offsetHeight || 44
  const left = Math.min(Math.max(r.left, 8), window.innerWidth - w - 8)
  let top = r.top - h - 8
  if (top < 8) top = Math.min(r.bottom + 8, window.innerHeight - h - 8)
  composerEl.style.left = `${left}px`
  composerEl.style.top = `${Math.max(top, 8)}px`
}

function openComposer(el: Element): void {
  ensureOverlay()
  if (!composerEl || !composerInput) return
  commenting = el
  drawOverlay(el)
  if (composerHint) composerHint.style.display = 'none'
  composerInput.value = ''
  composerInput.placeholder = commentMode === 'annotate' ? 'Add a note…' : 'Add a comment…'
  const send = composerEl.querySelector('button')
  if (send) send.style.background = commentMode === 'annotate' ? '#f59e0b' : '#2563eb'
  composerEl.style.display = 'flex'
  positionComposer()
  autoGrow()
  composerInput.focus()
}

function closeComposer(): void {
  commenting = null
  if (composerEl) composerEl.style.display = 'none'
  if (composerInput) composerInput.value = ''
}

function submitComposer(): void {
  const text = (composerInput?.value ?? '').replace(/\s+/g, ' ').trim()
  const el = commenting
  const kind = commentMode
  if (el && kind && text) {
    ipcRenderer.send(COMMENT, { kind, el: describe(el), text: text.slice(0, 2000) })
  }
  closeComposer()
  setCommentMode(null) // one comment per arming, like Figma
}

function onComposerKey(e: KeyboardEvent): void {
  e.stopPropagation()
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    submitComposer()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    closeComposer()
    setCommentMode(null)
  }
}

function showModeHint(): void {
  if (!composerHint) return
  if (!commentMode) {
    composerHint.style.display = 'none'
    return
  }
  composerHint.textContent =
    commentMode === 'annotate'
      ? 'Annotate: click an element to pin a note'
      : 'Comment: click an element to ask the agent'
  composerHint.style.display = 'block'
  composerHint.style.left = '50%'
  composerHint.style.top = '12px'
  composerHint.style.transform = 'translateX(-50%)'
}

/** True for the previewed app's own editable fields — don't hijack their keys. */
function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  if (!el || typeof el.tagName !== 'string') return false
  const tag = el.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable
}

function setCommentMode(next: CommentMode, fromRenderer = false): void {
  if (commentMode === next) return // idempotent — don't disturb an open composer
  // Comment/annotate and select are mutually exclusive.
  if (next && active) {
    setActive(false)
    ipcRenderer.send(CANCELLED) // clear the renderer's select toggle
  }
  closeComposer()
  commentMode = next
  if (commentMode) {
    ensureOverlay()
    document.documentElement.style.cursor = 'crosshair'
    showModeHint()
  } else {
    if (!active) document.documentElement.style.cursor = ''
    hideOverlay()
    if (composerHint) composerHint.style.display = 'none'
  }
  // Echo keyboard/internal changes so the renderer toolbar can mirror them
  // (renderer-initiated changes already know their own state — avoid a loop).
  if (!fromRenderer) ipcRenderer.send(COMMENT_MODE, commentMode)
}

function onKey(e: KeyboardEvent): void {
  if (!e.isTrusted || editing) return
  if (commenting) return // the open composer owns keys (its handler manages them)
  if (e.key === 'Escape') {
    if (active) {
      e.preventDefault()
      setActive(false)
      ipcRenderer.send(CANCELLED)
    } else if (commentMode) {
      e.preventDefault()
      setCommentMode(null)
    }
    return
  }
  if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || isTypingTarget(e.target)) return
  if (e.key === 'c' || e.key === 'C') {
    e.preventDefault()
    setCommentMode(commentMode === 'comment' ? null : 'comment')
  } else if (e.key === 'y' || e.key === 'Y') {
    e.preventDefault()
    setCommentMode(commentMode === 'annotate' ? null : 'annotate')
  }
}

function setActive(next: boolean): void {
  active = next
  if (active) {
    ensureOverlay()
    document.documentElement.style.cursor = 'crosshair'
  } else {
    // Disarming mid-edit (toolbar toggle / project re-open): discard the edit so
    // it can't strand the element or commit against a stale source.
    if (editing) endEdit()
    hideOverlay()
    document.documentElement.style.cursor = ''
  }
}

// ── Mobile bezel overlay ────────────────────────────────────────────────────
// Draw the iPhone frame INSIDE the previewed page so its opaque inner edge masks
// the app's screen corners, sitting visually *over* the content. It's a fixed,
// pointer-events:none image, so every click and element-selection passes straight
// through to the app beneath it. The viewport here equals the native view = the
// frame's screen cutout, so we upscale the frame image and offset it by the
// cutout insets to line the screen hole up with the viewport edges.
let frameHost: HTMLDivElement | null = null

function positionFrame(): void {
  if (!frameHost) return
  const img = frameHost.firstElementChild as HTMLImageElement | null
  if (!img) return
  const wv = window.innerWidth
  const hv = window.innerHeight
  const wf = wv / (1 - (FRAME_INSET.left + FRAME_INSET.right) / 100)
  const hf = hv / (1 - (FRAME_INSET.top + FRAME_INSET.bottom) / 100)
  // !important: the previewed app's own stylesheets apply to these injected
  // elements too — e.g. Tailwind preflight's `img { max-width: 100% }` clamps
  // the upscaled bezel back into the viewport, drawing a second, misaligned
  // phone over the app instead of just the frame's inner edges.
  img.style.setProperty('width', `${wf}px`, 'important')
  img.style.setProperty('height', `${hf}px`, 'important')
  img.style.setProperty('left', `${-(wf * FRAME_INSET.left) / 100}px`, 'important')
  img.style.setProperty('top', `${-(hf * FRAME_INSET.top) / 100}px`, 'important')
}

function setFrame(on: boolean): void {
  if (!on) {
    frameHost?.remove()
    frameHost = null
    return
  }
  if (frameHost) {
    positionFrame()
    return
  }
  const host = document.createElement('div')
  host.setAttribute('data-dsgn-frame', '')
  host.style.cssText =
    'position:fixed !important;inset:0 !important;overflow:hidden !important;' +
    'pointer-events:none !important;z-index:2147483646 !important'
  const img = document.createElement('img')
  img.src = FRAME_DATA_URI
  img.draggable = false
  // max/min-width/height MUST be pinned: a page reset like Tailwind preflight's
  // `img { max-width: 100% }` otherwise clamps the bezel (see positionFrame).
  img.style.cssText =
    'position:absolute !important;pointer-events:none !important;user-select:none;' +
    'max-width:none !important;max-height:none !important;' +
    'min-width:0 !important;min-height:0 !important;' +
    'margin:0 !important;padding:0 !important;border:0 !important;' +
    'transform:none !important;display:block !important'
  host.appendChild(img)
  document.documentElement.appendChild(host)
  frameHost = host
  positionFrame()
}

// ── Bottom corner masks ─────────────────────────────────────────────────────
// The native view sits flush in dsgn's rounded preview card. Electron can only
// round ALL of the view's corners (setBorderRadius is uniform), which would
// notch the top corners under the card's header — so the view stays square and
// these two fixed, click-through overlays fake the bottom rounding instead: a
// quarter-circle cutout over the window-gutter color, sent by main (it knows
// the OS theme). position:fixed keeps them pinned through scrolling.
let cornerHost: HTMLDivElement | null = null

function setCorners(opts: { radius: number; color: string; border: string } | null): void {
  cornerHost?.remove()
  cornerHost = null
  if (!opts || opts.radius <= 0) return
  const { radius, color, border } = opts
  // Room for the card's 1px border ring beyond the arc — without it the card's
  // outline visibly stopped where the corner rounding began.
  const size = radius + 2
  const host = document.createElement('div')
  host.setAttribute('data-dsgn-corners', '')
  host.style.cssText =
    'position:fixed !important;inset:0 !important;pointer-events:none !important;' +
    'z-index:2147483646 !important'
  for (const side of ['left', 'right'] as const) {
    const c = document.createElement('div')
    // The arc is centered on the card's corner circle (radius px in from the
    // side, radius px up from the bottom); stops: the page (transparent) → the
    // card's 1px border ring → the window-gutter fill.
    // !important, like the bezel above — the page's own resets style these too.
    const cx = side === 'left' ? `${radius}px` : `calc(100% - ${radius}px)`
    c.style.cssText =
      `position:fixed !important;bottom:0 !important;${side}:0 !important;` +
      `width:${size}px !important;height:${size}px !important;` +
      `margin:0 !important;padding:0 !important;border:0 !important;` +
      `background:radial-gradient(circle at ${cx} calc(100% - ${radius}px), transparent ${radius - 1}px, ${border} ${radius - 0.25}px ${radius + 0.75}px, ${color} ${radius + 1.25}px) !important;`
    host.appendChild(c)
  }
  document.documentElement.appendChild(host)
  cornerHost = host
}

// Capture-phase so we see events before the page and can suppress the click.
if (!IS_SIM_BRIDGE) {
  window.addEventListener('mousemove', onMove, true)
window.addEventListener('click', onClick, true)
window.addEventListener('dblclick', onDblClick, true)
window.addEventListener('keydown', onKey, true)
window.addEventListener('scroll', () => {
  if (commenting) {
    drawOverlay(commenting) // keep the highlight + composer tracking the frozen el
    positionComposer()
  } else if (active || commentMode) {
    hideOverlay()
  }
  if (pinDots.size) positionPins()
}, true)
window.addEventListener('resize', () => {
  if (commenting) {
    drawOverlay(commenting)
    positionComposer()
  }
  if (pinDots.size) positionPins()
  positionFrame()
})
// Pins track layout changes (hot-reload, async content) on a light cadence.
const pinTimer = setInterval(() => pinDots.size && positionPins(), 600)
window.addEventListener('pagehide', () => {
  clearInterval(pinTimer)
  if (editing) endEdit()
})

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

  ipcRenderer.on(SET_MODE, (_e, next: boolean) => {
    if (next && commentMode) setCommentMode(null) // exclusivity
    setActive(next)
  })
  ipcRenderer.on(SET_COMMENT_MODE, (_e, m: CommentMode) => setCommentMode(m, true))
  ipcRenderer.on(SET_PINS, (_e, pins: { id: string; selector: string }[]) => {
    annotationPins = Array.isArray(pins) ? pins : []
    buildPins()
  })
  ipcRenderer.on(SET_FRAME, (_e, on: boolean) => setFrame(on))
  ipcRenderer.on(SET_CORNERS, (_e, opts: { radius: number; color: string; border: string } | null) =>
    setCorners(opts)
  )
}
