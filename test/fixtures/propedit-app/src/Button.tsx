interface ButtonProps {
  /** Visual weight. */
  kind: 'primary' | 'ghost'
  /** Button text. */
  label: string
  disabled?: boolean
}

export function Button(props: ButtonProps): JSX.Element {
  return <button disabled={props.disabled}>{props.label}</button>
}
