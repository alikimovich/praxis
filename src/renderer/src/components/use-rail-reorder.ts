import type { DragEvent, HTMLAttributes } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import './rail-reorder.css'

interface Row {
  group: string
  id: string
  name: string
}
interface Drop {
  row: Row
  after: boolean
}
export type RailDragProps = HTMLAttributes<HTMLButtonElement> & { 'data-reorder-id': string }
const same = (a: Row, b: Row): boolean => a.group === b.group && a.id === b.id

/** Native drag keeps the lifted row under the pointer even outside the rail.
 * Commit only on a valid drop; Escape/outside/unmount never changes ordering. */
export function useRailReorder(move: (source: Row, target: Row, after: boolean) => void) {
  const source = useRef<Row | null>(null)
  const drop = useRef<Drop | null>(null)
  const ghost = useRef<HTMLElement | null>(null)
  const indicator = useRef<HTMLElement | null>(null)
  const origin = useRef<HTMLElement | null>(null)
  const scroll = useRef<{ el: HTMLElement; speed: number } | null>(null)
  const frame = useRef(0)
  const swallowClick = useRef(false)
  const [announcement, announce] = useState('')
  const latestMove = useRef(move)
  latestMove.current = move
  const clearTarget = useCallback((): void => {
    indicator.current?.removeAttribute('data-reorder-edge')
    indicator.current = null
    drop.current = null
  }, [])
  const stop = useCallback((): void => {
    clearTarget()
    source.current = null
    origin.current?.removeAttribute('data-reorder-dragging')
    origin.current = null
    ghost.current?.remove()
    ghost.current = null
    scroll.current = null
    cancelAnimationFrame(frame.current)
    frame.current = 0
  }, [clearTarget])
  useEffect(() => {
    const cancel = (): void => {
      if (source.current) announce(`Move cancelled. ${source.current.name} stayed in place.`)
      stop()
    }
    window.addEventListener('dragend', cancel)
    window.addEventListener('drop', cancel)
    window.addEventListener('blur', cancel)
    return () => {
      stop()
      window.removeEventListener('dragend', cancel)
      window.removeEventListener('drop', cancel)
      window.removeEventListener('blur', cancel)
    }
  }, [stop])
  const autoscroll = (): void => {
    if (!source.current) {
      frame.current = 0
      return
    }
    if (scroll.current) scroll.current.el.scrollTop += scroll.current.speed
    frame.current = requestAnimationFrame(autoscroll)
  }
  const hover = (e: DragEvent<HTMLButtonElement>, row: Row): void => {
    if (!source.current || source.current.group !== row.group) {
      clearTarget()
      return
    }
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const r = e.currentTarget.getBoundingClientRect()
    const after = e.clientY >= r.top + r.height / 2
    clearTarget()
    if (!same(source.current, row)) {
      // Project drop boundaries wrap the whole group, not just its heading.
      indicator.current = e.currentTarget.closest<HTMLElement>('[data-reorder-item]')
      indicator.current?.setAttribute('data-reorder-edge', after ? 'after' : 'before')
      drop.current = { row, after }
    }
  }
  return {
    announcement,
    scrollProps: {
      onDragOverCapture: (e: DragEvent<HTMLDivElement>) => {
        if (!source.current) return
        e.preventDefault()
        const bounds = e.currentTarget.getBoundingClientRect()
        scroll.current = {
          el: e.currentTarget,
          speed: e.clientY < bounds.top + 48 ? -7 : e.clientY > bounds.bottom - 48 ? 7 : 0
        }
      },
      onDragLeave: (e: DragEvent<HTMLDivElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          clearTarget()
          scroll.current = null
        }
      }
    },
    bind: (row: Row): RailDragProps => ({
      draggable: true,
      'data-reorder-id': row.id,
      'aria-description': 'Drag to reorder. Alt + Up or Down moves this row with the keyboard.',
      onClickCapture: (e) => {
        if (swallowClick.current) {
          swallowClick.current = false
          e.preventDefault()
          e.stopPropagation()
        }
      },
      onPointerDown: () => {
        swallowClick.current = false
      },
      onDragStart: (e) => {
        stop()
        // Moving a project can restart Chromium's descendant unfold animation.
        // Settle mounted groups before measuring/dragging; newly opened groups
        // still get their normal mount animation.
        e.currentTarget
          .closest('.rail')
          ?.querySelectorAll<HTMLElement>('.rail__project-body')
          .forEach((body) => {
            body.style.animation = 'none'
          })
        source.current = row
        swallowClick.current = true
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('application/x-praxis-rail', row.id)
        const el =
          e.currentTarget.closest<HTMLElement>('.rail__row, .rail__chat-item') ?? e.currentTarget
        origin.current = e.currentTarget.closest<HTMLElement>('[data-reorder-item]')
        const r = el.getBoundingClientRect()
        const copy = document.createElement('div')
        copy.className = 'rail-reorder-ghost'
        copy.textContent = row.name
        copy.style.width = `${r.width}px`
        copy.style.height = `${r.height}px`
        copy.setAttribute('aria-hidden', 'true')
        document.body.append(copy)
        ghost.current = copy
        e.dataTransfer.setDragImage(copy, Math.min(e.clientX - r.left, r.width - 8), r.height / 2)
        origin.current?.setAttribute('data-reorder-dragging', '')
        announce(
          `Moving ${row.name}. Drop on another row in the same list, or press Escape to cancel.`
        )
        frame.current = requestAnimationFrame(autoscroll)
      },
      onDragOver: (e) => hover(e, row),
      onDragLeave: (e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          clearTarget()
        }
      },
      onDrop: (e) => {
        if (!origin.current?.isConnected) {
          stop()
          return
        }
        if (!source.current || source.current.group !== row.group) return
        e.preventDefault()
        e.stopPropagation()
        hover(e, row)
        if (drop.current) {
          latestMove.current(source.current, drop.current.row, drop.current.after)
          announce(
            `Moved ${source.current.name} ${drop.current.after ? 'after' : 'before'} ${row.name}.`
          )
        }
        stop()
      },
      onKeyDown: (e) => {
        swallowClick.current = false
        if (!e.altKey || e.ctrlKey || e.metaKey || !['ArrowUp', 'ArrowDown'].includes(e.key)) return
        e.preventDefault()
        e.stopPropagation()
        const rowEl = e.currentTarget.closest('[data-reorder-item]')
        const list = rowEl?.parentElement
        const peers = list
          ? [...list.children]
              .map((el) => el.querySelector<HTMLButtonElement>('[data-reorder-id]'))
              .filter((el): el is HTMLButtonElement => !!el)
          : []
        const index = peers.indexOf(e.currentTarget)
        const after = e.key === 'ArrowDown'
        const target = peers[index + (after ? 1 : -1)]
        if (!target?.dataset.reorderId || index < 0) return
        latestMove.current(
          row,
          { ...row, id: target.dataset.reorderId, name: target.textContent ?? '' },
          after
        )
        announce(`Moved ${row.name} ${after ? 'down' : 'up'}.`)
      }
    })
  }
}
