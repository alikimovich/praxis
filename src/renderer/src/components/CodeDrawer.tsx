import { useEffect, useRef, useState } from 'react'
import { EditorState, StateField, type Extension } from '@codemirror/state'
import { EditorView, Decoration, keymap, type DecorationSet } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { basicSetup } from 'codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { svelte } from '@replit/codemirror-lang-svelte'
import { X, Save, ExternalLink, Maximize2, Minimize2 } from 'lucide-react'
import type { SourceView } from '../../../shared/api'
import { usePanelInset } from '../store'
import { Button } from '@/components/ui/button'

/** Collapsed height of the drawer + the native-preview strip it reserves. */
const DRAWER_H = 300
/** Slice of preview kept visible when the drawer is expanded (so it isn't hidden). */
const MIN_PREVIEW = 160

/** CodeMirror language extension for a file, by extension (empty = plain text). */
function langFor(file: string): Extension[] {
  const ext = file.slice(file.lastIndexOf('.') + 1).toLowerCase()
  if (ext === 'ts' || ext === 'tsx') return [javascript({ typescript: true, jsx: ext === 'tsx' })]
  if (ext === 'jsx') return [javascript({ jsx: true })]
  if (ext === 'js' || ext === 'mjs' || ext === 'cjs') return [javascript()]
  // Svelte needs its own grammar: approximating it with HTML breaks on Svelte
  // expressions — e.g. an {@html `<script …>…<\/script>`} template literal reads
  // as a real, never-closed script tag, and the rest of the file tokenizes as JS.
  if (ext === 'svelte') return [svelte()]
  if (ext === 'vue' || ext === 'html') return [html()]
  if (ext === 'css') return [css()]
  return []
}

// Editor chrome painted from the app's own design tokens (via CSS custom
// properties), so the drawer matches the surrounding surfaces and flips with the
// light/dark theme automatically — no separate CodeMirror dark theme to drift.
const dsgnTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '12px',
    backgroundColor: 'var(--background)',
    color: 'var(--foreground)'
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    lineHeight: '1.6'
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--muted-foreground)',
    border: 'none'
  },
  '.cm-activeLine': { backgroundColor: 'color-mix(in oklab, var(--muted) 55%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--foreground)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--foreground)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'color-mix(in oklab, var(--primary) 22%, transparent)'
  },
  '.cm-selectionMatch': { backgroundColor: 'color-mix(in oklab, var(--primary) 14%, transparent)' }
})

// Syntax palette matched 1:1 to the highlight.js theme in styles.css (the same
// colors the chat's markdown code blocks use), so every code surface in the app
// reads the same. Tags left unmapped fall back to the plain foreground color.
const dsgnHighlight = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: '#8a8a8a', fontStyle: 'italic' },
  {
    tag: [t.keyword, t.moduleKeyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.modifier, t.self],
    color: '#a626a4'
  },
  // Quoted literals only — strings, regexes, and the *values* of HTML attributes.
  { tag: [t.string, t.special(t.string), t.regexp, t.attributeValue], color: '#50a14f' },
  // Attribute names read as their own token (atom-one-light `.hljs-attr`), not
  // fused into the green of the value they precede.
  { tag: [t.attributeName], color: '#986801' },
  { tag: [t.number, t.bool, t.atom, t.null], color: '#b76b01' },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName))],
    color: '#4078f2'
  },
  { tag: [t.typeName, t.className], color: '#c18401' },
  // HTML/JSX/Svelte tag names — the element the user is inspecting (<div>, <h1>).
  // Without this they fall through to the type color and read like a class name.
  { tag: [t.tagName], color: '#e45649' }
])

const stampLine = Decoration.line({ class: 'cm-stamp-line' })

