import { app } from '../native/platform'
import { safeStorage } from '../native/platform-legacy'
import { nativeSessionPath } from '../native/profile-path'
import type { ProviderConnection, ProviderConnectionInput } from '../shared/api'
import { discoverCodexModels } from './codex-models'
import { type CatalogBackend, type CatalogModel, createModelCatalog, type ModelCatalog } from './model-catalog'
import { createProviderStore, type ProviderStore, type SecretCipher } from './providers-store'

/**
 * Who writes the provider data (LKM-102): the v10 connections store with its encrypted
 * keys (`providers.json`), the built-in seats' model catalog cache (`model-catalog.json`)
 * and the Codex model probe. Under the Swift launch the service's provider owner does
 * (`service/ProviderData.swift`, installed by `native/index.ts`); Bun only reads the two
 * files. With no Swift owner (`TREZI_BACKEND_OWNER=legacy`, unit tests) the rollback
 * twins write them: `providers-store.ts`, `model-catalog.ts` and `codex-models.ts`, with
 * the same bytes, so either writer can pick up the other's files.
 *
 * KEY DISCIPLINE is unchanged: a plaintext key only ever comes back from `secretFor`,
 * in main, for a catalog probe, a chat turn or Jev.
 */
export interface ProviderDataOwner {
  readonly kind: 'swift'
  /** Throws a user-readable message for a bad draft or an un-storable key. */
  save(input: ProviderConnectionInput): Promise<ProviderConnection>
  remove(id: string): Promise<void>
  secretFor(id: string): Promise<string | null>
  /** Persists a discovered list; false when it could not be written. */
  saveCatalog(backend: CatalogBackend, models: CatalogModel[]): Promise<boolean>
  /** `codex debug models`, parsed; [] on any failure. */
  codexModels(): Promise<CatalogModel[]>
}

let owner: ProviderDataOwner | null = null

/** Installed once by the native entry point when the Swift service is supervising Bun. */
export function setProviderDataOwner(next: ProviderDataOwner | null): void {
  owner = next
}

/**
 * `safeStorage` gives us Buffers; the store keeps plain JSON, so blobs ride as
 * base64. `available` is a GETTER on purpose: `isEncryptionAvailable()` can flip
 * with the session's keyring, so it has to be asked at save time rather than
 * captured at import. A `basic_text` backend (a hardcoded, non-secret key) is not
 * what the UI promises ("encrypted with the system keychain"), so it counts as
 * unavailable.
 */
const cipher: SecretCipher = {
  get available(): boolean {
    try {
      if (!safeStorage.isEncryptionAvailable()) return false
      return safeStorage.getSelectedStorageBackend?.() !== 'basic_text'
    } catch {
      return false
    }
  },
  encrypt: (plain: string): string => safeStorage.encryptString(plain).toString('base64'),
  decrypt: (blob: string): string | null => {
    try {
      return safeStorage.decryptString(Buffer.from(blob, 'base64'))
    } catch {
      return null
    }
  }
}

/**
 * The data dir is INJECTED by `registerProviderIpc` (agent.ts hands over its own
 * `dataDir()`) rather than recomputed here: agent.ts's version also performs the
 * one-time `<userData>/dsgn` → `trezi` migration, which creating the dir first
 * would skip forever.
 */
let getDataDir: () => string = () => nativeSessionPath(app.getPath('userData'))
let store: ProviderStore | null = null
let catalog: ModelCatalog | null = null

export function setProviderDataDir(dataDir: () => string): void {
  getDataDir = dataDir
  store = null
  catalog = null
}

/** The connections store: reads are Bun's; writes and keys go to the owner when one is installed. */
export const connectionStore = {
  list: (): ProviderConnection[] => legacyStore().list(),
  get: (id: string): ProviderConnection | null => legacyStore().get(id),
  save: async (input: ProviderConnectionInput): Promise<ProviderConnection> =>
    owner ? owner.save(input) : legacyStore().save(input),
  remove: async (id: string): Promise<void> => (owner ? owner.remove(id) : legacyStore().remove(id)),
  secretFor: async (id: string): Promise<string | null> =>
    owner ? owner.secretFor(id).catch(() => null) : legacyStore().secretFor(id)
}

/** Lazy for the same reason as the store: `getDataDir` isn't final until registration. */
export function modelCatalog(): ModelCatalog {
  catalog ??= createModelCatalog({
    baseDir: getDataDir(),
    persist: (backend, models) => {
      if (!owner) return false
      void owner.saveCatalog(backend, models).catch(() => false)
      return true
    }
  })
  return catalog
}

export function codexModels(): Promise<CatalogModel[]> {
  return owner ? owner.codexModels().catch(() => []) : discoverCodexModels()
}

function legacyStore(): ProviderStore {
  store ??= createProviderStore(getDataDir(), cipher)
  return store
}
