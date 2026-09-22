import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type {
  ContentControlPanel,
  ResolvedControlPanel,
  SelectedElement
} from '../../../shared/api'
import { useComposer, usePanelInset } from '../store'
import CustomPanel from './CustomPanel'

const ContentEditor = lazy(() => import('./ContentEditor'))

// Animation manifests only permit literals. This stable empty context lets the
// shared control renderer run without owning or changing the preview selection.
const NO_SELECTION: SelectedElement = {
  tag: 'animation',
  id: null,
  classes: [],
  selector: '',
  source: null,
  componentSource: null,
  text: null,
  rect: { x: 0, y: 0, width: 0, height: 0 },
  styles: {}
}

/** Project-owned native controls; selection changes never remount this panel. */
export default function AnimationPanel({ root }: { root: string }): React.JSX.Element | null {
  const [panels, setPanels] = useState<ResolvedControlPanel[]>([])
  const [contentPanels, setContentPanels] = useState<ContentControlPanel[]>([])
  const [collapsed, setCollapsed] = useState(false)
  const [width, setWidth] = useState(280)
  const [error, setError] = useState<string | null>(null)
  const host = useRef<HTMLElement>(null)
  const bottom = usePanelInset((s) => s.bottom)
  const hasPanels = panels.length > 0 || contentPanels.length > 0

  useEffect(() => {
    let disposed = false
    let busy = false
    const refresh = async (): Promise<void> => {
      if (busy) return
      busy = true
      try {
        const manifests = (await window.api.controls.list(root)).filter(
          (p) => p.presentation === 'animation'
        )
        const resolved = manifests.length
          ? await window.api.controls.get(root, {
              files: [...new Set(manifests.map((p) => p.file))]
            })
          : []
        if (!disposed) {
          setPanels(resolved.filter((p) => p.manifest.presentation === 'animation'))
          setError(null)
        }
      } catch {
        if (!disposed) setError('Could not refresh animation controls.')
      } finally {
        busy = false
      }
    }
    const refreshContent = async (): Promise<void> => {
      try {
        const next = await window.api.contentControls.list(root)
        if (!disposed) setContentPanels(next)
      } catch {
        if (!disposed) setError('Could not load content editors.')
      }
    }
    void refreshContent()
    const offContent = window.api.contentControls.onUpdated((event) => {
      if (event.root === root) {
        setCollapsed(false)
        void refreshContent()
      }
    })
    void refresh()
    const offUpdate = window.api.controls.onUpdated((changed) => {
      if (changed === root) void refresh()
    })
    const offOpen = window.api.controls.onOpen((request) => {
      if (request.root === root && request.presentation === 'animation') {
        setCollapsed(false)
        void refresh()
      }
    })
    // Re-read source after scrubbing, undo, manual edits, or worktree landing.
    const timer = setInterval(() => void refresh(), 1500)
    return () => {
      disposed = true
      clearInterval(timer)
      offContent()
      offUpdate()
      offOpen()
    }
  }, [root])

  useEffect(() => {
    if (!hasPanels) return
    const parent = host.current?.parentElement
    if (!parent) return
    const resize = (): void => setWidth(Math.min(280, Math.max(180, parent.clientWidth * 0.45)))
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [hasPanels])
  useEffect(() => {
    usePanelInset.getState().setAnimation(hasPanels ? (collapsed ? 40 : width) : 0)
    return () => usePanelInset.getState().setAnimation(0)
  }, [hasPanels, collapsed, width])
  if (!hasPanels) return null
  const seed = (text: string): void => useComposer.getState().setSeed(text)
  return (
    <aside
      ref={host}
      aria-label={contentPanels.length ? 'Preview controls' : 'Animation controls'}
      className="animation-panel absolute right-0 top-0 z-10 flex flex-col overflow-hidden border-l bg-background"
      style={{ width: collapsed ? 40 : width, bottom }}
    >
      {collapsed && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={contentPanels.length ? 'Show preview controls' : 'Show animation controls'}
          title={contentPanels.length ? 'Show preview controls' : 'Show animation controls'}
          onClick={() => setCollapsed(false)}
        >
          ↔
        </Button>
      )}
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        style={{ display: collapsed ? 'none' : undefined }}
      >
        <header className="flex shrink-0 items-center justify-between px-3 py-2">
          <span className="text-xs font-semibold">
            {contentPanels.length ? 'Preview controls' : 'Animation controls'}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label={
              contentPanels.length ? 'Collapse preview controls' : 'Collapse animation controls'
            }
            onClick={() => setCollapsed(true)}
          >
            −
          </Button>
        </header>
        <p className="px-3 pb-2 text-[11px] text-muted-foreground">
          {contentPanels.length
            ? 'Content drafts save when you choose Save to source.'
            : 'Changes save to source. Use Undo to revert.'}
        </p>
        {error && (
          <p role="alert" className="px-3 text-xs">
            {error}
          </p>
        )}
        <Suspense fallback={<p className="px-3 text-xs">Loading content editors…</p>}>
          {contentPanels.map((panel) => (
            <ContentEditor
              key={panel.id}
              root={root}
              panel={panel}
              onRemove={() => {
                void window.api.contentControls
                  .remove(root, panel.id)
                  .then(() =>
                    setContentPanels((current) => current.filter((p) => p.id !== panel.id))
                  )
                  .catch(() => setError('Could not remove editor.'))
              }}
            />
          ))}
        </Suspense>
        <CustomPanel
          root={root}
          element={NO_SELECTION}
          inspection={null}
          panels={panels}
          onReplay={(component) => window.api.preview.replayAnimation(component)}
          onSeedPrompt={seed}
          onApplyAgent={seed}
          onRegenerate={(id) => {
            const panel = panels.find((p) => p.manifest.id === id)
            if (panel)
              seed(
                `/animation-controls\nRepair this native animation panel, preserving presentation: animation and its existing values:\n${JSON.stringify(panel.manifest)}`
              )
          }}
          onRemove={(id) => {
            void window.api.controls
              .remove(root, id)
              .then(() => setPanels((current) => current.filter((p) => p.manifest.id !== id)))
              .catch(() => setError('Could not remove this panel.'))
          }}
        />
      </div>
    </aside>
  )
}
