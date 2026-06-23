import { useEffect, useRef, useState } from 'react'
import { useChat } from '../store'

/**
 * Skeleton chat panel wired to the agent IPC stream. This is the placeholder
 * that the assistant-ui ExternalStoreRuntime replaces next — but the data flow
 * (send over IPC -> stream `agent:event` deltas -> mutate the store) is the
 * exact shape the real adapter will keep.
 */
export default function ChatPanel(): React.JSX.Element {
  const { messages, isRunning, appendUser, startAssistant, appendDelta, appendStatus, finish } =
    useChat()
  const [input, setInput] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const streamingId = useRef<string | null>(null)

  useEffect(() => {
    return window.api.agent.onEvent((event) => {
      const id = streamingId.current
      if (!id) return
      if (event.type === 'delta') {
        appendDelta(id, event.text)
      } else if (event.type === 'status') {
        appendStatus(id, event.text)
      } else if (event.type === 'error') {
        appendDelta(id, `\n\n⚠️ ${event.message}`)
        finish()
        streamingId.current = null
      } else if (event.type === 'done') {
        finish()
        streamingId.current = null
      }
    })
  }, [appendDelta, appendStatus, finish])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages])

  const send = (): void => {
    const text = input.trim()
    if (!text || isRunning) return
    appendUser(text)
    streamingId.current = startAssistant()
    setInput('')
    void window.api.agent.send(text)
  }

  return (
    <div className="chat">
      <div className="chat__messages" ref={listRef}>
        {messages.length === 0 && (
          <div className="chat__empty">
            Ask for a change, or open a project to preview it on the right.
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`msg msg--${m.role}`}>
            <div className="msg__role">{m.role}</div>
            {m.statuses.map((s, i) => (
              <div key={i} className="msg__status">
                › {s}
              </div>
            ))}
            {m.text && <div className="msg__text">{m.text}</div>}
          </div>
        ))}
      </div>
      <div className="composer">
        <textarea
          className="composer__input"
          placeholder="Message dsgn…"
          value={input}
          rows={2}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        <button className="composer__send" onClick={send} disabled={!input.trim() || isRunning}>
          {isRunning ? '…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
