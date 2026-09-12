import { type ReactNode, useEffect, useRef, useState } from 'react'
import { StartupVisibility } from '../startup-visibility'
import StartupCat from './StartupCat'

const DURATION = 4000
const clamp = (value: number): number => Math.max(0, Math.min(1, value))

/** Keep native preview creation behind the intro so it cannot cover the animation. */
export default function StartupIntro({ children }: { children: ReactNode }): React.JSX.Element {
  const [phase, setPhase] = useState<'reveal' | 'fade' | 'done'>('reveal')
  const stage = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = stage.current
    if (!root || phase !== 'reveal') return
    // A renderer reload can leave the previous native view alive in main.
    // PreviewPane will restore its bounds after the intro mounts the app.
    window.api.preview.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reduced.matches) {
      setPhase('done')
      return
    }
    const pixels = [...root.querySelectorAll<SVGRectElement>('.pixel')]
    const soften = root.querySelector('feGaussianBlur')
    // Preserve the supplied animation's single-layer threshold reveal and timings.
    const animations = pixels.map((pixel, i) => {
      const start = Math.min(i * 0.018, 0.24)
      const end = Math.min(0.68 + i * 0.012, 0.96)
      const frames = Array.from({ length: 101 }, (_, n) => {
        const progress = n / 100
        const local = clamp((progress - start) / (end - start))
        const radius = 16 * (1 + (i % 3) * 0.2083) * (1 - local)
        return { offset: progress, opacity: local, filter: `blur(${radius}px)` }
      })
      const animation = pixel.animate(frames, {
        duration: DURATION,
        fill: 'both',
        easing: 'linear'
      })
      animation.pause()
      animation.currentTime = 0
      return animation
    })
    let frame = 0
    const started = performance.now() + 250
    const tick = (now: number): void => {
      const progress = clamp((now - started) / DURATION)
      soften?.setAttribute('stdDeviation', String(0.36 * (1 - clamp((progress - 0.8) / 0.2))))
      for (const animation of animations) animation.currentTime = progress * DURATION
      if (progress < 1) frame = requestAnimationFrame(tick)
      else {
        // Retain the final sharp cat when the reveal animations are cleaned up.
        for (const pixel of pixels) {
          pixel.style.opacity = '1'
          pixel.style.filter = 'none'
        }
        setPhase('fade')
      }
    }
    frame = requestAnimationFrame(tick)
    const skip = (): void => {
      if (reduced.matches) setPhase('done')
    }
    reduced.addEventListener('change', skip)
    return () => {
      cancelAnimationFrame(frame)
      for (const animation of animations) animation.cancel()
      reduced.removeEventListener('change', skip)
    }
  }, [phase])

  useEffect(() => {
    if (phase !== 'fade') return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const skip = (): void => {
      if (reduced.matches) setPhase('done')
    }
    skip()
    reduced.addEventListener('change', skip)
    const timer = setTimeout(() => setPhase('done'), 500)
    return () => {
      clearTimeout(timer)
      reduced.removeEventListener('change', skip)
    }
  }, [phase])

  return (
    <StartupVisibility.Provider value={phase === 'done'}>
      <style>{`
        @keyframes startup-ui-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes startup-cat-out { from { opacity: 1 } to { opacity: 0 } }
      `}</style>
      {phase !== 'reveal' && (
        <div
          data-startup-ui
          className="h-full"
          style={
            phase === 'fade'
              ? { animation: 'startup-ui-in 500ms ease-in-out both', pointerEvents: 'none' }
              : undefined
          }
        >
          {children}
        </div>
      )}
      {phase !== 'done' && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#fafafa]"
          style={
            phase === 'fade' ? { animation: 'startup-cat-out 500ms ease-in-out both' } : undefined
          }
          data-startup-intro
          data-phase={phase}
          role="status"
          aria-label="Starting Praxis"
        >
          <div
            ref={stage}
            aria-hidden="true"
            className="w-[min(400px,80vmin)] [&_svg]:block [&_svg]:h-auto [&_svg]:w-full"
          >
            <StartupCat />
          </div>
        </div>
      )}
    </StartupVisibility.Provider>
  )
}
