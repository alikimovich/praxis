import { useEffect, useMemo, useRef, useState } from 'react'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import { ExternalLink } from 'lucide-react'
import type { SourceView } from '../../../shared/api'
import { useSession } from '../store'
import { Button } from '@/components/ui/button'

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('css', css)

/** hljs grammar for a file, by extension (null → plain escaped text). */
function langFor(file: string): string | null {
  const ext = file.slice(file.lastIndexOf('.') + 1).toLowerCase()
  if (ext === 'ts' || ext === 'tsx') return 'typescript'
  if (ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs') return 'javascript'
  if (ext === 'svelte' || ext === 'vue' || ext === 'html') return 'xml'
  if (ext === 'css') return 'css'
  return null
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Fixed row height in px — the gutter, the element-highlight bar, and the
// scroll-to-line math all assume it, so it's set explicitly on every column.
const LINE_H = 18

/**
 * Read-only code peek for the selected element (v2): the stamped source file,
 * syntax-highlighted, auto-scrolled to the stamp line with the element's line
 * span marked — plus an "open in editor" jump. Highlighting reuses the existing
 * .hljs-* theme in styles.css (the same classes the chat's markdown emits).
 */
export default function CodePeek({ source }: { source: string }): React.JSX.Element {
  const root = useSession((s) => s.projectRoot)
  const [view, setView] = useState<SourceView | null>(null)
  const [failed, setFailed] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let stale = false
    setView(null)
    setFailed(false)
    setOpenError(null)
    if (!root) {
      setFailed(true)
      return undefined
    }
    window.api.source.read(root, source).then((v) => {
      if (stale) return
      if (v) setView(v)
      else setFailed(true)
    })
    return () => {
      stale = true
    }
  }, [root, source])

  // Once loaded, park the stamp line about a third of the way down the viewport.
  useEffect(() => {
    const el = scrollRef.current
    if (!view || !el) return
    el.scrollTop = Math.max(0, (view.line - 1) * LINE_H - el.clientHeight / 3)
  }, [view])

  const html = useMemo(() => {
    if (!view) return ''
    const lang = langFor(view.file)
    if (lang) {
      try {
        return hljs.highlight(view.code, { language: lang, ignoreIllegals: true }).value
      } catch {
        /* fall through to plain text */
      }
    }
    return escapeHtml(view.code)
  }, [view])

  const openEditor = async (): Promise<void> => {
    if (!root) return
    setOpenError(null)
    const res = await window.api.source.openInEditor(root, source)
    if (!res.ok) setOpenError(res.error ?? 'Could not open an editor.')
  }

  if (failed) {
    return (
      <div className="codepeek codepeek--failed rounded-md border bg-background px-2 py-1.5 text-[11.5px] italic text-muted-foreground">
        Couldn’t read the source file.
      </div>
    )
  }
  if (!view) {
    return (
      <div className="codepeek rounded-md border bg-background px-2 py-1.5 text-[11.5px] text-muted-foreground">
        Reading source…
      </div>
    )
  }

  const lineCount = view.code.replace(/\n$/, '').split('\n').length
  const start = view.elementStart ?? view.line
  const end = Math.max(view.elementEnd ?? start, start)

  return (
    <div className="codepeek flex min-h-0 flex-col gap-1" data-stamp-line={view.line}>
      <div className="codepeek__head flex items-center gap-1.5">
        <span className="codepeek__file min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] text-muted-foreground">
          {view.file}:{view.line}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="codepeek__open h-5 gap-1 px-1.5 text-[11px] text-muted-foreground"
          onClick={() => void openEditor()}
          title="Open this file in your code editor"
        >
          <ExternalLink className="size-3" />
          Editor
        </Button>
      </div>
      {openError && (
        <div className="codepeek__error text-[11px] text-amber-700">{openError}</div>
      )}
      <div
        ref={scrollRef}
        className="codepeek__scroll max-h-60 overflow-auto rounded-md border bg-background"
      >
        <div
          className="relative flex min-w-max font-mono text-[11px]"
          style={{ lineHeight: `${LINE_H}px` }}
        >
          {/* The element's line span, drawn behind the text. */}
          <div
            className="codepeek__mark pointer-events-none absolute inset-x-0 z-0 border-l-2 border-blue-500 bg-blue-500/10"
            style={{ top: (start - 1) * LINE_H, height: (end - start + 1) * LINE_H }}
          />
          <div className="codepeek__gutter sticky left-0 z-20 select-none whitespace-pre border-r bg-muted px-1.5 py-0 text-right text-muted-foreground">
            {Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')}
          </div>
          <pre className="codepeek__code relative z-10 m-0 whitespace-pre bg-transparent px-2 py-0">
            <code dangerouslySetInnerHTML={{ __html: html }} />
          </pre>
        </div>
      </div>
    </div>
  )
}
