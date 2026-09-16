import { useEffect, useRef, useState } from 'react'
import idleUrl from '../assets/cat/idle.svg'
import run1Url from '../assets/cat/run-1.svg'
import run2Url from '../assets/cat/run-2.svg'
import { catFrames } from './cat-animations'

const animations = {
  rest: [{ src: idleUrl, duration: 0 }],
  run: [
    { src: run1Url, duration: 130 },
    { src: run2Url, duration: 130 }
  ],
  think: catFrames('think'),
  idle: catFrames('idle'),
  jump: catFrames('jump')
}
type Pose = keyof typeof animations

/** Full-canvas SVG masks preserve the supplied art and inherit the theme color. */
export default function CatLoader({
  running,
  small = false,
  questioning = false,
  completion = 0
}: {
  running: boolean
  small?: boolean
  questioning?: boolean
  completion?: number
}): React.JSX.Element {
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = (): void => setReducedMotion(media.matches)
    media.addEventListener('change', update)
    update()
    return () => media.removeEventListener('change', update)
  }, [])
  const lastCompletion = useRef(completion)
  const [sprite, setSprite] = useState<{ pose: Pose; frame: number }>({ pose: 'rest', frame: 0 })

  useEffect(() => {
    const completed = completion !== lastCompletion.current
    lastCompletion.current = completion
    let timer: ReturnType<typeof setTimeout>
    const rest = (): void => {
      setSprite({ pose: 'rest', frame: 0 })
      if (!reducedMotion) timer = setTimeout(() => play('idle'), 15000 + Math.random() * 15000)
    }
    const play = (pose: Pose, frame = 0): void => {
      setSprite({ pose, frame })
      if (reducedMotion) return
      timer = setTimeout(() => {
        if (frame + 1 < animations[pose].length) play(pose, frame + 1)
        else if (pose === 'run' || pose === 'think') play(pose)
        else rest()
      }, animations[pose][frame].duration)
    }
    if (questioning) play('think')
    else if (running) play('run')
    else if (completed && !reducedMotion) play('jump')
    else rest()
    return () => clearTimeout(timer)
  }, [running, questioning, completion, reducedMotion])

  const src = animations[sprite.pose][sprite.frame].src
  const label = questioning
    ? 'Waiting for your answer'
    : running
      ? 'Working…'
      : sprite.pose === 'jump'
        ? 'Task complete'
        : 'Idle'
  return (
    <span
      className="cat-loader"
      data-running={running ? '' : undefined}
      data-animation={sprite.pose}
      data-frame={sprite.frame}
      style={{
        width: small ? 20 : undefined,
        height: small ? 20 : undefined,
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`
      }}
      role="img"
      aria-label={label}
      title={label === 'Idle' ? undefined : label}
    />
  )
}
