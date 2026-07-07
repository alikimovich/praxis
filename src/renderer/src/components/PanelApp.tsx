import { useEffect, useRef, useState } from 'react'
import type { PanelState } from '../../../shared/api'
import PropPanel from './PropPanel'

/**
 * Root of the floating prop-panel island (the ?dsgnPanel=1 renderer instance —
 * a WebContentsView stacked above the native preview). Stateless: renders
 * whatever the main renderer pushes over panel:state, relays user actions
 * back, and reports its natural height so the view can be sized to fit.
 */
export default function PanelApp(): React.JSX.Element | null {
  const [state, setState] = useState<PanelState | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => window.api.panel.onState(setState), [])

  // Report content height (includes the shadow padding) whenever it changes.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const report = (): void =>
      window.api.panel.reportHeight(Math.ceil(el.getBoundingClientRect().height))
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [state === null])

  if (!state) return null
  return (
    /* Padding = exactly the card shadow's extent per side (0 8px 24px → up 16,
       sides 24, down 32), so the blur never clips at the view edges and the
       transparent view stays as small as possible (it eats clicks).
       Mirrored in PanelHost's placement math. */
    <div ref={ref} className="panelapp" style={{ padding: '16px 24px 32px 24px' }}>
      <PropPanel
        variant="overlay"
        maxHeight={state.maxHeight}
        root={state.root}
        element={state.element}
        inspection={state.inspection}
        inspecting={state.inspecting}
        onChange={(next) => window.api.panel.action({ kind: 'inspection', inspection: next })}
        onSeedPrompt={(text) => window.api.panel.action({ kind: 'seed', text })}
        onSetup={() => window.api.panel.action({ kind: 'setup' })}
        onSelectOwner={() => window.api.panel.action({ kind: 'owner' })}
        onToggleDock={() => window.api.panel.action({ kind: 'dock' })}
        onClose={() => window.api.panel.action({ kind: 'close' })}
      />
    </div>
  )
}
