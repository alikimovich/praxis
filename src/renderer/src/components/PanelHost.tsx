import { useEffect, useState } from 'react'
import type { PropInspection, SelectedElement } from '../../../shared/api'
import { usePreviewFreeze } from '../store'

/** Card width + the island's shadow padding (kept in sync with PanelApp). */
const CARD_W = 268
const PAD = { top: 16, right: 24, bottom: 32, left: 24 }
const VIEW_WIDTH = CARD_W + PAD.left + PAD.right
/** Visible gap between the CARD's right edge and the preview's. */
const GAP = 6

/**
 * Bridge for the FLOATING prop panel: renders nothing itself — it drives the
 * native panel WebContentsView (which paints above the preview) from the main
 * renderer. Pushes state, tracks the preview card's rectangle for placement,
 * resizes to the island's reported content height, and hides the island while
 * the preview is frozen (DOM overlay menus must not render under it).
 */
export default function PanelHost({
  root,
  element,
  inspection,
  inspecting
}: {
  root: string
  element: SelectedElement
  inspection: PropInspection | null
  inspecting: boolean
}): null {
  const [height, setHeight] = useState(160)
  const [maxHeight, setMaxHeight] = useState(480)
  const frozen = usePreviewFreeze((s) => s.frozen)

  useEffect(() => window.api.panel.onHeight((h) => setHeight(Math.max(72, h))), [])

  useEffect(() => {
    window.api.panel.setState({ root, element, inspection, inspecting, maxHeight })
  }, [root, element, inspection, inspecting, maxHeight])

  // Place at the top right of the preview card body, tracked live.
  useEffect(() => {
    if (frozen) {
      window.api.panel.hide()
      return
    }
    const body = document.querySelector('.previewcard__body')
    if (!body) return
    const place = (): void => {
      const r = body.getBoundingClientRect()
      // The card may grow to the preview area's height minus its shadow padding.
      setMaxHeight(Math.max(120, Math.round(r.height) - PAD.top - PAD.bottom - GAP))
      // The view sits flush with the body's top (card lands PAD.top below it)
      // and bleeds its right shadow padding over the window gutter — never over
      // the previewbar, whose controls a transparent view would block.
      window.api.panel.show({
        x: r.right - GAP - CARD_W - PAD.left,
        y: r.top,
        width: VIEW_WIDTH,
        height: Math.min(height, Math.max(120, r.height))
      })
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(body)
    window.addEventListener('resize', place)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', place)
    }
  }, [height, frozen])

  // No island without a selection (unmount = hide).
  useEffect(() => () => window.api.panel.hide(), [])
  return null
}
