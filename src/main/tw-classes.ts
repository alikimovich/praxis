/**
 * Tailwind color-utility class detection, shared by the React (props.ts) and
 * Svelte (props-svelte.ts) token-apply paths (T2 class swap). Its own module so
 * both adapters import it without an import cycle.
 */

// The color utility families. `text-` is shared with font-size, so a `text-<size>`
// is excluded from the color match (see colorClassFamily).
export const COLOR_CLASS_FAMILIES = [
  'bg', 'text', 'border', 'ring', 'fill', 'stroke', 'decoration', 'outline', 'accent',
  'caret', 'divide', 'from', 'via', 'to', 'placeholder', 'shadow'
]
const TW_TEXT_SIZES = new Set([
  'xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl'
])

/** If `cls` is a plain color utility, return its family prefix (e.g. 'text' for
 * `text-gray-500`); null otherwise. Skips variants (`hover:…`) and arbitrary
 * values (`[…]`) — too ambiguous to rewrite safely. */
export function colorClassFamily(cls: string): string | null {
  if (cls.includes(':') || cls.includes('[')) return null
  for (const f of COLOR_CLASS_FAMILIES) {
    if (cls.startsWith(`${f}-`)) {
      const suffix = cls.slice(f.length + 1)
      if (f === 'text' && TW_TEXT_SIZES.has(suffix)) return null // text-sm is a font size
      return f
    }
  }
  return null
}

/** A token name is safe to splice as a class suffix (no spaces/quotes that could
 * inject extra classes; the full class string is JSON.stringify'd regardless). */
export const SAFE_CLASS_SUFFIX = /^[\w/.-]+$/

/**
 * Swap the single color utility in `classList` to `tokenName`, returning the new
 * class string — or null when it's ambiguous (zero or >1 color utilities) or the
 * token name isn't a safe suffix. Shared by both framework adapters.
 */
export function swapColorClass(classList: string, tokenName: string): string | null {
  if (!SAFE_CLASS_SUFFIX.test(tokenName)) return null
  const classes = classList.split(/\s+/).filter(Boolean)
  const colorClasses = classes.filter((c) => colorClassFamily(c) != null)
  if (colorClasses.length !== 1) return null
  const fam = colorClassFamily(colorClasses[0])!
  return classes.map((c) => (c === colorClasses[0] ? `${fam}-${tokenName}` : c)).join(' ')
}
