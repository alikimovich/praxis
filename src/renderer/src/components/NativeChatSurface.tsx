import { useLayoutEffect, useRef } from 'react'
import { connectNativeChat } from '../native-chat-shell'
import LayersPanel from './LayersPanel'

/** Transitional geometry adapter only. The native chat controller lives in Bun. */
export default function NativeChatSurface() {
  const element = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const bridge = window.praxisNativeChat!
    const disconnect = connectNativeChat(bridge)
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
        const layout = { visible, bounds: { x: rect.x, y: rect.y, width, height: rect.height } }
        const serialized = JSON.stringify(layout)
        if (serialized !== last) { last = serialized; bridge.command({ type: 'layout', layout }) }
      }, 16)
    }
    const resize = new ResizeObserver(sync)
    resize.observe(node)
    const pane = node.closest('.pane--chat')
    if (pane) resize.observe(pane)
    const mutation = new MutationObserver(sync)
    mutation.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-hidden'] })
    sync()
    return () => {
      disconnect(); resize.disconnect(); mutation.disconnect(); clearTimeout(timer)
      bridge.command({ type: 'layout', layout: { visible: false, bounds: { x: 0, y: 0, width: 0, height: 0 } } })
    }
  }, [])
  return <div className="chat flex h-full flex-col"><LayersPanel /><div ref={element} className="native-chat-surface min-h-0 flex-1" /></div>
}
