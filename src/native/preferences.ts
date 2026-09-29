import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type PreferenceEntry = [key: string, value: string | null]
export type PreferenceBatch = PreferenceEntry[] | ((values: Readonly<Record<string, string | null>>) => PreferenceEntry[])
/** Reads come from the last acknowledged state; writes resolve only once committed. */
export interface NativePreferences {
  snapshot(): Record<string, string | null>
  get(key: string): string | null
  /** One atomic batch: every entry is written, or none is. */
  apply(batch: PreferenceBatch): Promise<void>
  set(key: string, value: string | null): Promise<void>
  /** Called when the stored values change without a local write (e.g. an adopted external edit). */
  subscribe(listener: () => void): void
}

// Lengths are UTF-16 code units (JS `.length`); the Swift owner counts the same way.
export const validPreference = (key: unknown, value: unknown): key is string => typeof key === 'string' && /^(trezi|praxis)[:.]/.test(key) && key.length < 200 && (value === null || typeof value === 'string' && value.length <= 2_000_000)
export const canonicalPreference = (key: string) => key.replace(/^praxis([:.])/, 'trezi$1')
export function resolveBatch(batch: PreferenceBatch, values: Readonly<Record<string, string | null>>): PreferenceEntry[] {
  const entries = typeof batch === 'function' ? batch(values) : batch
  if (!entries.length) throw new Error('Empty preferences batch')
  for (const [key, value] of entries) if (!validPreference(key, value)) throw new Error('Invalid native preference')
  return entries
}

/** The Bun writer of the v1 file: the `TREZI_BACKEND_OWNER=legacy` rollback owner. */
export function nativePreferences(profile: string): NativePreferences {
  const path = join(profile, 'preferences.json')
  const values: Record<string, string | null> = Object.create(null)
  if (existsSync(path)) {
    const saved = JSON.parse(readFileSync(path, 'utf8'))
    if (saved.version !== 1 || typeof saved.values !== 'object' || !saved.values) throw new Error('Invalid native preferences file')
    for (const [key, value] of Object.entries(saved.values)) if (validPreference(key, value)) values[key] = value as string | null
  }
  // Canonical values win; retain original keys for rollback.
  for (const [key, value] of Object.entries(values)) {
    if (key.startsWith('praxis:') || key.startsWith('praxis.')) {
      const canonical = canonicalPreference(key)
      if (!Object.hasOwn(values, canonical)) values[canonical] = value
    }
  }
  const store: NativePreferences = {
    snapshot: () => ({ ...values }),
    get: key => values[canonicalPreference(key)] ?? null,
    async apply(batch) {
      const next = { ...values }
      for (const [key, value] of resolveBatch(batch, values)) next[canonicalPreference(key)] = value
      writeFileSync(path + '.tmp', JSON.stringify({ version: 1, values: next }), { mode: 0o600 })
      renameSync(path + '.tmp', path)
      Object.assign(values, next)
    },
    set: (key, value) => store.apply([[key, value]]),
    subscribe() {}
  }
  return store
}
