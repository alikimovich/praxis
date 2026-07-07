import { useEffect, useRef } from 'react'
import type { Annotation } from '../../../shared/api'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  notes: Annotation[]
  focusedId: string | null
  publishing: boolean
  publishMsg: { ok: boolean; text: string } | null
  onRemove: (id: string) => void
  onPublish: () => void
}

/**
 * The handoff panel: every pinned note, plus Publish (branch + GitHub PR). The
 * numbers match the pins drawn over the live preview.
 */
export default function NotesPanel({
  notes,
  focusedId,
  publishing,
  publishMsg,
  onRemove,
  onPublish
}: Props): React.JSX.Element | null {
  const focusedRef = useRef<HTMLLIElement>(null)
  // Scroll a pin-focused note into view (the list scrolls past ~5 notes).
  useEffect(() => {
    if (focusedId) focusedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [focusedId])

  if (notes.length === 0) return null
  return (
    <div className="notes flex flex-col gap-[7px] rounded-lg border bg-muted/40 p-2">
      <div className="notes__head flex items-center gap-2">
        <span className="notes__title text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Notes · {notes.length}
        </span>
        <Button
          size="sm"
          className="notes__publish ml-auto bg-green-600 text-white hover:bg-green-700"
          onClick={onPublish}
          disabled={publishing}
        >
          {publishing ? 'Publishing…' : 'Publish PR'}
        </Button>
      </div>
      {publishMsg && (
        <div
          className={cn(
            'notes__msg break-all text-[11.5px]',
            publishMsg.ok
              ? 'notes__msg--ok text-green-700'
              : 'notes__msg--err whitespace-pre-wrap text-red-700'
          )}
        >
          {publishMsg.text}
        </div>
      )}
      <ul className="notes__list m-0 flex max-h-[180px] list-none flex-col gap-[5px] overflow-y-auto p-0">
        {notes.map((n, i) => (
          <li
            key={n.id}
            ref={n.id === focusedId ? focusedRef : undefined}
            className={cn(
              'notes__item flex items-start gap-[7px] rounded-md p-[5px_6px]',
              n.id === focusedId && 'is-focused bg-amber-100'
            )}
          >
            <span className="notes__num mt-px inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-amber-500 font-mono text-[9px] font-bold text-white">
              {i + 1}
            </span>
            <div className="notes__body min-w-0 flex-1">
              <div className="notes__where overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10.5px] text-muted-foreground">
                {n.source ?? n.selector}
              </div>
              <div className="notes__text text-[12.5px] leading-snug">{n.text}</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="notes__remove size-5 shrink-0 text-muted-foreground"
              onClick={() => onRemove(n.id)}
              aria-label="Delete note"
            >
              ✕
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
