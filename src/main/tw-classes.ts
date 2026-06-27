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

// Radius: `rounded`, `rounded-{side}`, optionally `-{size}`. Swap the size suffix.
const RADIUS_RE = /^(rounded(?:-(?:t|r|b|l|tl|tr|bl|br|s|e))?)(?:-[a-z0-9]+)?$/
// Spacing/sizing: padding/margin/gap/space/inset/size families, optional -{size}.
const SPACING_RE =
  /^(p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y|w|h|min-w|max-w|min-h|max-h|size|inset|inset-x|inset-y|top|right|bottom|left|start|end)(?:-[a-z0-9.]+)?$/

/**
 * The class "family prefix" to keep (whose size suffix the token replaces) for a
 * given token group, or null if `cls` isn't a swappable utility of that group.
 * Variants (`hover:…`) and arbitrary values (`[…]`) are skipped as too ambiguous.
 */
function classFamilyForGroup(cls: string, group: string): string | null {
  if (cls.includes(':') || cls.includes('[')) return null
  if (/colou?r/i.test(group)) return colorClassFamily(cls)
  if (/radi|round/i.test(group)) return RADIUS_RE.exec(cls)?.[1] ?? null
  if (/spac|gap|pad|margin|size|width|height|inset/i.test(group)) {
    return SPACING_RE.exec(cls)?.[1] ?? null
  }
  return null
}

/**
 * Swap the single utility of the token's family in `classList` to `tokenName`,
 * returning the new class string — or null when it's ambiguous (zero or >1
 * matches) or the token name isn't a safe suffix. Shared by both framework
 * adapters (T2). Supports color / radius / spacing-sizing families.
 */
export function swapTailwindClass(
  classList: string,
  group: string,
  tokenName: string
): string | null {
  if (!SAFE_CLASS_SUFFIX.test(tokenName)) return null
  const classes = classList.split(/\s+/).filter(Boolean)
  const matches = classes
    .map((c) => ({ c, fam: classFamilyForGroup(c, group) }))
    .filter((x) => x.fam != null)
  if (matches.length !== 1) return null
  const { c, fam } = matches[0]
  return classes.map((x) => (x === c ? `${fam}-${tokenName}` : x)).join(' ')
}
