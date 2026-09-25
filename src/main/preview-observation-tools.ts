import { capturePreview, getPreviewUrl } from './preview-state'

type PreviewToolResult = {
  content: ({ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string })[]
}

/** Read the user's current view on demand; this does not prove an edit has landed. */
export async function observeAgentPreview(
  action: 'preview_location' | 'preview_screenshot'
): Promise<PreviewToolResult> {
  if (action === 'preview_location') {
    const url = getPreviewUrl()
    return { content: [{ type: 'text', text: url
      ? `The user's preview is currently showing ${url}.`
      : 'No project preview is open.' }] }
  }
  const img = await capturePreview()
  if (!img || img.isEmpty()) {
    return { content: [{ type: 'text', text: 'No project preview capture is available.' }] }
  }
  // Swift supplies a bounded JPEG; keep the same limit for other image sources.
  const scaled = img.getSize().width > 1200 ? img.resize({ width: 1200 }) : img
  const jpeg = scaled.toJPEG(70)
  if (!jpeg.length) {
    return { content: [{ type: 'text', text: 'No project preview capture is available.' }] }
  }
  return { content: [{ type: 'image', data: jpeg.toString('base64'), mimeType: 'image/jpeg' }] }
}
