import { useEffect, useState } from 'react'
import idleUrl from '../assets/cat/idle.svg'
import run1Url from '../assets/cat/run-1.svg'
import run2Url from '../assets/cat/run-2.svg'

/**
 * A pixel-art cat that loafs in the composer's bottom-left corner. While the
 * agent is thinking it flips between the two `run` frames (a little running
 * loader); when idle it settles on the `idle` sprite, waiting for input.
 *
 * The sprites are solid-black SVGs, drawn here as a CSS mask over
 * `currentColor` so the cat picks up the theme's muted foreground and works in
 * both light and dark mode without recoloring the art.
 */
export default function CatLoader({ running }: { running: boolean }): React.JSX.Element {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setFrame((f) => f ^ 1), 130)
    return () => clearInterval(id)
  }, [running])

  const src = running ? (frame === 0 ? run1Url : run2Url) : idleUrl
  return (
    <span
      className="cat-loader"
      data-running={running ? '' : undefined}
      style={{ WebkitMaskImage: `url(${src})`, maskImage: `url(${src})` }}
      role="img"
      aria-label={running ? 'Working…' : 'Idle'}
      title={running ? 'Working…' : undefined}
    />
  )
}
