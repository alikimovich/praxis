import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
export function nativePreferences(profile: string) {
  const path = join(profile, 'preferences.json')
  const values: Record<string, string | null> = Object.create(null)
  const valid = (key: unknown, value: unknown): key is string => typeof key === 'string' && /^(trezi|praxis)[:.]/.test(key) && key.length < 200 && (value === null || typeof value === 'string' && value.length <= 2_000_000)
  if (existsSync(path)) {
    const saved = JSON.parse(readFileSync(path, 'utf8'))
    if (saved.version !== 1 || typeof saved.values !== 'object' || !saved.values) throw new Error('Invalid native preferences file')
    for (const [key, value] of Object.entries(saved.values)) if (valid(key, value)) values[key] = value as string | null
  }
  // Canonical values win; retain original keys for rollback.
  for (const [key, value] of Object.entries(values)) {
    if (key.startsWith('praxis:') || key.startsWith('praxis.')) {
      const canonical = key.replace(/^praxis/, 'trezi')
      if (!Object.hasOwn(values, canonical)) values[canonical] = value
    }
  }
  return {
    snapshot: () => ({ ...values }),
    get: (key: string) => values[key.replace(/^praxis([:.])/, 'trezi$1')] ?? null,
    set(key: unknown, value: unknown, imported = false) {
      if (!valid(key, value)) throw new Error('Invalid native preference')
      const canonical = key.replace(/^praxis([:.])/, 'trezi$1')
      if (imported && Object.hasOwn(values, canonical)) return
      const next = { ...values, [canonical]: value }
      writeFileSync(path + '.tmp', JSON.stringify({ version: 1, values: next }), { mode: 0o600 })
      renameSync(path + '.tmp', path)
      values[canonical] = value as string | null
    }
  }
}
