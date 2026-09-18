import { useEffect } from 'react'
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
    <section className="flex w-full flex-col gap-1 px-2 pt-2 text-xs" aria-label="Queued messages">
      <div className="flex items-center justify-between">
        <span>
          {messages.length} queued{queue.paused[key] ? ' · paused' : ''}
        </span>
        {queue.paused[key] && (
          <button type="button" onClick={() => queue.pause(key, false)}>
            Resume queue
          </button>
        )}
      </div>
      {messages.map((message) => (
        <div key={message.id} className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate">{message.label}</span>
          <button
            type="button"
            aria-label={`Remove queued message: ${message.label}`}
            onClick={() => queue.remove(message.id)}
          >
            ×
          </button>
        </div>
      ))}
    </section>
  )
}
