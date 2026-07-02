import { useEffect, useRef, useState } from 'react'
import { usePreviewFreeze, useViewport } from '../store'
import { FRAME_ASPECT, FRAME_INSET, FRAME_DATA_URI } from '../../../shared/iphone-frame'

/**
 * Hosts the native WebContentsView preview. We don't render the preview in the
 * DOM — instead this element reserves space and continuously reports its
 * rectangle to the main process, which positions the native view on top. A
 * ResizeObserver + window resize keeps the native view glued to this slot.
 *
 * Mobile viewport: fit an iPhone bezel (contain) in the slot and report the
 * native view's bounds as the bezel's SCREEN CUTOUT — so the previewed app
 * renders at a phone width, framed by the device. The bezel <img> sits in the
 * DOM (behind the native view); the native view covers the cutout on top, so the
 * opaque frame shows around it.
 *
 * Freeze-frame: while `usePreviewFreeze.frozen` (an overlay like the branch
 * dropdown is open), the live view — which always paints above the DOM — is
 * swapped for a pixel-identical snapshot <img> at the same rect, so the overlay
 * can stack on top of a still-visible preview.
 */
type Rect = { left: number; top: number; width: number; height: number }
type ViewRect = Rect & { radius: number }

/** The card's inner bottom-corner radius (12px outer − 1px border). The native
 *  view itself stays SQUARE (its top must sit flush under the card header —
 *  Electron rounds all corners or none), and in-page masks fake the bottom
 *  rounding at this radius instead. */
export const DESKTOP_CORNER_RADIUS = 11

export default function PreviewPane(): React.JSX.Element {
  const slotRef = useRef<HTMLDivElement>(null)
  const viewport = useViewport((s) => s.viewport)
  const frozen = usePreviewFreeze((s) => s.frozen)
  const [bezel, setBezel] = useState<Rect | null>(null)
  // Where the native view sits, relative to the slot — the freeze <img> matches it.
  const [viewRect, setViewRect] = useState<ViewRect | null>(null)
  const [freezeImg, setFreezeImg] = useState<string | null>(null)

  useEffect(() => {
    const el = slotRef.current
    if (!el) return

    const report = (): void => {
      const r = el.getBoundingClientRect()
      if (viewport === 'mobile') {
        // Fit the bezel within the slot (contain), capped so it's not huge.
        let h = Math.min(r.height - 32, 880)
        let w = h * FRAME_ASPECT
        if (w > r.width - 32) {
          w = r.width - 32
          h = w / FRAME_ASPECT
        }
        const bx = r.x + (r.width - w) / 2
        const by = r.y + (r.height - h) / 2
        // The native view fills the bezel's screen cutout (inset % of the frame),
        // with rounded corners to match the phone's screen so it fits the frame.
        const cutW = w * (1 - (FRAME_INSET.left + FRAME_INSET.right) / 100)
        const cut = {
          x: bx + (w * FRAME_INSET.left) / 100,
          y: by + (h * FRAME_INSET.top) / 100,
          width: cutW,
          height: h * (1 - (FRAME_INSET.top + FRAME_INSET.bottom) / 100),
          radius: Math.round(cutW * 0.1)
        }
        window.api.preview.setBounds(cut)
        setViewRect({
          left: cut.x - r.x,
          top: cut.y - r.y,
          width: cut.width,
          height: cut.height,
          radius: cut.radius
        })
        setBezel({ left: bx - r.x, top: by - r.y, width: w, height: h })
      } else {
        // Flush inside the card body, SQUARE (top corners must not round under
        // the header); in-page masks below fake the bottom corners' rounding.
        window.api.preview.setBounds({ x: r.x, y: r.y, width: r.width, height: r.height })
        setViewRect({ left: 0, top: 0, width: r.width, height: r.height, radius: 0 })
        setBezel(null)
      }
    }

    report()
    // Draw the iPhone bezel INSIDE the preview page (over the app, click-through)
    // in mobile; the DOM <img> below only supplies the device body around it.
    window.api.preview.setFrame(viewport === 'mobile')
    // Desktop: mask the bottom corners in-page (the masks bake into captures too).
    window.api.preview.setCorners(viewport === 'desktop' ? DESKTOP_CORNER_RADIUS : 0)
    const ro = new ResizeObserver(report)
    ro.observe(el)
    window.addEventListener('resize', report)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', report)
      // No slot → no native view. Zero the bounds so closing the last project
      // (or any path that unmounts the panes) can't leave the preview floating
      // over the empty state with stale bounds — visible AND click-eating. On a
      // viewport switch the effect re-runs and report() restores bounds at once.
      window.api.preview.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    }
  }, [viewport])

  // Freeze under overlays: capture FIRST (identical pixels); unfreeze restores
  // the live view and drops the snapshot.
  useEffect(() => {
    if (!frozen) {
      // Show the live view FIRST, and keep the snapshot up briefly — the show
      // lands in the compositor a few frames later, and removing the img in the
      // same tick flashed the card background on every menu close.
      window.api.preview.setDragging(false)
      const t = setTimeout(() => setFreezeImg(null), 120)
      return () => clearTimeout(t)
    }
    let cancelled = false
    void window.api.preview.capture().then((url) => {
      if (cancelled) return
      setFreezeImg(url)
      // No snapshot (e.g. empty view)? Hide anyway — blank beats covering the menu.
      if (!url) {
        window.api.preview.setDragging(true)
        usePreviewFreeze.getState().setReady(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [frozen])

  // Hide the live view only AFTER the snapshot <img> has painted (double rAF
  // past the commit) — hiding in the same tick blanked the preview for a frame,
  // which read as a flicker every time a dropdown opened. `ready` then unblocks
  // the overlay (dropdowns wait for it before opening).
  useEffect(() => {
    if (!frozen || !freezeImg) return
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        window.api.preview.setDragging(true)
        usePreviewFreeze.getState().setReady(true)
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [frozen, freezeImg])

  return (
    <div ref={slotRef} className={`preview-slot ${viewport === 'mobile' ? 'preview-slot--mobile' : ''}`}>
      {bezel && (
        <img
          src={FRAME_DATA_URI}
          alt=""
          draggable={false}
          className="preview-bezel"
          style={{ left: bezel.left, top: bezel.top, width: bezel.width, height: bezel.height }}
        />
      )}
      {frozen && freezeImg && viewRect && (
        <img
          src={freezeImg}
          alt=""
          draggable={false}
          className="preview-freeze"
          style={{
            left: viewRect.left,
            top: viewRect.top,
            width: viewRect.width,
            height: viewRect.height,
            borderRadius: viewRect.radius
          }}
        />
      )}
    </div>
  )
}
