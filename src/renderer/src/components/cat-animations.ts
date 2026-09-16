/// <reference types="vite/client" />
interface Animation {
  frames: { file: string; durationMs: number }[]
}

// Keep the supplied frame order and timing; only active animations enter the bundle.
const metadata = import.meta.glob<Animation>(
  '../assets/cat/selected/{idle,think,jump}/animation.json',
  {
    eager: true,
    import: 'default'
  }
)
const sprites = import.meta.glob<string>('../assets/cat/selected/{idle,think,jump}/*.svg', {
  eager: true,
  query: '?url',
  import: 'default'
})
export function catFrames(name: 'idle' | 'think' | 'jump'): { src: string; duration: number }[] {
  const base = `../assets/cat/selected/${name}/`
  return metadata[`${base}animation.json`].frames.map((frame) => ({
    src: sprites[base + frame.file],
    duration: frame.durationMs
  }))
}
