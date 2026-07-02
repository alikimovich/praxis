import { Button } from '@/Button'

// <Button> imported via the `@/*` tsconfig path alias (not a relative import).
// Cross-file prop resolution must follow the alias to Button.tsx's schema.
export function AliasCard(): JSX.Element {
  return <Button kind="primary" label="Go" />
}
