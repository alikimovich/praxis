import type { RowCtx } from './row-ctx'
import { ColorRow } from './rows/ColorRow'
import { NumberRow, SideRows } from './rows/NumberRow'
import { ChipRow, StyleGroup } from './rows/primitives'

const FLEX_GRID = new Set(['flex', 'grid', 'inline-flex', 'inline-grid'])

/** Display only declarations present on the selected element unless explicitly expanded. */
export default function AuthoredStyleGroups({
  ctx,
  visible,
  seedStyleEdit
}: {
  ctx: RowCtx
  visible: (prop: string) => boolean
  seedStyleEdit: (prop: string) => void
}): React.JSX.Element {
  const values = ctx.values
  const display = values.display ?? ''
  const any = (...props: string[]): boolean => props.some(visible)
  const sides = (base: string): string[] =>
    ['top', 'right', 'bottom', 'left'].map((side) => `${base}-${side}`).filter(visible)
  return (
    <>
      {any(
        'padding-top',
        'padding-right',
        'padding-bottom',
        'padding-left',
        'margin-top',
        'margin-right',
        'margin-bottom',
        'margin-left',
        'gap'
      ) && (
        <StyleGroup title="Layout">
          <SideRows base="padding" ctx={ctx} visibleProps={sides('padding')} />
          <SideRows base="margin" ctx={ctx} visibleProps={sides('margin')} />
          {visible('gap') && FLEX_GRID.has(display) && <NumberRow prop="gap" ctx={ctx} />}
        </StyleGroup>
      )}

      {any('color', 'background-color', 'border-radius', 'opacity') && (
        <StyleGroup title="Appearance">
          {visible('color') && (
            <ColorRow prop="color" ctx={ctx} onNeedsAgent={() => seedStyleEdit('color')} />
          )}
          {visible('background-color') && (
            <ColorRow
              prop="background-color"
              ctx={ctx}
              onNeedsAgent={() => seedStyleEdit('background-color')}
            />
          )}
          {visible('border-radius') && <NumberRow prop="border-radius" ctx={ctx} />}
          {visible('opacity') && <NumberRow prop="opacity" ctx={ctx} />}
        </StyleGroup>
      )}

      {any(
        'font-size',
        'font-weight',
        'line-height',
        'letter-spacing',
        'font-family',
        'display'
      ) && (
        <StyleGroup title="Typography">
          {visible('font-size') && <NumberRow prop="font-size" ctx={ctx} />}
          {visible('font-weight') && <NumberRow prop="font-weight" ctx={ctx} />}
          {visible('line-height') && <NumberRow prop="line-height" ctx={ctx} />}
          {visible('letter-spacing') && <NumberRow prop="letter-spacing" ctx={ctx} />}
          {visible('font-family') && (
            <ChipRow label="font-family" value={values['font-family'] ?? '—'} />
          )}
          {visible('display') && <ChipRow label="display" value={display || '—'} />}
        </StyleGroup>
      )}
    </>
  )
}
