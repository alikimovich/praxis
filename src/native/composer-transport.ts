/** Native-only adapter to the existing composer. All edits and commands still
 * pass through React's handlers, including model-switch confirmation and queues. */
import type { NativeComposerAction } from '../shared/native-composer'

type IPC = {
  send: (channel: string, ...args: unknown[]) => void
  on: (channel: string, callback: (event: object, value: unknown) => void) => void
}
export function installComposer(ipc: IPC, rememberPath: (file: File, path: string) => void) {
  let previous = '',
    revision = 0,
    chat = '',
    scheduled = false
  const input = () => document.querySelector<HTMLTextAreaElement>('.composer__input')
  const group = () => input()?.closest<HTMLElement>('[data-slot="input-group"]')
  const key = () => group()?.dataset.nativeChat ?? ''
  const sync = () => {
    scheduled = false
    const field = input(),
      container = group()
    if (key() !== chat) {
      chat = key()
      revision = 0
    }
    const rect = container?.getBoundingClientRect()
    const visible =
      !!field &&
      !!rect &&
      rect.width > 60 &&
      rect.height > 0 &&
      !!chat &&
      !document.querySelector('[role="dialog"]') &&
      !container?.closest('[aria-hidden="true"]')
    const button = container?.querySelector<HTMLButtonElement>('.composer__send')
    const state = {
      visible,
      chat,
      revision,
      text: field?.value ?? '',
      caret: field?.selectionStart ?? 0,
      bounds: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : {},
      stop: button?.classList.contains('composer__send--stop') ?? false,
      enabled: !!button && !button.disabled,
      sendLabel: button?.getAttribute('aria-label') ?? 'Send message',
      choices: [
        ...(container?.querySelectorAll<HTMLSelectElement>('select.composer__picker') ?? [])
      ].map((select) => ({
        label: select.getAttribute('aria-label'),
        value: select.value,
        disabled: select.disabled,
        options: [...select.options].map((option) => ({
          value: option.value,
          label: option.text,
          disabled: option.disabled
        }))
      })),
      context: container?.querySelector('.inspector')?.textContent?.trim() ?? '',
      attachments: [
        ...(container?.querySelectorAll<HTMLButtonElement>('.composer__attachments button') ?? [])
      ].map((button) => button.getAttribute('aria-label') ?? 'Remove attachment'),
      suggestions: [...(container?.querySelectorAll<HTMLButtonElement>('.slash__item') ?? [])].map(
        (button) => ({
          title: button.querySelector('.slash__name')?.textContent ?? '',
          description: button.querySelector('.slash__desc')?.textContent ?? '',
          active: button.classList.contains('is-active')
        })
      )
    }
    const serialized = JSON.stringify(state)
    if (serialized !== previous) {
      previous = serialized
      ipc.send('native-composer:state', state)
    }
  }
  const schedule = () => {
    if (!scheduled) {
      scheduled = true
      setTimeout(sync, 16)
    }
  }
  ipc.on('native-composer:action', (_event, value) => {
    const message = value as NativeComposerAction
    const field = input(),
      container = group()
    if (!field || !container || message.chat !== key()) return
    if (message.action === 'input') {
      revision = message.revision
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(
        field,
        message.text
      )
      field.setSelectionRange(message.caret, message.caret)
      field.dispatchEvent(new Event('input', { bubbles: true }))
      field.dispatchEvent(new Event('select', { bubbles: true }))
    } else if (message.action === 'key') {
      field.dispatchEvent(
        new KeyboardEvent('keydown', { key: message.key, bubbles: true, cancelable: true })
      )
    } else if (message.action === 'send')
      container.querySelector<HTMLButtonElement>('.composer__send')?.click()
    else if (message.action === 'choice') {
      const select = [...container.querySelectorAll<HTMLSelectElement>('select')].find(
        (select) => select.getAttribute('aria-label') === message.label
      )
      if (
        select &&
        !select.disabled &&
        [...select.options].some((option) => option.value === message.value && !option.disabled)
      ) {
        select.value = message.value
        select.dispatchEvent(new Event('change', { bubbles: true }))
      }
    } else if (message.action === 'suggestion')
      container.querySelectorAll<HTMLButtonElement>('.slash__item')[message.index]?.click()
    else if (message.action === 'remove')
      container
        .querySelectorAll<HTMLButtonElement>('.composer__attachments button')
        [message.index]?.click()
    else if (message.action === 'context')
      container.querySelector<HTMLButtonElement>('.inspector button')?.click()
    else if (message.action === 'layers')
      container.querySelector<HTMLButtonElement>('[aria-label="Layers"]')?.click()
    else if (message.action === 'files') {
      const transfer = new DataTransfer()
      for (const item of message.files) {
        const bytes = Uint8Array.from(atob(item.data ?? ''), (c) => c.charCodeAt(0))
        const file = new File([bytes], item.name, { type: item.type })
        rememberPath(file, item.path ?? '')
        transfer.items.add(file)
      }
      container.dispatchEvent(
        new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true })
      )
    }
    schedule()
  })
  const start = () => {
    document.documentElement.classList.add('native-composer')
    const css = document.createElement('style')
    css.textContent =
      'html.native-composer .composer [data-slot="input-group"]{opacity:0;pointer-events:none;min-height:146px} ' +
      'html.native-composer .composer [data-slot="input-group"]:has(textarea:placeholder-shown):not(:has(.inspector,.composer__attachments)){min-height:120px} '
    document.head.append(css)
    new MutationObserver(schedule).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true
    })
    window.addEventListener('resize', schedule)
    document.addEventListener('input', schedule, true)
    document.addEventListener('focusin', (event) => {
      if (event.target === input()) ipc.send('native-composer:focus')
    })
    // React may update textarea.value without a DOM mutation (draft restore).
    setInterval(schedule, 150)
    schedule()
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
}
