import type { Token, TokenSet } from '../../../shared/api'

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

const isColor = (v: string): boolean => /^(#|rgb|hsl|oklch|color\()/i.test(v.trim())

/**
 * The detected design-token palette (read-only). Tokens are project-level —
 * dsgn picks the source per repo (curated manifest → Tailwind → CSS vars).
 * Clicking a token seeds the chat to apply it to the selected element.
 */
export default function TokenPalette({ tokenSet, onPick }: Props): React.JSX.Element {
  return (
    <div className="tokens">
      <div className="tokens__source">
        from {SOURCE_LABEL[tokenSet.source] ?? tokenSet.source}
        {tokenSet.origin ? ` · ${tokenSet.origin}` : ''}
      </div>
      {tokenSet.groups.map((g) => (
        <div key={g.name} className="tokens__group">
          <div className="tokens__gname">{g.name}</div>
          <div className="tokens__items">
            {g.tokens.map((t) => (
              <button
                key={t.name}
                className="tokens__item"
                title={`${t.name}: ${t.value} — apply to the selected element`}
                onClick={() => onPick(g.name, t)}
              >
                {isColor(t.value) ? (
                  <span className="tokens__swatch" style={{ background: t.value }} />
                ) : (
                  <span className="tokens__val">{t.value}</span>
                )}
                <span className="tokens__tname">{t.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
