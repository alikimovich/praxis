/** Only project-root paths: no external origins, schemes, or URL parser escapes. */
export function previewPath(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') ||
      /[\\\x00-\x20]/.test(raw) || raw.length > 8192) return null
  return raw
}

export interface PreviewOpenRequest {
  root: string
  key: string
  path: string
}
