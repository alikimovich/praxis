import { useEffect, useRef, useState } from 'react'

/**
 * The preview URL, Figma-style: the full URL is shown, and everything after the
 * origin (path/query/hash) is editable in place — Enter navigates the preview,
 * Escape reverts. Tracks the preview's real location (link clicks, SPA routes)
 * via preview:url-changed.
 */
export default function PreviewUrl({
  base,
  onNavigate
}: {
  /** The dev server's base URL (origin) for the running project. */
  base: string
  onNavigate: (url: string) => void
}): React.JSX.Element {
  let origin = base
  try {
    origin = new URL(base).origin
  } catch {
    /* keep the raw base — worst case the whole thing is static text */
  }
  const [path, setPath] = useState('/')
  const inputRef = useRef<HTMLInputElement>(null)
  // While the input is focused the user owns the text — navigation events from
  // the preview must not stomp a half-typed path.
  const editingRef = useRef(false)

  useEffect(() => {
    return window.api.preview.onUrlChanged((url) => {
      if (editingRef.current) return
      try {
        const u = new URL(url)
        if (u.origin === origin) setPath(u.pathname + u.search + u.hash)
      } catch {
        /* ignore unparsable URLs */
      }
    })
  }, [origin])

  // A project switch changes the base — reset to its root.
  useEffect(() => setPath('/'), [origin])

  const commit = (): void => {
    const raw = (inputRef.current?.value ?? '').trim()
    const next = raw.startsWith('/') ? raw : `/${raw}`
    setPath(next)
    onNavigate(origin + next)
  }

  return (
    <span className="previewbar__url previewbar__url--editable">
      <span className="previewbar__origin">{origin}</span>
      <input
        ref={inputRef}
        className="previewbar__path"
        value={path}
        aria-label="Preview path"
        spellCheck={false}
        onChange={(e) => setPath(e.target.value)}
        onFocus={() => (editingRef.current = true)}
        onBlur={() => (editingRef.current = false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
            inputRef.current?.blur()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            inputRef.current?.blur()
          }
        }}
      />
    </span>
  )
}
