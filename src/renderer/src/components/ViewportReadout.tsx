import { useEffect, useRef } from 'react'
import { createViewportReadout } from '../../../preview/viewport-readout'

/** Visible above the frozen snapshot during divider dragging, and in browser mode. */
export default function ViewportReadout({
  left,
  top,
  width,
  height
}: {
  left: number
  top: number
  width: number
  height: number
}): React.JSX.Element {
  const container = useRef<HTMLDivElement>(null)
  const readout = useRef<ReturnType<typeof createViewportReadout> | null>(null)
  useEffect(() => {
    if (!container.current) return
    readout.current = createViewportReadout(container.current)
    return () => {
      readout.current?.dispose()
      readout.current = null
    }
  }, [])
  useEffect(() => {
    readout.current?.update(width, height)
  }, [width, height])
  return (
    <div
      ref={container}
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        pointerEvents: 'none',
        zIndex: 10
      }}
    />
  )
}
