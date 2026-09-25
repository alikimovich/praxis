export interface NativePreviewFrame { x: number; y: number; width: number; height: number; radius: number; leading: number }
export interface NativeLayoutBridge {
  panels(panels: { right?: number; bottom?: number; layers?: number }): void
  onFrame(callback: (frame: NativePreviewFrame) => void): () => void
}
declare global { interface Window { praxisNativeLayout?: NativeLayoutBridge } }