/** Line decorations for the stamped element's [start, end] span (1-based, inclusive). */
function stampDeco(doc: EditorState['doc'], start: number, end: number): DecorationSet {
  const marks = []
  for (let ln = start; ln <= end; ln++) {
    if (ln >= 1 && ln <= doc.lines) marks.push(stampLine.range(doc.line(ln).from))
  }
  return Decoration.set(marks)
}

/**
 * v9 phase 2 — the editable code drawer. CodeMirror 6 mounted under the preview
 * (a DOM panel can't float over the native WebContentsView, so PreviewPane
 * shrinks the native view's height by the drawer height via usePanelInset and the
 * drawer fills the freed strip). The whole file is loaded, scrolled to the stamped
 * element with its line span highlighted; Cmd+S saves through source.write →
 * commitEdit, so undo/redo, on-disk conflict detection, and HMR all come for free.
 * An expand toggle grows the drawer (leaving a MIN_PREVIEW strip of live preview),
 * and "open in editor" jumps to the file in the user's own editor.
 */
export default function CodeDrawer({
  root,
  source,
  onClose
}: {
  root: string
  source: string
  onClose: () => void
}): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  // The file content as last read from / written to disk — the save baseline and
  // the dirty comparison. A ref so the save keybinding always sees the latest.
  const baselineRef = useRef<string>('')
  const [meta, setMeta] = useState<{ file: string; line: number } | null>(null)
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'conflict' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  // Height of the drawer's positioning container (.previewcard__body), tracked so
  // "expand" can fill it while leaving a MIN_PREVIEW strip of native preview above.
  const [containerH, setContainerH] = useState(0)

  useEffect(() => {
    const el = rootRef.current?.offsetParent as HTMLElement | null
    if (!el) return undefined
    const update = (): void => setContainerH(el.clientHeight)
    update()
    let ro: ResizeObserver | undefined
    try {
      ro = new ResizeObserver(update)
      ro.observe(el)
    } catch {
      /* no ResizeObserver (tests) — the one-shot read above still applies */
    }
    return () => ro?.disconnect()
  }, [])

  const height = expanded && containerH > 0 ? Math.max(DRAWER_H, containerH - MIN_PREVIEW) : DRAWER_H

  // Reserve the bottom strip of the native preview for as long as the drawer is
  // open, tracking the current (expanded/collapsed) height.
  useEffect(() => {
    usePanelInset.getState().setBottom(height)
    return () => usePanelInset.getState().setBottom(0)
  }, [height])

  // A ref-indirected save so the CodeMirror keymap (built once) always runs the
  // current closure.
  const saveRef = useRef<() => void>(() => {})
  const save = async (): Promise<void> => {
    const view = viewRef.current
    if (!view) return
    const content = view.state.doc.toString()
    if (content === baselineRef.current) return
    setStatus('saving')
    setErrorMsg(null)
    const res = await window.api.source.write(root, source, baselineRef.current, content)
    if (res.ok) {
      baselineRef.current = content
      setDirty(false)
      setStatus('idle')
    } else if (res.conflict) {
      setStatus('conflict')
    } else {
      setStatus('error')
      setErrorMsg(res.error ?? 'Could not save.')
    }
  }
  saveRef.current = () => void save()

  const openEditor = async (): Promise<void> => {
    setOpenError(null)
    const res = await window.api.source.openInEditor(root, source)
    if (!res.ok) setOpenError(res.error ?? 'Could not open an editor.')
  }

  // Build the editor once the file is read. Re-runs when the selected source
  // changes (picking a different element while the drawer is open).
  useEffect(() => {
    let disposed = false
    setMeta(null)
    setDirty(false)
    setStatus('idle')
    setErrorMsg(null)
    setOpenError(null)
    viewRef.current?.destroy()
    viewRef.current = null

    window.api.source.read(root, source).then((view: SourceView | null) => {
      if (disposed || !hostRef.current) return
      if (!view) {
        setStatus('error')
        setErrorMsg('Could not read the source file.')
        return
      }
      baselineRef.current = view.code
      setMeta({ file: view.file, line: view.line })

      const start = view.elementStart ?? view.line
      const end = Math.max(view.elementEnd ?? start, start)
      const stampField = StateField.define<DecorationSet>({
        create: (state) => stampDeco(state.doc, start, end),
        update: (deco, tr) => (tr.docChanged ? deco.map(tr.changes) : deco),
        provide: (f) => EditorView.decorations.from(f)
      })

      const state = EditorState.create({
        doc: view.code,
        extensions: [
          basicSetup,
          ...langFor(view.file),
          stampField,
          keymap.of([{ key: 'Mod-s', preventDefault: true, run: () => (saveRef.current(), true) }]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) setDirty(u.state.doc.toString() !== baselineRef.current)
          }),
          dsgnTheme,
          syntaxHighlighting(dsgnHighlight)
        ]
      })
      const editor = new EditorView({ state, parent: hostRef.current })
      viewRef.current = editor

      // Park the stamped element a third of the way down the viewport.
      const pos = editor.state.doc.line(Math.min(start, editor.state.doc.lines)).from
      editor.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 60 }) })
      editor.focus()
    })

    return () => {
      disposed = true
      viewRef.current?.destroy()
      viewRef.current = null
    }
  }, [root, source])

  // Reload from disk after a conflict (or to discard local edits), re-baselining.
  const reload = async (): Promise<void> => {
    const view = viewRef.current
    if (!view) return
    const fresh = await window.api.source.read(root, source)
    if (!fresh) return
    baselineRef.current = fresh.code
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: fresh.code } })
    setDirty(false)
    setStatus('idle')
    setErrorMsg(null)
  }

  return (
    <div
      ref={rootRef}
      className="codedrawer absolute inset-x-0 bottom-0 z-50 flex flex-col border-t bg-background shadow-[0_-4px_18px_rgba(0,0,0,0.08)]"
      style={{ height }}
      aria-label="Code editor"
    >
      <div className="codedrawer__head flex items-center gap-2 border-b px-3 py-1.5">
        <span className="codedrawer__file min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11.5px] text-muted-foreground">
          {meta ? `${meta.file}:${meta.line}` : 'Loading…'}
          {dirty && <span className="codedrawer__dirty ml-1.5 text-amber-600" title="Unsaved changes">●</span>}
        </span>
        {status === 'conflict' && (
          <span className="codedrawer__conflict flex items-center gap-1.5 text-[11px] text-amber-700">
            File changed on disk.
            <button className="underline underline-offset-2" onClick={() => void reload()}>
              Reload
            </button>
          </span>
        )}
        {status === 'error' && errorMsg && (
          <span className="codedrawer__error text-[11px] text-red-700">{errorMsg}</span>
        )}
        {openError && <span className="codedrawer__openerror text-[11px] text-amber-700">{openError}</span>}
        <Button
          variant="ghost"
          size="sm"
          className="codedrawer__open h-6 gap-1 px-2 text-[11.5px] text-muted-foreground"
          onClick={() => void openEditor()}
          title="Open this file in your code editor"
        >
          <ExternalLink className="size-3.5" />
          Editor
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="codedrawer__save h-6 gap-1 px-2 text-[11.5px]"
          onClick={() => void save()}
          disabled={!dirty || status === 'saving'}
          title="Save (⌘S)"
        >
          <Save className="size-3.5" />
          {status === 'saving' ? 'Saving…' : 'Save'}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="codedrawer__expand size-6"
          onClick={() => setExpanded((e) => !e)}
          aria-label={expanded ? 'Collapse code editor' : 'Expand code editor'}
          aria-pressed={expanded}
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="codedrawer__close size-6"
          onClick={onClose}
          aria-label="Close code editor"
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <div ref={hostRef} className="codedrawer__editor min-h-0 flex-1 overflow-hidden text-[12px]" />
    </div>
  )
}
