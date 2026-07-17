/**
 * tw-styles unit test (pure — no Electron). The css-prop → Tailwind mapping
 * behind the Styles panel's S1 commit strategy: named-scale snap vs arbitrary
 * value, single-family class rewrite (replace / append / ambiguous → null),
 * variant-prefix immunity, font-family non-interference, and the
 * looksTailwind heuristic. Run with: bun run test:tw-styles
 */
import { tailwindClassFor, rewriteClassList, looksTailwind } from '../src/main/tw-styles.ts'

let failed = 0
const ok = (cond, msg) => {
  if (!cond) {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}
const eq = (actual, expected, msg) =>
  ok(actual === expected, `${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)

// --- tailwindClassFor: every family, snap vs arbitrary ---

// spacing (padding/margin/gap): n%4==0 → scale, else arbitrary; side suffixes
eq(tailwindClassFor('padding', '16px'), 'p-4', 'padding 16px snaps')
eq(tailwindClassFor('padding', '13px'), 'p-[13px]', 'padding 13px arbitrary')
eq(tailwindClassFor('padding', '0px'), 'p-0', 'padding 0 snaps to p-0')
eq(tailwindClassFor('padding-top', '8px'), 'pt-2', 'padding-top side prefix')
eq(tailwindClassFor('padding-left', '5px'), 'pl-[5px]', 'padding-left arbitrary')
eq(tailwindClassFor('margin', '24px'), 'm-6', 'margin snaps')
eq(tailwindClassFor('margin-bottom', '-8px'), 'mb-[-8px]', 'negative margin goes arbitrary')
eq(tailwindClassFor('gap', '12px'), 'gap-3', 'gap snaps')
eq(tailwindClassFor('column-gap', '10px'), 'gap-x-[10px]', 'column-gap arbitrary')

// border-radius
eq(tailwindClassFor('border-radius', '8px'), 'rounded-lg', 'radius 8px snaps')
eq(tailwindClassFor('border-radius', '9999px'), 'rounded-full', 'radius full snaps')
eq(tailwindClassFor('border-radius', '13px'), 'rounded-[13px]', 'radius 13px arbitrary')

// colors: always arbitrary (computed values are hex/rgb, never palette names)
eq(tailwindClassFor('color', '#3b82f6'), 'text-[#3b82f6]', 'color hex')
eq(tailwindClassFor('background-color', '#fff'), 'bg-[#fff]', 'bg hex')
eq(
  tailwindClassFor('background-color', 'rgb(255, 0, 0)'),
  'bg-[rgb(255,0,0)]',
  'rgb commas: spaces dropped'
)
eq(
  tailwindClassFor('color', 'rgb(255 0 0)'),
  'text-[rgb(255_0_0)]',
  'space-separated rgb: underscores'
)

// opacity
eq(tailwindClassFor('opacity', '0.5'), 'opacity-50', 'opacity 0.5 snaps')
eq(tailwindClassFor('opacity', '1'), 'opacity-100', 'opacity 1 snaps')
eq(tailwindClassFor('opacity', '0.37'), 'opacity-[0.37]', 'opacity 0.37 arbitrary')

// font-size
eq(tailwindClassFor('font-size', '14px'), 'text-sm', 'font-size 14px snaps')
eq(tailwindClassFor('font-size', '24px'), 'text-2xl', 'font-size 24px snaps')
eq(tailwindClassFor('font-size', '13px'), 'text-[13px]', 'font-size 13px arbitrary')

// font-weight
eq(tailwindClassFor('font-weight', '600'), 'font-semibold', 'weight 600 snaps')
eq(tailwindClassFor('font-weight', 'bold'), 'font-bold', 'weight keyword bold')
eq(tailwindClassFor('font-weight', '550'), 'font-[550]', 'weight 550 arbitrary')

// line-height
eq(tailwindClassFor('line-height', '1.5'), 'leading-normal', 'unitless keyword snap')
eq(tailwindClassFor('line-height', '28px'), 'leading-7', 'px multiple of 4 snaps')
eq(tailwindClassFor('line-height', '1.4'), 'leading-[1.4]', 'unitless arbitrary')

// letter-spacing
eq(tailwindClassFor('letter-spacing', '0.025em'), 'tracking-wide', 'em keyword snap')
eq(tailwindClassFor('letter-spacing', '0px'), 'tracking-normal', 'zero → normal')
eq(tailwindClassFor('letter-spacing', '0.5px'), 'tracking-[0.5px]', 'px arbitrary')

// duration/delay: snap set {75,100,150,200,300,500,700,1000}
eq(tailwindClassFor('transition-duration', '150ms'), 'duration-150', 'duration snaps')
eq(tailwindClassFor('transition-duration', '0.3s'), 'duration-300', 'seconds normalize to ms')
eq(tailwindClassFor('transition-duration', '123ms'), 'duration-[123ms]', 'off-scale arbitrary')
eq(tailwindClassFor('transition-delay', '75ms'), 'delay-75', 'delay snaps')
eq(tailwindClassFor('transition-delay', '40ms'), 'delay-[40ms]', 'delay arbitrary')

// timing function: keyword/canonical-bezier snap, else arbitrary with NO spaces
eq(tailwindClassFor('transition-timing-function', 'linear'), 'ease-linear', 'linear')
eq(tailwindClassFor('transition-timing-function', 'ease-in-out'), 'ease-in-out', 'keyword')
eq(
  tailwindClassFor('transition-timing-function', 'cubic-bezier(0.4, 0, 0.2, 1)'),
  'ease-in-out',
  'canonical bezier snaps to keyword'
)
eq(
  tailwindClassFor('transition-timing-function', 'cubic-bezier(.17, .67, .83, .67)'),
  'ease-[cubic-bezier(.17,.67,.83,.67)]',
  'custom bezier arbitrary, no spaces'
)

// transition-property
eq(tailwindClassFor('transition-property', 'all'), 'transition-all', 'property all')
eq(tailwindClassFor('transition-property', 'none'), 'transition-none', 'property none')
eq(tailwindClassFor('transition-property', 'opacity'), 'transition-opacity', 'property opacity')
eq(tailwindClassFor('transition-property', 'transform'), 'transition-transform', 'property transform')
eq(tailwindClassFor('transition-property', 'box-shadow'), 'transition-shadow', 'property shadow')
eq(
  tailwindClassFor('transition-property', 'color, background-color, border-color, fill, stroke'),
  'transition-colors',
  'color list → transition-colors'
)
eq(
  tailwindClassFor('transition-property', 'opacity, transform'),
  'transition-[opacity,transform]',
  'mixed list arbitrary'
)

// unknown prop / hostile value
eq(tailwindClassFor('width', '100px'), null, 'prop outside the v1 set → null')
eq(tailwindClassFor('color', 'red] hover:[x'), null, 'bracket injection → null')

// --- rewriteClassList: replace / append / ambiguous ---

eq(rewriteClassList('flex p-2 text-sm', 'padding', '16px'), 'flex p-4 text-sm', 'replace scale class')
eq(rewriteClassList('flex text-sm', 'padding', '16px'), 'flex text-sm p-4', 'no match → append')
eq(rewriteClassList('p-2 p-6', 'padding', '16px'), null, '>1 family match → null')
eq(
  rewriteClassList('flex p-[13px]', 'padding', '16px'),
  'flex p-4',
  'arbitrary-value class of same family IS a replace candidate'
)
eq(
  rewriteClassList('rounded-lg border', 'border-radius', '13px'),
  'rounded-[13px] border',
  'named → arbitrary replace; bare border untouched'
)
eq(rewriteClassList('rounded p-2', 'border-radius', '8px'), 'rounded-lg p-2', 'bare rounded replaced')
eq(
  rewriteClassList('text-gray-500 text-sm', 'color', '#3b82f6'),
  'text-[#3b82f6] text-sm',
  'color rewrite ignores the size class sharing the text- prefix'
)
eq(
  rewriteClassList('text-gray-500 text-sm', 'font-size', '18px'),
  'text-gray-500 text-lg',
  'font-size rewrite ignores the color class'
)
eq(
  rewriteClassList('text-[#123456] font-bold', 'color', 'rgb(1, 2, 3)'),
  'text-[rgb(1,2,3)] font-bold',
  'arbitrary color replaced by arbitrary color'
)
eq(
  rewriteClassList('transition duration-150', 'transition-property', 'opacity'),
  'transition-opacity duration-150',
  'bare transition class is the property family'
)
eq(
  rewriteClassList('transition-all ease-in', 'transition-timing-function', 'linear'),
  'transition-all ease-linear',
  'ease family replaced'
)
eq(
  rewriteClassList('duration-300 delay-100', 'transition-delay', '150ms'),
  'duration-300 delay-150',
  'delay family independent of duration'
)
eq(rewriteClassList('opacity-50', 'opacity', '0.37'), 'opacity-[0.37]', 'opacity replace')
eq(rewriteClassList('leading-7', 'line-height', '1.5'), 'leading-normal', 'leading replace')
eq(rewriteClassList('tracking-wide', 'letter-spacing', '0.5px'), 'tracking-[0.5px]', 'tracking replace')
eq(rewriteClassList('-mt-2 flex', 'margin-top', '16px'), 'mt-4 flex', 'negative margin is a candidate')
eq(rewriteClassList('bg-blue-500', 'background-color', '#000'), 'bg-[#000]', 'bg palette replaced')
eq(rewriteClassList('p-2', 'width', '10px'), null, 'unmappable prop → null even with classes')

// --- variant-prefix immunity: never candidates, never blockers ---

eq(
  rewriteClassList('hover:p-6 p-2', 'padding', '16px'),
  'hover:p-6 p-4',
  'variant class not replaced, base class is'
)
eq(
  rewriteClassList('md:p-8 hover:p-6 flex', 'padding', '16px'),
  'md:p-8 hover:p-6 flex p-4',
  'only variant matches → not blockers, append'
)
eq(
  rewriteClassList('dark:hover:bg-gray-800 bg-white', 'background-color', '#eee'),
  'dark:hover:bg-gray-800 bg-[#eee]',
  'stacked variants skipped'
)

// --- font-family non-interference ---

eq(
  rewriteClassList('font-sans font-bold', 'font-weight', '500'),
  'font-sans font-medium',
  'font-sans neither candidate nor blocker'
)
eq(
  rewriteClassList('font-mono text-sm', 'font-weight', '600'),
  'font-mono text-sm font-semibold',
  'font-mono alone → append, never replaced'
)

// --- looksTailwind heuristic ---

ok(looksTailwind(['flex', 'items-center', 'p-4']), 'utility classes → true')
ok(looksTailwind(['text-gray-500']), 'single palette class → true')
ok(looksTailwind(['hover:bg-blue-600']), 'variant-prefixed utility → true')
ok(looksTailwind(['btn', 'p-[13px]']), 'arbitrary-value utility → true')
ok(!looksTailwind(['btn', 'btn-primary']), 'bootstrap-ish names → false')
ok(!looksTailwind(['card', 'header__nav', 'MuiButton-root']), 'BEM/MUI names → false')
ok(!looksTailwind(['my-custom-class']), 'my- prefix with wordy suffix is not spacing')
ok(!looksTailwind([]), 'empty list → false')

if (failed === 0) console.log('TW-STYLES OK — mapping/snap/rewrite/variants/heuristic')
else console.error(`TW-STYLES: ${failed} assertion(s) failed`)
process.exitCode = failed === 0 ? 0 : 1
