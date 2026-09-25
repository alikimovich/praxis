import { useLayoutEffect } from 'react'
import { connectNativeChat } from '../native-chat-shell'
import { useLayersPanel, usePanelInset } from '../store'
import LayersPanel from './LayersPanel'
import type {} from '../../../shared/native-layout'

/** Legacy editing panels remain, but AppKit owns all native view rectangles. */
export default function NativeChatSurface() {
  useLayoutEffect(() => {
    const disconnect = connectNativeChat(window.praxisNativeChat!)
    const sync = () => {
      const panels = usePanelInset.getState(), layers = useLayersPanel.getState()
      window.praxisNativeLayout?.panels({ right: panels.inset + panels.animation, bottom: panels.bottom, layers: layers.open ? layers.height : 0 })
    }
    const off = [usePanelInset.subscribe(sync), useLayersPanel.subscribe(sync)]
    sync()
    return () => { disconnect(); off.forEach(dispose => dispose()) }
  }, [])
  return <div className="chat flex h-full flex-col"><LayersPanel /><div className="native-chat-surface min-h-0 flex-1" /></div>
}
