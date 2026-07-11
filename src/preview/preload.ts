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
const TOOLBAR_ACTION = 'dsgn:preview:toolbar-action' // preload → renderer (code/delete)
const CLEAR_SELECTED = 'dsgn:preview:clear-selected' // renderer → preload (pill ×, send)
const SET_STATUS = 'dsgn:preview:set-status' // main → preload (launch progress pill)
const TOGGLE_SELECT = 'dsgn:preview:toggle-select' // preload → renderer (S pressed in preview)

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

// Inline-comment state. `commentMode` is the armed whole-page mode (C/Y).
// `commenting` is the element the OPEN inline input is frozen onto (the click
// froze it); `inputKind` is what that open input submits as (null while the pill
// shows its icon row). `inputFromMode` marks an input opened by a whole-page C/Y
// click with no prior pick — Escape then hides the pill entirely instead of
// collapsing back to icons.
let commentMode: CommentMode = null
let commenting: Element | null = null
let inputKind: CommentMode = null
let inputFromMode = false

// Selection toolbar — ONE dark pill anchored to the picked element that morphs in
// place between an icon row (State A) and an inline comment/annotate input
// (State B), Figma-Make-style. These are its interactive parts + the width-morph
// timer.
let toolbarEl: HTMLDivElement | null = null
let selectedEl: Element | null = null
let inputWrapEl: HTMLDivElement | null = null
let inputEl: HTMLTextAreaElement | null = null
let submitEl: HTMLButtonElement | null = null
// Trailing actions hidden while the inline input is open (props/delete + the
// divider that isolates delete): commenting doesn't need destructive/prop UI.
let separatorEl: HTMLDivElement | null = null
let hintEl: HTMLDivElement | null = null
let widthTimer: ReturnType<typeof setTimeout> | null = null

// Launch-status pill (bottom center) — dev-server progress while a project
// starts, shown INSIDE the preview instead of a window-top banner.
let statusEl: HTMLDivElement | null = null

function setStatusPill(text: string | null): void {
  if (!text) {
    statusEl?.remove()
    statusEl = null
    return
  }
  if (!statusEl) {
    const el = document.createElement('div')
    el.setAttribute('data-dsgn-status', '')
    el.style.cssText =
      'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:2147483646;' +
      'max-width:82%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
      'pointer-events:none;font:500 11.5px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;' +
      'color:#555;background:rgba(255,255,255,0.92);border:1px solid rgba(0,0,0,0.08);' +
      'border-radius:999px;padding:4px 12px;box-shadow:0 2px 10px rgba(0,0,0,0.08);'
    document.documentElement.appendChild(el)
    statusEl = el
  }
  statusEl.textContent = text
}

