import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  formatConversation,
  openWithPreviewFreeze,
  useChat,
  useFeedback,
  usePreviewFreeze
} from '../store'

/**
 * In-app "Send feedback" (LKM-27). Writes a GitHub issue on Praxis's own repo via
 * `window.api.feedback`. A screenshot of the app window and the current chat
 * transcript ride along as opt-in attachments — both default on, each behind its
 * own toggle. The screenshot is captured on open so the toggle can preview it.
 */
export default function FeedbackDialog(): React.JSX.Element {
  const open = useFeedback((s) => s.open)
  const setOpen = useFeedback((s) => s.setOpen)
  const messages = useChat((s) => s.messages)
  const hasConversation = messages.some((m) => m.text.trim())

  const [body, setBody] = useState('')
  const [includeScreenshot, setIncludeScreenshot] = useState(true)
  const [includeConversation, setIncludeConversation] = useState(true)
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string; url?: string } | null>(null)

  // The dialog is renderer DOM and the native preview paints ABOVE all DOM —
  // freeze-frame the preview while open (same path as the dropdowns and the
  // session-review modal) and gate rendering on the freeze, so the dialog can't
  // flash behind the native view or get punched through by a landing load.
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!open) {
      setShown(false)
      usePreviewFreeze.getState().setFrozen(false)
      return
    }
    openWithPreviewFreeze(() => setShown(true))
  }, [open])

  // Reset + grab a fresh screenshot each time the dialog actually shows —
  // after the freeze, so the capture includes the snapshot <img> (the native
  // preview is a separate target that capturePage never sees).
  useEffect(() => {
    if (!shown) return
    setBody('')
    setResult(null)
    setBusy(false)
    setIncludeScreenshot(true)
    setIncludeConversation(true)
    setScreenshot(null)
    let live = true
    void window.api.feedback.capture().then((shot) => {
      if (live) setScreenshot(shot)
    })
    return () => {
      live = false
    }
  }, [shown])

  const submit = async (): Promise<void> => {
    if (!body.trim() || busy) return
    setBusy(true)
    setResult(null)
    try {
      const res = await window.api.feedback.submit({
        body,
        screenshot: includeScreenshot ? screenshot : null,
        conversation:
          includeConversation && hasConversation ? formatConversation(messages) : null
      })
      if (res.ok) {
        setResult({ ok: true, text: 'Thanks — your feedback was filed.', url: res.url })
      } else {
        setResult({ ok: false, text: res.error ?? 'Couldn’t send feedback.' })
      }
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : 'Couldn’t send feedback.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open && shown} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>
            Files a GitHub issue on the Praxis repo. Attach a screenshot and the current
            conversation if they help.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What’s working, what isn’t, what you’d like to see…"
          className="min-h-28"
          autoFocus
        />

        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeScreenshot}
              disabled={!screenshot}
              onChange={(e) => setIncludeScreenshot(e.target.checked)}
            />
            <span>Attach a screenshot{screenshot ? '' : ' (unavailable)'}</span>
          </label>
          {includeScreenshot && screenshot && (
            <img
              src={screenshot}
              alt="App screenshot preview"
              className="max-h-32 w-auto self-start rounded border"
            />
          )}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeConversation && hasConversation}
              disabled={!hasConversation}
              onChange={(e) => setIncludeConversation(e.target.checked)}
            />
            <span>Attach the conversation{hasConversation ? '' : ' (nothing to attach)'}</span>
          </label>
        </div>

        {result && (
          <p className={result.ok ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}>
            {result.text}
            {result.url && (
              <>
                {' '}
                <a href={result.url} target="_blank" rel="noreferrer" className="underline">
                  View issue
                </a>
              </>
            )}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {result?.ok ? 'Close' : 'Cancel'}
          </Button>
          <Button onClick={() => void submit()} disabled={busy || !body.trim()}>
            {busy ? 'Sending…' : 'Send feedback'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
