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
