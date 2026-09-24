import { useLayoutEffect, useRef } from 'react'
import type { NativeChatAction, NativeChatState } from '../../../shared/native-chat'
import type { NativeComposerAction } from '../../../shared/native-composer'

/** Geometry only. No transcript or composer DOM is mounted in native mode. */
export default function NativeChatSurface({ state, onAction, onComposer }: {
  state: NativeChatState
  onAction: (action: NativeChatAction) => void
  onComposer: (action: NativeComposerAction) => void
}) {
  const element = useRef<HTMLDivElement>(null)
  const current = useRef({ state, onAction, onComposer })
  current.current = { state, onAction, onComposer }
  const publish = useRef<() => void>(() => {})
  useLayoutEffect(() => {
    const bridge = window.praxisNativeChat!
    const node = element.current!
    let timer: ReturnType<typeof setTimeout> | undefined
    let last = ''
    const sync = () => {
      if (timer) return
      timer = setTimeout(() => {
        timer = undefined
        const rect = node.getBoundingClientRect()
        const pane = node.closest('.pane--chat')?.getBoundingClientRect()
        const width = Math.max(0, Math.min(rect.width, (pane?.right ?? rect.right) - rect.x))
        const visible = width > 60 && rect.height > 30 && !node.closest('[aria-hidden="true"]') && !document.querySelector('[role="dialog"]')
        const snapshot = { ...current.current.state, visible, bounds: { x: rect.x, y: rect.y, width, height: rect.height } }
        const serialized = JSON.stringify(snapshot)
        if (serialized !== last) { last = serialized; bridge.update(snapshot) }
      }, 16)
    }
    publish.current = sync
    const resize = new ResizeObserver(sync)
    resize.observe(node)
    const pane = node.closest('.pane--chat')
    if (pane) resize.observe(pane)
    const mutation = new MutationObserver(sync)
    mutation.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-hidden'] })
    const action = bridge.onAction(value => { if (value.chat === current.current.state.chat) current.current.onAction(value) })
    const composer = bridge.onComposer(value => { if (value.chat === current.current.state.chat) current.current.onComposer(value) })
    sync()
    return () => {
      action(); composer(); resize.disconnect(); mutation.disconnect(); clearTimeout(timer)
      bridge.update({ ...current.current.state, visible: false, bounds: { x: 0, y: 0, width: 0, height: 0 } })
    }
  }, [])
  useLayoutEffect(() => { publish.current() })
  return <div ref={element} className="native-chat-surface min-h-0 flex-1" />
}
