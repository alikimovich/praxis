import { useEffect } from 'react'
import { ListEnd, Play, Trash2 } from 'lucide-react'
import { Button } from './ui/button'
import { drainMessages, useMessageQueue } from '../message-queue'
import { useChat } from '../store'

export function QueuedMessages(): React.JSX.Element | null {
  const allChats = useChat((s) => s.byKey)
  const key = useChat((s) => s.activeKey)
  const queue = useMessageQueue()
  // biome-ignore lint/correctness/useExhaustiveDependencies: queue edits and Resume must wake the dispatcher
  useEffect(() => {
    drainMessages(allChats)
  }, [allChats, queue.messages, queue.paused])
  const messages = queue.messages.filter((message) => message.key === key)
  if (!messages.length) return null
  return (
    <section
      className="mx-3 -mb-4 rounded-t-2xl border border-border bg-card pb-4 text-sm text-foreground"
      aria-label="Queued messages"
    >
      <span className="sr-only">{messages.length} queued</span>
      {queue.paused[key] && (
        <div className="flex items-center justify-between gap-2 px-3 pt-1">
          <span className="text-xs">Queue paused</span>
          <Button variant="ghost" size="xs" onClick={() => queue.pause(key, false)}>
            <Play aria-hidden="true" />
            Resume queue
          </Button>
        </div>
      )}
      <div className="max-h-40 overflow-y-auto overscroll-contain px-2 py-0.5">
        {messages.map((message) => (
          <div key={message.id} className="flex min-h-8 items-center gap-2 pl-1">
            <ListEnd className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate" title={message.label}>{message.label}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label={`Remove queued message: ${message.label}`}
              title="Remove queued message"
              onClick={() => queue.remove(message.id)}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        ))}
      </div>
    </section>
  )
}
