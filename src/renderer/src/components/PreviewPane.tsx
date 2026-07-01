import { useEffect, useRef, useState } from 'react'
import { useViewport } from '../store'
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
 */
type Rect = { left: number; top: number; width: number; height: number }

export default function PreviewPane(): React.JSX.Element {
  const slotRef = useRef<HTMLDivElement>(null)
  const viewport = useViewport((s) => s.viewport)
  const [bezel, setBezel] = useState<Rect | null>(null)

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
        window.api.preview.setBounds({
          x: bx + (w * FRAME_INSET.left) / 100,
          y: by + (h * FRAME_INSET.top) / 100,
          width: cutW,
          height: h * (1 - (FRAME_INSET.top + FRAME_INSET.bottom) / 100),
          radius: Math.round(cutW * 0.1)
        })
        setBezel({ left: bx - r.x, top: by - r.y, width: w, height: h })
      } else {
        window.api.preview.setBounds({ x: r.x, y: r.y, width: r.width, height: r.height })
        setBezel(null)
      }
    }

    report()
    // Draw the iPhone bezel INSIDE the preview page (over the app, click-through)
    // in mobile; the DOM <img> below only supplies the device body around it.
    window.api.preview.setFrame(viewport === 'mobile')
    const ro = new ResizeObserver(report)
    ro.observe(el)
    window.addEventListener('resize', report)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', report)
    }
  }, [viewport])

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
    </div>
  )
}
