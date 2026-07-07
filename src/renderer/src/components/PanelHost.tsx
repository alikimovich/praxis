import { useEffect, useState } from 'react'
import type { PropInspection, SelectedElement } from '../../../shared/api'
import { usePreviewFreeze } from '../store'

/** Card width (268) + the island's p-3 shadow padding on both sides. */
const VIEW_WIDTH = 268 + 24
const MARGIN = 4

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
  const frozen = usePreviewFreeze((s) => s.frozen)

  useEffect(() => window.api.panel.onHeight((h) => setHeight(Math.max(72, h))), [])

  useEffect(() => {
    window.api.panel.setState({ root, element, inspection, inspecting })
  }, [root, element, inspection, inspecting])

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
      window.api.panel.show({
        x: r.right - VIEW_WIDTH - MARGIN,
        y: r.top + MARGIN,
        width: VIEW_WIDTH,
        height: Math.min(height, Math.max(120, r.height - 2 * MARGIN))
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
