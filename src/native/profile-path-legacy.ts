import { mkdirSync, realpathSync, symlinkSync } from 'node:fs'

/**
 * The creating half of the rename migrations, the rollback twin of the service's
 * `ProfilePaths.swift` (LKM-102). Under either service launch (`TREZI_SERVICE_LOCKED=1`)
 * the service has already made both aliases (the launcher asks `TreziService
 * --resolve-profile`; the session alias is made under the profile lock before Bun
 * starts), so Bun refuses rather than writes. Only a run without the service (unit
 * tests) reaches the writes below.
 */
function refuseUnderService(): void {
  if (process.env.TREZI_SERVICE_LOCKED === '1')
    throw new Error('The Trezi service did not migrate this profile; quit and reopen Trezi. No data was changed.')
}

/** `<support>/Trezi Native` → `Praxis Native` (relative, so the pair can move together). */
export function aliasLegacyProfile(support: string, current: string, legacy: string): void {
  refuseUnderService()
  mkdirSync(support, { recursive: true })
  try { symlinkSync('Praxis Native', current, 'dir') } catch (e: any) {
    if (e.code !== 'EEXIST' || realpathSync(current) !== realpathSync(legacy)) throw e
  }
}

/** `<profile>/trezi` → the real `praxis`/`dsgn` store. */
export function aliasLegacySessions(current: string, legacy: string): void {
  refuseUnderService()
  try { symlinkSync(realpathSync(legacy), current, 'dir') } catch (e: any) {
    if (e.code !== 'EEXIST' || realpathSync(current) !== realpathSync(legacy)) throw e
  }
}
