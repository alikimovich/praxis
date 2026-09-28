const text = (lines: string[]) => lines.join(' ').replace(/\s+/g, ' ').toLowerCase()

/** Keep title evidence in the top viewport; other semantics may span the tall panel. */
export function missingShadowCaptureSemantics(top: string[], bottom: string[]) {
  const topText = text(top)
  const visibleText = text([...top, ...bottom])
  return [
    ...['shadow light', 'preview'].filter(label => !topText.includes(label)),
    ...['light source', 'distance', 'blur', 'layers', 'decay', 'rgba', 'box-shadow', 'undo']
      .filter(label => !visibleText.includes(label)),
  ]
}
