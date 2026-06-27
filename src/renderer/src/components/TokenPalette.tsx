import type { Token, TokenSet } from '../../../shared/api'
import { Button } from '@/components/ui/button'

interface Props {
  tokenSet: TokenSet
  /** Apply a token to the selected element (seeds the chat). */
  onPick: (group: string, token: Token) => void
}

const SOURCE_LABEL: Record<string, string> = {
  manifest: 'manifest',
  tailwind: 'Tailwind',
  css: 'CSS variables'
}

// Render a swatch for anything the browser accepts as a color (covers named
// colors, hsl/oklch, etc.) or a gradient; everything else shows as a text chip.
const isColor = (v: string): boolean => {
  const s = v.trim()
  if (/gradient\(/i.test(s)) return true
  try {
    return CSS.supports('color', s)
  } catch {
    return /^(#|rgb|hsl|oklch|color\()/i.test(s)
  }
}

// Cap how many tokens we render per group (large themes re-declare full scales).
const MAX_PER_GROUP = 60

/**
 * The detected design-token palette (read-only). Tokens are project-level —
 * dsgn picks the source per repo (curated manifest → Tailwind → CSS vars).
 * Clicking a token seeds the chat to apply it to the selected element.
 */
export default function TokenPalette({ tokenSet, onPick }: Props): React.JSX.Element {
  return (
    <div className="tokens flex max-h-[220px] flex-col gap-[7px] overflow-y-auto py-0.5">
      <div className="tokens__source text-[10.5px] italic text-muted-foreground">
        from {SOURCE_LABEL[tokenSet.source] ?? tokenSet.source}
        {tokenSet.origin ? ` · ${tokenSet.origin}` : ''}
      </div>
      {tokenSet.groups.map((g) => (
        <div key={g.name} className="tokens__group">
          <div className="tokens__gname mb-1 text-[10px] uppercase tracking-[0.04em] text-muted-foreground">
            {g.name}
          </div>
          <div className="tokens__items flex flex-wrap gap-[5px]">
            {g.tokens.slice(0, MAX_PER_GROUP).map((t) => (
              <Button
                key={t.name}
                variant="outline"
                size="sm"
                className="tokens__item h-auto max-w-full gap-[5px] py-[3px] pl-1 pr-[7px] text-[11px] font-normal"
                title={`${t.name}: ${t.value} — apply to the selected element`}
                onClick={() => onPick(g.name, t)}
              >
                {isColor(t.value) ? (
                  <span
                    className="tokens__swatch size-[13px] shrink-0 rounded-[3px] border border-black/10"
                    style={{ background: t.value }}
                  />
                ) : (
                  <span className="tokens__val px-0.5 font-mono text-[10px] text-muted-foreground">
                    {t.value}
                  </span>
                )}
                <span className="tokens__tname max-w-[130px] overflow-hidden text-ellipsis whitespace-nowrap font-mono">
                  {t.name}
                </span>
              </Button>
            ))}
            {g.tokens.length > MAX_PER_GROUP && (
              <span className="tokens__more self-center text-[10.5px] text-muted-foreground">
                +{g.tokens.length - MAX_PER_GROUP} more
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
