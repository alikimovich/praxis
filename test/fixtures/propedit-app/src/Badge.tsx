interface BadgeProps {
  /** Visual style. */
  variant: 'ok' | 'warn' | 'error'
  /** Text shown inside the badge. */
  label: string
  /** Optional numeric counter. */
  count?: number
  /** Round the corners. */
  rounded?: boolean
}

export function Badge(props: BadgeProps): JSX.Element {
  return <span className="badge">{props.label}</span>
}

export function Demo(): JSX.Element {
  return <Badge variant="ok" label="Ready" count={3} rounded />
}

export function Inline(): JSX.Element {
  return <p className="row">Status <Badge variant="warn" label="Hi" /></p>
}

export function Heading(): JSX.Element {
  return <h1 className="title">Welcome</h1>
}

// v6 direct-edit fixtures: a TS-cast literal (`as const`) + a no-substitution
// template literal should read as plain literals, not `expression:true`.
export function Demo2(): JSX.Element {
  return <Badge variant={'ok' as const} label={`Go`} />
}

// A host element with a single literal inline-style color property — the T3
// token-style-swap target.
export function Swatch(): JSX.Element {
  return <span style={{ color: '#111827' }} className="sw">x</span>
}

// A non-color style property — a colors token must NOT swap this (property-name
// gating), even though '400' is a value; it must fall back to the agent.
export function Weighted(): JSX.Element {
  return <span style={{ fontWeight: '400' }} className="wt">x</span>
}

// T2: exactly one color utility (text-gray-500) → a tailwind color token swaps it.
export function TwColor(): JSX.Element {
  return <span className="text-gray-500 font-bold">tw</span>
}

// T2 guard: two color utilities → ambiguous → agent, no silent swap.
export function TwTwo(): JSX.Element {
  return <span className="text-gray-500 bg-blue-100">tw</span>
}

// T2 radius family: one rounded-* utility → a radius token swaps it (p-4 untouched).
export function TwRadius(): JSX.Element {
  return <div className="rounded-lg p-4">r</div>
}

// v8 F2: a component with DESTRUCTURING DEFAULTS — react-docgen surfaces
// `tone` default 'brand' and `dot` default false. The usage overrides both;
// "reset to default" removes the attribute so the value falls back to the default.
interface ChipProps {
  /** Visual tone. */
  tone?: 'neutral' | 'brand'
  /** Label text. */
  text: string
  /** Show the status dot. */
  dot?: boolean
}
export function Chip({ tone = 'brand', text, dot = false }: ChipProps): JSX.Element {
  return <span className="chip" data-tone={tone} data-dot={dot}>{text}</span>
}
export function ChipDemo(): JSX.Element {
  return <Chip tone="neutral" text="Hi" dot />
}

// Code-peek fixture: a multi-line element — the peek's elementStart/elementEnd
// must span the whole open→close range, not just the stamp line.
export function Tall(): JSX.Element {
  return (
    <div className="tall">
      <span>one</span>
    </div>
  )
}
