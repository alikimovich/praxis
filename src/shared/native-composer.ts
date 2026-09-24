/** Private native composer events. Only the trusted main webview receives these. */
export type NativeComposerAction = { chat: string } & (
  | { action: 'input'; text: string; caret: number; revision: number }
  | { action: 'key'; key: string }
  | { action: 'send' | 'context' | 'layers' }
  | { action: 'choice'; label: string; value: string }
  | { action: 'suggestion' | 'remove'; index: number }
  | { action: 'files'; files: { name: string; path: string; type: string; data: string }[] }
)