// Persistent selection highlight — outlines that STAY while the mouse hovers
// other elements (the hover box is separate). When the picked element resolves
// to a source stamp, every element with the same stamp is outlined too (a
// component rendered in a loop), with an "h3 × 4" count badge on the pick.
let selLayer: HTMLDivElement | null = null
let selEls: Element[] = []

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

  // Persistent selection outlines (behind the hover box + composer).
  const sel = document.createElement('div')
  sel.style.cssText = 'position:fixed;inset:0;pointer-events:none;'

  // Whole-page mode hint chip (top-center) while C/Y is armed.
  const hint = document.createElement('div')
  hint.style.cssText =
    'position:fixed;pointer-events:none;font:600 11px/1.4 system-ui,sans-serif;color:#fff;' +
    'background:#111;opacity:0.82;padding:3px 8px;border-radius:5px;white-space:nowrap;display:none;'

  // The single morphing pill — element-scoped actions anchored to the picked
  // element. It's the only interactive part of the overlay (pointer-events:auto),
  // so a hostile page can't reach it and our own clicks on it are ignored via
  // isOverlay(). One DOM node hosts BOTH visual states: an icon row (State A) and
  // an inline comment/annotate input (State B); enterInputState/collapseInput
  // morph between them in place.
  const toolbar = document.createElement('div')
  toolbar.setAttribute('data-dsgn-toolbar', '')
  toolbar.style.cssText =
    'position:fixed;pointer-events:auto;display:none;box-sizing:border-box;align-items:center;gap:2px;' +
    'padding:4px;background:#1f1f1f;border:1px solid rgba(255,255,255,0.08);border-radius:10px;' +
    'box-shadow:0 6px 24px rgba(0,0,0,0.35);z-index:2;transition:width 160ms ease;'

  // ::placeholder can't be set via inline cssText — style it (and hide the
  // textarea's scrollbar) from a <style> scoped inside the shadow root.
  const style = document.createElement('style')
  style.textContent =
    '[data-dsgn-toolbar] textarea::placeholder{color:#8a8a8a}' +
    '[data-dsgn-toolbar] textarea{scrollbar-width:none}' +
    '[data-dsgn-toolbar] textarea::-webkit-scrollbar{display:none}' +
    // Squircle the injected overlay UI's rounded corners (toolbar pill, icon
    // buttons, badges) to match the app — matches styles.css's global rule.
    ':host *{corner-shape:squircle}'

  // Keep pill mouse events from bubbling out to the previewed page. Bubble phase
  // (not capture) so a button's own click handler still fires first; the overlay's
  // window-level capture handlers already ignore overlay targets.
  const swallow = (e: Event): void => e.stopPropagation()
  toolbar.addEventListener('mousedown', swallow)
  toolbar.addEventListener('click', swallow)

  const ICONS: Record<string, { title: string; svg: string }> = {
    edit: {
      title: 'Edit text in place',
      svg: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>'
    },
    props: {
      title: 'Edit props',
      svg: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>'
    },
    comment: {
      title: 'Comment on this element — runs a parallel agent',
      svg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'
    },
    annotate: {
      title: 'Pin a note on this element, no agent',
      svg: '<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11l5-5V5a2 2 0 0 0-2-2Z"/><path d="M15 21v-4a2 2 0 0 1 2-2h4"/>'
    },
    code: {
      title: 'Show the source in the editor',
      svg: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'
    },
    delete: {
      title: 'Ask dsgn to delete this element',
      svg: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'
    }
  }
  // 26×26 icon button. comment/annotate are leading mode-toggles (track a pressed
  // bg via data-pressed); props/code/delete are trailing action icons.
  const makeIcon = (kind: keyof typeof ICONS): HTMLButtonElement => {
    const b = document.createElement('button')
    b.type = 'button'
    b.dataset.kind = kind
    b.title = ICONS[kind].title
    b.setAttribute('aria-label', kind)
    b.style.cssText =
      'flex:0 0 auto;width:26px;height:26px;border:none;border-radius:7px;background:transparent;' +
      'display:flex;align-items:center;justify-content:center;cursor:pointer;color:#d4d4d4;'
    b.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[kind].svg}</svg>`
    b.addEventListener('mouseenter', () => {
      b.style.background = b.dataset.pressed === '1' ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)'
    })
    b.addEventListener('mouseleave', () => {
      b.style.background = b.dataset.pressed === '1' ? 'rgba(255,255,255,0.16)' : 'transparent'
    })
    b.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      onToolbarButton(kind)
    })
    return b
  }

  const commentBtn = makeIcon('comment')
  const annotateBtn = makeIcon('annotate')

  // Inline input group (State B) — hidden in the icon row, faded/grown in on morph.
  const inputWrap = document.createElement('div')
  inputWrap.style.cssText =
    'display:none;align-items:center;gap:4px;flex:0 0 auto;opacity:0;transition:opacity 120ms ease;'
  const input = document.createElement('textarea')
  input.rows = 1
  // Single line sits at the icon-button height (26px) so State B doesn't grow
  // taller than State A: 18px line + 4px top + 4px bottom = 26px. It still grows
  // (up to max-height) when the user types multiple lines.
  input.style.cssText =
    'box-sizing:border-box;border:none;outline:none;resize:none;background:transparent;color:#eee;' +
    'font:400 13px/18px system-ui,-apple-system,Segoe UI,sans-serif;width:260px;max-width:60vw;' +
    'max-height:66px;padding:4px 6px;'
  const send = document.createElement('button')
  send.type = 'button'
  send.setAttribute('aria-label', 'Submit')
  send.textContent = '↑'
  send.style.cssText =
    'flex:0 0 auto;width:26px;height:26px;border:none;border-radius:50%;cursor:pointer;' +
    'background:#2563eb;color:#fff;font:600 15px/1 system-ui;display:flex;' +
    'align-items:center;justify-content:center;'
  input.addEventListener('keydown', onInputKey, true)
  input.addEventListener('input', autoGrow)
  send.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    submitInput()
  })
  inputWrap.append(input, send)

  // Thin separator isolating the destructive Delete from the rest of the actions.
  const separator = document.createElement('div')
  separator.style.cssText =
    'flex:0 0 auto;width:1px;height:16px;background:rgba(255,255,255,0.10);margin:0 2px;'

  const editBtn = makeIcon('edit')
  const propsBtn = makeIcon('props')
  const codeBtn = makeIcon('code')
  const deleteBtn = makeIcon('delete')

  // DOM order: comment, annotate, [input], edit, props, code | delete. The divider
  // sits before Delete only; the button[data-kind] order the tests assert stays
  // comment, annotate, edit, props, code, delete (the separator has no data-kind).
  // `edit` only renders for plain-text stamped leaves (setEditAction) — the
  // discoverable form of the double-click-to-edit gesture.
  toolbar.append(commentBtn, annotateBtn, inputWrap, editBtn, propsBtn, codeBtn, separator, deleteBtn)

  shadow.append(sel, box, label, pins, hint, toolbar, style)
  document.documentElement.appendChild(host)
  overlayHost = host
  overlayBox = box
  overlayLabel = label
  pinsLayer = pins
  selLayer = sel
  hintEl = hint
  toolbarEl = toolbar
  inputWrapEl = inputWrap
  inputEl = input
  submitEl = send
  separatorEl = separator
}

/** Show/hide the props + delete actions (and delete's divider). Hidden while the
 *  inline comment/annotate input is open — those actions don't apply there. */
function setTrailingActions(show: boolean): void {
  const disp = show ? 'flex' : 'none'
  toolbarEl?.querySelector<HTMLButtonElement>('[data-kind="props"]')?.style.setProperty('display', disp)
  toolbarEl?.querySelector<HTMLButtonElement>('[data-kind="delete"]')?.style.setProperty('display', disp)
  if (separatorEl) separatorEl.style.display = show ? 'block' : 'none'
  // Edit re-derives from the current selection's editability when shown.
  if (show) setEditAction()
  else toolbarEl?.querySelector<HTMLButtonElement>('[data-kind="edit"]')?.style.setProperty('display', 'none')
}

// Void/replaced elements have no editable text child even with 0 children.
const NON_TEXT_TAGS = new Set([
  'input', 'textarea', 'select', 'img', 'br', 'hr', 'svg', 'canvas', 'video',
  'iframe', 'audio', 'embed', 'object', 'picture', 'source'
])

/**
 * True when an element can be edited in place: a directly-stamped element whose
 * only content is plain text (no child elements) — so its `data-dsgn-source`
 * maps to exactly this element's text child. Matches the onDblClick guard so the
 * toolbar's Edit button and the double-click gesture agree on "when it's possible".
 */
function isTextEditable(el: Element): el is HTMLElement {
  return (
    el instanceof HTMLElement &&
    el.childElementCount === 0 &&
    el.hasAttribute('data-dsgn-source') &&
    !NON_TEXT_TAGS.has(el.tagName.toLowerCase())
  )
}

/** Reveal the Edit-text action only for the current selection when it's a
 *  plain-text stamped leaf; hide it otherwise. */
function setEditAction(): void {
  const b = toolbarEl?.querySelector<HTMLButtonElement>('[data-kind="edit"]')
  if (!b) return
  b.style.display = selectedEl && isTextEditable(selectedEl) ? 'flex' : 'none'
}

/**
 * Outline the picked element persistently. Stamped elements highlight every
 * sibling with the same data-dsgn-source (the same component/loop instance
 * set), Figma-style; the badge on the pick reads "h3 × 4" then.
 */
function setSelectionHighlight(el: Element | null): void {
  ensureOverlay()
  if (!selLayer) return
  selLayer.textContent = ''
  selEls = []
  if (!el) return
  const src = findSource(el)
  let els: Element[] = [el]
  if (src) {
    try {
      // The stamp may live on el itself or an ancestor; the stamped elements ARE
      // the component instances — outline those (all of them).
      const same = Array.from(document.querySelectorAll(`[data-dsgn-source="${CSS.escape(src)}"]`))
      if (same.length) els = same
    } catch {
      /* malformed stamp for a selector — outline just the pick */
    }
  }
  selEls = els
  for (let i = 0; i < els.length; i++) {
    const b = document.createElement('div')
    b.setAttribute('data-dsgn-selbox', '')
    // Thinner than the 2px hover box — selected-but-not-hovered reads calmer.
    b.style.cssText =
      'position:fixed;pointer-events:none;box-sizing:border-box;display:none;' +
      'border:1px solid #2563eb;border-radius:3px;'
    selLayer.appendChild(b)
  }
  const badge = document.createElement('div')
  badge.setAttribute('data-dsgn-selbadge', '')
  badge.style.cssText =
    'position:fixed;pointer-events:none;display:none;font:600 11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;' +
    'color:#fff;background:#2563eb;padding:2px 6px;border-radius:4px;white-space:nowrap;' +
    'transform:translateY(-100%);'
  const tag = (els[0] ?? el).tagName.toLowerCase()
  badge.textContent = els.length > 1 ? `${tag} × ${els.length}` : shortLabel(el)
  selLayer.appendChild(badge)
  positionSelection()
}

/** Track the selection outlines to their elements' current rects. */
function positionSelection(): void {
  if (!selLayer || !selEls.length) return
  const nodes = selLayer.children
  let anchor: DOMRect | null = null
  selEls.forEach((e, i) => {
    const b = nodes[i] as HTMLElement | undefined
    if (!b) return
    if (!e.isConnected) {
      b.style.display = 'none'
      return
    }
    const r = e.getBoundingClientRect()
    if (!anchor) anchor = r
    b.style.display = 'block'
    b.style.left = `${r.left}px`
    b.style.top = `${r.top}px`
    b.style.width = `${r.width}px`
    b.style.height = `${r.height}px`
  })
  const badge = nodes[selEls.length] as HTMLElement | undefined
  if (badge) {
    if (anchor) {
      const a = anchor as DOMRect
      badge.style.display = 'block'
      badge.style.left = `${a.left}px`
      badge.style.top = `${Math.max(a.top - 2, 12)}px`
    } else {
      badge.style.display = 'none'
    }
  }
}

/** Anchor the toolbar just under the selected element (above if no room). */
function positionToolbar(): void {
  if (!toolbarEl || !selectedEl) return
  const r = selectedEl.getBoundingClientRect()
  const w = toolbarEl.offsetWidth || 128
  const h = toolbarEl.offsetHeight || 36
  const left = Math.min(Math.max(r.left, 8), Math.max(window.innerWidth - w - 8, 8))
  let top = r.bottom + 8
  if (top + h > window.innerHeight - 8) top = r.top - h - 8
  toolbarEl.style.left = `${left}px`
  toolbarEl.style.top = `${Math.max(top, 8)}px`
}

function showToolbar(el: Element): void {
  ensureOverlay()
  if (!toolbarEl) return
  selectedEl = el
  // The code action needs a source stamp to open a file — hide it otherwise.
  const codeBtn = toolbarEl.querySelector<HTMLButtonElement>('[data-kind="code"]')
  if (codeBtn) codeBtn.style.display = findSource(el) ? 'flex' : 'none'
  // Edit-text only applies to plain-text stamped leaves.
  setEditAction()
  toolbarEl.style.display = 'flex'
  positionToolbar()
}

function hideToolbar(): void {
  resetInput()
  if (toolbarEl) toolbarEl.style.display = 'none'
}

// Dot nodes are built once per pin (on SET_PINS) and only repositioned on
// scroll/resize/tick — no per-frame teardown or listener churn.
const pinDots = new Map<string, { selector: string; dot: HTMLDivElement }>()

/** Rebuild the pin nodes from the current annotation list. */
function buildPins(): void {
  // Don't materialize the overlay host just to hold an empty pins layer. An idle
  // preview (no annotations, select/comment off) must leave the previewed app's
  // DOM untouched — otherwise a stray, empty `data-dsgn-overlay` div is injected
  // into every page on load, which shows up when inspecting the app.
  if (!annotationPins.length) {
    pinDots.clear()
    if (pinsLayer) pinsLayer.textContent = ''
    return
  }
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
    // The frozen (input-open) element was swapped out (HMR) — tear the pill down.
    hideToolbar()
    selectedEl = null
    setSelectionHighlight(null)
    setCommentMode(null)
  }
  // The selected element was swapped out (HMR) — the toolbar has nothing to
  // anchor to anymore. (Selection outlines self-hide per-box in
  // positionSelection, since loop siblings can re-render independently.)
  if (selectedEl && !selectedEl.isConnected) {
    selectedEl = null
    hideToolbar()
  }
  if (editing || commenting) return // frozen while editing / composing
  if (!active && !commentMode) return
  const el = e.target as Element | null
  if (!el || isOverlay(el)) {
    // Over our own UI (toolbar, composer, pins): drop the hover highlight —
    // leaving the last-crossed element lit under the toolbar reads as if IT
    // were selected. The persistent selection outlines are a separate layer.
    hideOverlay()
    return
  }
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
    // A fresh pick resets element-scoped surfaces: clear any open input from the
    // previous selection, then show the toolbar (State A) + persistent outlines.
    resetInput()
    showToolbar(el)
    setSelectionHighlight(el)
  } else if (commentMode) {
    e.preventDefault()
    e.stopPropagation()
    // Whole-page C/Y flow: anchor the pill to this element and morph straight to
    // the inline input (no prior pick — Escape hides the pill entirely).
    showToolbar(el)
    enterInputState(commentMode, el, true)
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
  if (!el || isOverlay(el) || !isTextEditable(el)) return
  e.preventDefault()
  e.stopPropagation()
  startTextEdit(el)
}

/** Enter the inline contentEditable edit on a plain-text stamped leaf. Shared by
 *  the double-click gesture and the toolbar's Edit-text button. */
function startTextEdit(el: HTMLElement): void {
  if (editing) return
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
  const t = inputEl
  if (!t) return
  t.style.height = 'auto'
  t.style.height = `${Math.min(t.scrollHeight, 66)}px`
}

/** Paint the comment/annotate toggles to reflect the open input's kind. */
function paintToggles(): void {
  if (!toolbarEl) return
  for (const k of ['comment', 'annotate'] as const) {
    const b = toolbarEl.querySelector<HTMLButtonElement>(`[data-kind="${k}"]`)
    if (!b) continue
    const on = inputKind === k
    b.dataset.pressed = on ? '1' : '0'
    b.style.background = on ? 'rgba(255,255,255,0.16)' : 'transparent'
    b.style.color = on ? '#fff' : '#d4d4d4'
  }
}

/**
 * Morph the pill's width around a content change: measure the old width, mutate,
 * measure the new (auto) width, then transition between them and clear to auto on
 * transitionend (with a timeout fallback if it never fires). Reposition throughout
 * so the viewport clamping in positionToolbar() stays correct.
 */
function animatePill(mutate: () => void): void {
  const pill = toolbarEl
  if (!pill) {
    mutate()
    return
  }
  const from = pill.offsetWidth
  mutate()
  pill.style.width = 'auto'
  const to = pill.offsetWidth
  if (from === to) {
    pill.style.width = ''
    positionToolbar()
    return
  }
  pill.style.width = `${from}px`
  void pill.offsetWidth // force reflow so the next assignment transitions
  pill.style.width = `${to}px`
  positionToolbar()
  if (widthTimer) clearTimeout(widthTimer)
  const finish = (): void => {
    if (widthTimer) {
      clearTimeout(widthTimer)
      widthTimer = null
    }
    pill.style.width = ''
    positionToolbar()
    pill.removeEventListener('transitionend', onEnd)
  }
  const onEnd = (e: TransitionEvent): void => {
    if (e.propertyName === 'width') finish()
  }
  pill.addEventListener('transitionend', onEnd)
  widthTimer = setTimeout(finish, 260)
}

/** Instantly clear input state back to the icon row (no animation). */
function resetInput(): void {
  commenting = null
  inputKind = null
  inputFromMode = false
  if (toolbarEl) toolbarEl.removeAttribute('data-dsgn-composer')
  if (inputEl) inputEl.value = ''
  if (inputWrapEl) {
    inputWrapEl.style.opacity = '0'
    inputWrapEl.style.display = 'none'
  }
  setTrailingActions(true)
  paintToggles()
}

/** Morph the pill into State B — inline comment/annotate input for `el`. */
function enterInputState(kind: CommentMode, el: Element, fromMode: boolean): void {
  ensureOverlay()
  if (!toolbarEl || !inputWrapEl || !inputEl || !submitEl) return
  selectedEl = el
  commenting = el
  inputKind = kind
  inputFromMode = fromMode
  drawOverlay(el)
  if (hintEl) hintEl.style.display = 'none'
  inputEl.value = ''
  inputEl.placeholder = kind === 'annotate' ? 'Add a note…' : 'Ask for changes…'
  submitEl.style.background = kind === 'annotate' ? '#f59e0b' : '#2563eb'
  toolbarEl.setAttribute('data-dsgn-composer', '')
  setTrailingActions(false)
  paintToggles()
  animatePill(() => {
    inputWrapEl!.style.display = 'flex'
    requestAnimationFrame(() => {
      if (inputWrapEl) inputWrapEl.style.opacity = '1'
    })
  })
  autoGrow()
  inputEl.focus()
}

/** Swap the open input's kind (the other toggle was clicked) without collapsing. */
function switchInputKind(kind: CommentMode): void {
  if (!inputEl || !submitEl) return
  inputKind = kind
  inputEl.placeholder = kind === 'annotate' ? 'Add a note…' : 'Ask for changes…'
  submitEl.style.background = kind === 'annotate' ? '#f59e0b' : '#2563eb'
  paintToggles()
  inputEl.focus()
}

/** Morph the pill back to State A (icon row), keeping the selection + toolbar. */
function collapseInput(): void {
  if (!inputKind) return
  animatePill(() => resetInput())
}

/** Leading toggles open/switch/collapse the input; trailing icons relay an action. */
function onToolbarButton(kind: string): void {
  const el = selectedEl
  if (!el) return
  if (kind === 'comment' || kind === 'annotate') {
    if (inputKind === kind) collapseInput()
    else if (inputKind) switchInputKind(kind)
    else enterInputState(kind, el, false)
  } else if (kind === 'edit') {
    // Same in-place edit as double-click, but discoverable from the toolbar.
    if (isTextEditable(el)) startTextEdit(el)
  } else {
    ipcRenderer.send(TOOLBAR_ACTION, kind)
  }
}

function submitInput(): void {
  const text = (inputEl?.value ?? '').replace(/\s+/g, ' ').trim()
  const el = commenting
  const kind = inputKind
  if (el && kind && text) {
    ipcRenderer.send(COMMENT, { kind, el: describe(el), text: text.slice(0, 2000) })
  }
  collapseInput()
  setCommentMode(null) // one comment per arming, like Figma
}

function onInputKey(e: KeyboardEvent): void {
  e.stopPropagation()
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    submitInput()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    if (inputFromMode) {
      // Opened via a whole-page C/Y click with no prior pick — hide the pill.
      hideToolbar()
      selectedEl = null
      setSelectionHighlight(null)
      setCommentMode(null)
    } else {
      collapseInput()
    }
  }
}

function showModeHint(): void {
  if (!hintEl) return
  if (!commentMode) {
    hintEl.style.display = 'none'
    return
  }
  hintEl.textContent =
    commentMode === 'annotate'
      ? 'Annotate: click an element to pin a note'
      : 'Comment: click an element to ask the agent'
  hintEl.style.display = 'block'
  hintEl.style.left = '50%'
  hintEl.style.top = '12px'
  hintEl.style.transform = 'translateX(-50%)'
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
  resetInput()
  commentMode = next
  if (commentMode) {
    ensureOverlay()
    // Arming a whole-page mode supersedes the element-scoped toolbar (the
    // renderer clears its selection too).
    hideToolbar()
    setSelectionHighlight(null)
    selectedEl = null
    document.documentElement.style.cursor = 'crosshair'
    showModeHint()
  } else {
    if (!active) document.documentElement.style.cursor = ''
    hideOverlay()
    if (hintEl) hintEl.style.display = 'none'
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
  } else if (e.key === 's' || e.key === 'S') {
    // S must work with the preview focused too. The renderer owns the toggle
    // (store + web/simulator routing) — relay instead of flipping locally.
    e.preventDefault()
    ipcRenderer.send(TOGGLE_SELECT)
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
    hideToolbar()
    setSelectionHighlight(null)
    selectedEl = null
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

let frameStyle: HTMLStyleElement | null = null

function setFrame(on: boolean): void {
  // Phones don't show persistent scrollbars — hide them inside the bezel (the
  // desktop-style bar drew right over the frame's edge otherwise).
  if (on && !frameStyle) {
    frameStyle = document.createElement('style')
    frameStyle.setAttribute('data-dsgn-frame-style', '')
    frameStyle.textContent =
      '::-webkit-scrollbar{display:none !important;width:0 !important;height:0 !important}' +
      'html,body{scrollbar-width:none !important}'
    document.documentElement.appendChild(frameStyle)
  } else if (!on && frameStyle) {
    frameStyle.remove()
    frameStyle = null
  }
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

// Capture-phase so we see events before the page and can suppress the click.
if (!IS_SIM_BRIDGE) {
  window.addEventListener('mousemove', onMove, true)
window.addEventListener('click', onClick, true)
window.addEventListener('dblclick', onDblClick, true)
window.addEventListener('keydown', onKey, true)
window.addEventListener('scroll', () => {
  if (commenting) {
    drawOverlay(commenting) // keep the highlight tracking the frozen el
  } else if (active || commentMode) {
    hideOverlay()
  }
  if (selectedEl) positionToolbar() // the pill tracks the selection in both states
  if (selEls.length) positionSelection()
  if (pinDots.size) positionPins()
}, true)
window.addEventListener('resize', () => {
  if (commenting) drawOverlay(commenting)
  if (selectedEl) positionToolbar()
  if (selEls.length) positionSelection()
  if (pinDots.size) positionPins()
  positionFrame()
})
// Cursor left the preview entirely (relatedTarget null) — drop the HOVER
// highlight so it doesn't stick to the last element; the persistent selection
// outlines are a separate layer and stay.
window.addEventListener(
  'mouseout',
  (e: MouseEvent) => {
    if (e.relatedTarget || commenting) return
    hideOverlay()
  },
  true
)
// Pins track layout changes (hot-reload, async content) on a light cadence.
const pinTimer = setInterval(() => {
  if (pinDots.size) positionPins()
  // Selection outlines track layout changes (async content, HMR) the same way.
  if (selEls.length) positionSelection()
}, 600)
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
  // The renderer cleared the selection (pill ×, message sent, delete) — drop the
  // element-scoped toolbar + persistent outlines with it.
  ipcRenderer.on(CLEAR_SELECTED, () => {
    selectedEl = null
    hideToolbar()
    setSelectionHighlight(null)
  })
  ipcRenderer.on(SET_STATUS, (_e, text: string | null) => setStatusPill(text))
}
