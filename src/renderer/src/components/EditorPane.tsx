import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { EditorStatus } from '../../../shared/api'
import { usePanelInset } from '../store'
import { DESKTOP_CORNER_RADIUS } from './PreviewPane'

/**
 * Hosts the native code-server WebContentsView (Code mode) — the same
 * "reserve a DOM slot, drive the native view's bounds over IPC" pattern as
 * PreviewPane, minus the mobile bezel (the editor has no viewport concept).
 *
 * `editor.open` ensures the single vendored code-server instance is
 * downloaded + running and hands back this project's `?folder=` URL;
 * `editor.load` points the native view at it. Both are re-run whenever
 * `root` changes (project switch while Code mode stays active), and are
 * idempotent — main skips the reload when the URL is already loaded, and
 * `ensureStarted` returns instantly once the single instance is warm.
 *
 * The `editor:status` push only fires during the FIRST (cold) start of the
 * shared instance — a warm reopen resolves `open()` with no status events at
 * all — so readiness here is tracked locally from the open→load promise
 * chain, not solely from the status stream (which only supplies the
 * downloading/starting detail while a cold start is in flight).
 */
export default function EditorPane({ root }: { root: string }): React.JSX.Element {
  const slotRef = useRef<HTMLDivElement>(null)
  const inset = usePanelInset((s) => s.inset)
  const bottomInset = usePanelInset((s) => s.bottom)
  const [status, setStatus] = useState<EditorStatus>({ state: 'starting' })
  // Bumped on every (re)run of openAndLoad — a run whose result lands after a
  // newer one started (root changed, or Retry clicked again) is discarded.
  const runToken = useRef(0)

  // Bounds reporting — same ResizeObserver pattern as PreviewPane's desktop
  // branch (Code mode has no mobile bezel to fit).
  useEffect(() => {
    const el = slotRef.current
    if (!el) return

    const report = (): void => {
      const r = el.getBoundingClientRect()
      const availW = Math.max(120, r.width - inset)
      const availH = Math.max(120, r.height - bottomInset)
      window.api.editor.setBounds({
        x: r.x,
        y: r.y,
        width: availW,
        height: availH,
        radius: DESKTOP_CORNER_RADIUS
      })
    }

    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    window.addEventListener('resize', report)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', report)
      // No slot → no native view (mode flipped back to Preview, or the pane
      // unmounted entirely) — zero + hide so it can't linger over whatever
      // takes this space next.
      window.api.editor.setBounds({ x: 0, y: 0, width: 0, height: 0 })
      window.api.editor.setVisible(false)
    }
  }, [inset, bottomInset])

  // Ensure the shared code-server instance + load this project's folder.
  // Exposed so the Retry button can re-run it without needing a dummy state
  // field just to re-trigger an effect.
  const openAndLoad = useCallback((): void => {
    const token = ++runToken.current
    setStatus({ state: 'starting' })
    void (async () => {
      try {
        const res = await window.api.editor.open(root)
        if (runToken.current !== token) return
        if (!res.ok || !res.url) {
          setStatus({ state: 'error', message: res.error ?? 'Could not start the editor.' })
          return
        }
        await window.api.editor.load(res.url)
        if (runToken.current !== token) return
        setStatus({ state: 'ready' })
      } catch (err) {
        if (runToken.current !== token) return
        setStatus({ state: 'error', message: err instanceof Error ? err.message : String(err) })
      }
    })()
  }, [root])

  // Re-runs on a project switch (new `root`, since `openAndLoad` is keyed on it).
  useEffect(() => {
    const unsubscribe = window.api.editor.onStatus((s) => setStatus(s))
    openAndLoad()
    return () => {
      unsubscribe()
    }
  }, [openAndLoad])

  // Only show the native view once it's actually loaded — the download/start
  // states render a DOM overlay in its place instead.
  useEffect(() => {
    window.api.editor.setVisible(status.state === 'ready')
  }, [status.state])

  return (
    <div ref={slotRef} className="preview-slot">
      {status.state !== 'ready' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
          {status.state === 'error' ? (
            <>
              <p className="max-w-[80%] text-[12.5px] text-destructive">{status.message}</p>
              <Button variant="outline" size="sm" onClick={openAndLoad}>
                Retry
              </Button>
            </>
          ) : (
            <>
              <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
              <p className="text-[12.5px] text-muted-foreground">
                {status.state === 'downloading'
                  ? `Downloading editor…${
                      typeof status.progress === 'number'
                        ? ` ${Math.round(status.progress * 100)}%`
                        : ''
                    }`
                  : 'Starting editor…'}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
