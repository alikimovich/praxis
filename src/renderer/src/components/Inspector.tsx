import type { SelectedElement } from '../../../shared/api'

interface Props {
  element: SelectedElement
  onClear: () => void
}

/**
 * The selection pill in the composer: what's picked (removable) + its source
 * ref. Element-scoped ACTIONS live in the floating toolbar next to the
 * selection inside the preview (src/preview/preload.ts); prop editing and
 * readiness messaging live in the right-hand PropPanel; and the element
 * reference rides along invisibly with the next chat message (ChatPanel send).
 */
export default function Inspector({ element, onClear }: Props): React.JSX.Element {
  const ident = element.id
    ? `#${element.id}`
    : element.classes[0]
      ? `.${element.classes[0]}`
      : ''

  return (
    <div className="inspector flex w-full min-w-0 items-center gap-2 pl-[14px] pr-3 pt-2.5">
      {/* The pill: what's selected, removable. */}
      <span className="inspector__pill inline-flex min-w-0 max-w-[60%] items-center gap-1 rounded-md bg-indigo-50 px-1.5 py-1 text-indigo-700">
        <span className="inspector__tag truncate font-mono text-[12px] font-semibold leading-none">
          {element.tag}
          {ident}
        </span>
        <button
          className="inspector__close flex size-3.5 shrink-0 items-center justify-center rounded text-indigo-400 hover:text-indigo-700"
          onClick={onClear}
          aria-label="Clear selection"
        >
          ×
        </button>
      </span>
      <span
        className="inspector__source min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] leading-none text-muted-foreground"
        title={element.source ?? undefined}
      >
        {element.source ?? ''}
      </span>
    </div>
  )
}
