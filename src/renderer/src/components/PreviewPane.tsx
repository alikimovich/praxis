import { useEffect, useRef } from 'react'

/**
 * Hosts the native WebContentsView preview. We don't render the preview in the
 * DOM — instead this element reserves space and continuously reports its
 * rectangle to the main process, which positions the native view on top. A
 * ResizeObserver + window resize keeps the native view glued to this slot.
 */
export default function PreviewPane(): React.JSX.Element {
  const slotRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = slotRef.current
    if (!el) return

    const report = (): void => {
      const r = el.getBoundingClientRect()
      window.api.preview.setBounds({ x: r.x, y: r.y, width: r.width, height: r.height })
    }

    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    window.addEventListener('resize', report)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', report)
    }
  }, [])

  return <div ref={slotRef} className="preview-slot" />
}
