import type { SelectedElement } from '../../shared/api'
import type { Attachment } from './composer-drafts'
import { messageCancellationVersion } from './message-queue'
import { describeSelectionForPrompt, selectionForBubble, useChat } from './store'

/** Capture everything at submission time, before the draft or active chat changes. */
export function messageSender(
  key: string,
  text: string,
  attachments: Attachment[],
  selected: SelectedElement | null
): () => Promise<void> {
  const group = selected ? (selected.selectionGroup ?? [selected]) : []
  const context = group.map(describeSelectionForPrompt).join('\n')
  const images = attachments.filter((a) => a.kind === 'image')
  const files = attachments.filter((a) => a.kind === 'file')
  const fileContext = files.length
    ? `[Attached files]\n${files.map((f) => f.path).join('\n')}\n\n`
    : ''
  return async () => {
    const cancellationVersion = messageCancellationVersion(key)
    const chat = useChat.getState()
    chat.appendUser(text, key, {
      attachments: attachments.map((a) =>
        a.kind === 'file'
          ? { id: a.id, kind: 'file', name: a.name, path: a.path }
          : { id: a.id, kind: 'image', mediaType: a.mediaType, url: a.url }
      ),
      selection:
        group.length > 1
          ? { tag: `${group.length} objects`, ident: '', source: null }
          : selected
            ? selectionForBubble(selected)
            : undefined
    })
    chat.startAssistant(key)
    try {
      const paths = await Promise.all(
        images.map((a) =>
          a.path
            ? Promise.resolve(a.path)
            : window.api.agent
                .saveAttachment({ mediaType: a.mediaType, data: a.data }, a.name)
                .catch(() => '')
        )
      )
      const imageContext = paths.some(Boolean)
        ? `[Attached images — the image(s) in this message are on disk at]\n${paths.filter(Boolean).join('\n')}\n\n`
        : ''
      if (messageCancellationVersion(key) !== cancellationVersion) {
        throw new Error('Message cancelled before sending.')
      }
      await window.api.agent.send(
        fileContext + imageContext + context + text,
        images.length ? images.map(({ mediaType, data }) => ({ mediaType, data })) : undefined,
        key
      )
    } catch (error) {
      if (useChat.getState().byKey[key]) {
        chat.appendDelta(`\n\nUnable to send: ${String(error)}`, key)
        chat.finish(key)
      }
      throw error
    }
  }
}
