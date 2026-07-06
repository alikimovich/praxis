import type { SelectedElement } from '../../../shared/api'

interface Props {
  element: SelectedElement
  /** A react-docgen schema resolved → props are editable in the floating panel. */
  propsReady: boolean
  /** Inspection still running. */
  inspecting: boolean
  /** Offer to set the project up for editing. */
  onSetup: () => void
  onClear: () => void
  /** v8 F3a: re-select the owning component instance (edits per-instance props). */
  onSelectOwner: () => void
}

/**
 * The selection pill in the composer: what's picked (removable) + its source
 * ref and a readiness hint. The element-scoped ACTIONS (comment / annotate /
 * code / delete) live in the floating toolbar next to the selection inside the
 * preview (see src/preview/preload.ts), and the element reference itself rides
 * along invisibly with the next chat message (see ChatPanel's send).
 */
export default function Inspector({
  element,
  propsReady,
  inspecting,
  onSetup,
  onClear,
  onSelectOwner
}: Props): React.JSX.Element {
  // Show the "edit owner component" affordance when the clicked host resolved to a
  // different component-instance call site (the authored <Component …/>).
  const hasOwner = !!element.componentSource && element.componentSource !== element.source

  const ident = element.id
    ? `#${element.id}`
    : element.classes[0]
      ? `.${element.classes[0]}`
      : ''

  return (
    <div className="inspector flex flex-col gap-1 px-2 pt-2">
      <div className="inspector__head flex min-w-0 items-center gap-1.5">
        {/* The pill: what's selected, removable. */}
        <span className="inspector__pill inline-flex max-w-[55%] items-center gap-1 rounded-md bg-indigo-50 py-0.5 pl-2 pr-1 text-indigo-700">
          <span className="inspector__tag truncate font-mono text-[12px] font-semibold">
            {element.tag}
            {ident}
          </span>
          <button
            className="inspector__close flex size-4 shrink-0 items-center justify-center rounded text-indigo-400 hover:text-indigo-700"
            onClick={onClear}
            aria-label="Clear selection"
          >
            ×
          </button>
        </span>
        <span
          className="inspector__source min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] text-muted-foreground"
          title={element.source ?? undefined}
        >
          {element.source ?? ''}
        </span>
      </div>

      {/* Readiness. Three "not ready" cases, kept distinct so the hint is honest:
          1. no source stamp at all → the project isn't set up (offer setup);
          2. stamped host element that sits inside a component → point at the
             "edit the owning component" affordance;
          3. stamped but no named prop schema (e.g. a bare host tag, or a component
             whose props are just HTML attributes) → prompt-only. */}
      {inspecting ? (
        <div className="inspector__ready text-[11px] text-muted-foreground">Reading props…</div>
      ) : propsReady ? (
        <div className="inspector__ready inspector__ready--ok text-[11px] text-green-700">
          Editing props in the panel →
        </div>
      ) : !element.source ? (
        <div className="inspector__ready inspector__ready--no text-[11px] text-amber-700">
          Not set up for prop editing —{' '}
          <button className="inspector__link text-blue-600 underline" onClick={onSetup}>
            set up the project
          </button>{' '}
          or ask dsgn below.
        </div>
      ) : hasOwner ? (
        <div className="inspector__ready inspector__ready--no text-[11px] text-muted-foreground">
          {`<${element.tag}>`} is a plain element —{' '}
          <button className="inspector__owner text-blue-600 underline" onClick={onSelectOwner}>
            edit its component
          </button>{' '}
          or ask dsgn below.
        </div>
      ) : (
        <div className="inspector__ready inspector__ready--no text-[11px] text-muted-foreground">
          No editable props on {`<${element.tag}>`} — ask dsgn below to change it.
        </div>
      )}
    </div>
  )
}
