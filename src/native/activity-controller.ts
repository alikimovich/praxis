export interface ActivityLine { id: number; time: string; text: string; kind: string }
/** Bounded both by entries and characters; a single server write can be huge. */
export class NativeActivityController {
  lines: ActivityLine[] = []
  visible = false
  private sequence = 0
  private repaint?: ReturnType<typeof setTimeout>
  constructor(readonly send: (method: string, value: any) => void) {}
  append(text: string, kind = 'info') {
    if (typeof text !== 'string' || !text) return
    this.lines.push({ id: ++this.sequence, time: new Date().toTimeString().slice(0, 8), text: text.slice(-16000), kind })
    let size = this.lines.reduce((n, line) => n + line.text.length, 0)
    while (this.lines.length > 500 || size > 500000) size -= this.lines.shift()!.text.length
    if (kind === 'error') this.visible = true
    if (this.visible && !this.repaint) this.repaint = setTimeout(() => { this.repaint = undefined; if (this.visible) this.render() }, 50)
  }
  render() { this.send('activityState', { lines: this.lines, visible: this.visible }) }
  action(action: string) {
    if (action === 'clear') this.lines = []
    else if (action === 'show') this.visible = true
    else if (action === 'hide') this.visible = false
    else if (action === 'toggle') this.visible = !this.visible
    else return
    this.render()
  }
}
