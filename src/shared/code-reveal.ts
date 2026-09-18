import type { CodeRevealRequest } from './api'

/** Prefer the original location; otherwise accept only an unambiguous exact match. */
export function locateCodeReveal(
  content: string,
  request: Pick<CodeRevealRequest, 'code' | 'startLine'>
): { startLine: number; endLine: number } | null {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const needle = request.code.replace(/\r\n/g, '\n').split('\n')
  const matches = (at: number): boolean =>
    at >= 0 && needle.every((line, offset) => lines[at + offset] === line)
  let at = request.startLine - 1
  if (!matches(at)) {
    const found: number[] = []
    for (let index = 0; index < lines.length; index++) {
      if (matches(index)) found.push(index)
      if (found.length > 1) return null
    }
    if (found.length !== 1) return null
    at = found[0]
  }
  return { startLine: at + 1, endLine: at + needle.length }
}
