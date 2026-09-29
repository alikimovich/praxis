/** Named groups of the native smoke, selected with `--only=group,group`
 *  (`bun run dev:native --test --only=core,chat`). Selection only chooses which
 *  groups run; the startup → open-project → chat-ready prelude always runs because
 *  every group builds on it. No flag runs every group. Pure. */
export const NATIVE_SMOKE_GROUPS = ['core', 'islands', 'shadow-light', 'sidebar', 'settings', 'chat', 'composer'] as const
export type NativeSmokeGroup = (typeof NATIVE_SMOKE_GROUPS)[number]

const known = (name: string): name is NativeSmokeGroup => (NATIVE_SMOKE_GROUPS as readonly string[]).includes(name)

/** The groups named by argv's `--only=` flag, or every group when it is absent.
 *  Throws a message naming the valid groups for an unknown or empty selection. */
export function parseSmokeGroups(argv: readonly string[]): Set<NativeSmokeGroup> {
  const flags = argv.filter(arg => arg === '--only' || arg.startsWith('--only='))
  if (!flags.length) return new Set(NATIVE_SMOKE_GROUPS)
  const list = NATIVE_SMOKE_GROUPS.join(', ')
  if (flags.length > 1) throw new Error(`--only may be given once; combine groups with commas. Known groups: ${list}`)
  const names = flags[0].slice('--only='.length).split(',').map(name => name.trim()).filter(Boolean)
  if (!names.length) throw new Error(`--only needs at least one group, e.g. --only=core,chat. Known groups: ${list}`)
  const unknown = names.filter(name => !known(name))
  if (unknown.length) throw new Error(`Unknown native smoke group${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Known groups: ${list}`)
  // The live turn edits the heading text that the core group's text edit writes.
  if (argv.includes('--live') && !names.includes('core')) throw new Error('--live needs the core group in --only')
  return new Set(names as NativeSmokeGroup[])
}
