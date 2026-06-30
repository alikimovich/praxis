import { useEffect, useRef } from 'react'
import { MOBILE_VIEWPORT_WIDTH, useViewport } from '../store'

/**
 * Hosts the native WebContentsView preview. We don't render the preview in the
 * DOM — instead this element reserves space and continuously reports its
 * rectangle to the main process, which positions the native view on top. A
 * ResizeObserver + window resize keeps the native view glued to this slot.
 *
 * Viewport switch: in 'mobile' we report a centered phone-width rect (the slot
 * background shows around it) so the previewed app renders at its mobile breakpoint.
 */
export default function PreviewPane(): React.JSX.Element {
  const slotRef = useRef<HTMLDivElement>(null)
  const viewport = useViewport((s) => s.viewport)

  useEffect(() => {
    const el = slotRef.current
    if (!el) return

    const report = (): void => {
      const r = el.getBoundingClientRect()
      if (viewport === 'mobile') {
        const width = Math.min(MOBILE_VIEWPORT_WIDTH, r.width)
        const x = r.x + (r.width - width) / 2
        window.api.preview.setBounds({ x, y: r.y, width, height: r.height })
      } else {
        window.api.preview.setBounds({ x: r.x, y: r.y, width: r.width, height: r.height })
      }
    }

    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    window.addEventListener('resize', report)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', report)
    }
  }, [viewport])

  return <div ref={slotRef} className={`preview-slot ${viewport === 'mobile' ? 'preview-slot--mobile' : ''}`} />
}
