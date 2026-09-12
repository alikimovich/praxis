import { type PointerEvent as ReactPointerEvent, useEffect, useRef } from 'react'

/** Capture the divider gesture while the native viewport keeps rendering. */
export function usePreviewResize(setChatWidth: (width: number) => void) {
  const drag = useRef<{ target: HTMLElement; pointerId: number } | null>(null)

  useEffect(() => {
    const end = (): void => {
      const current = drag.current
      if (!current) return
      drag.current = null
      document.body.classList.remove('is-resizing')
      if (current.target.hasPointerCapture(current.pointerId)) {
        current.target.releasePointerCapture(current.pointerId)
      }
    }
    const move = (event: PointerEvent): void => {
      if (event.pointerId !== drag.current?.pointerId) return
      if (event.buttons === 0) {
        end()
        return
      }
      const left = document.querySelector('.pane--chat')?.getBoundingClientRect().left ?? 0
      // Keep the chat usable and leave room for the preview toolbar.
      const max = Math.max(320, Math.min(760, window.innerWidth - 624))
      setChatWidth(Math.min(max, Math.max(320, event.clientX - left)))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    window.addEventListener('lostpointercapture', end)
    window.addEventListener('blur', end)
    document.addEventListener('visibilitychange', end)
    return () => {
      end()
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      window.removeEventListener('lostpointercapture', end)
      window.removeEventListener('blur', end)
      document.removeEventListener('visibilitychange', end)
    }
  }, [setChatWidth])

  return (event: ReactPointerEvent<HTMLElement>): void => {
    if (event.button !== 0 || drag.current) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { target: event.currentTarget, pointerId: event.pointerId }
    document.body.classList.add('is-resizing')
  }
}
