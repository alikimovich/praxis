export type ProjectStatus =
  | { kind: 'idle' }
  | { kind: 'setup'; name: string }
  | { kind: 'busy'; label: string }
  | { kind: 'running'; name: string; url: string }
  | { kind: 'error'; message: string }
