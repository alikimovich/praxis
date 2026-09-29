import { app } from '../native/platform'
import { nativeSessionPath } from '../native/profile-path'
import type { ProviderConnection, ProviderConnectionInput } from '../shared/api'
import { type CatalogBackend, type CatalogModel, createModelCatalog, type ModelCatalog } from './model-catalog'
import { createProviderStore, type ProviderStore } from './providers-store'

/**
 * Who writes the provider data (LKM-102): the v10 connections store with its encrypted
 * keys (`providers.json`), the built-in seats' model catalog cache (`model-catalog.json`)
 * and the Codex model probe. The service's provider owner does
 * (`service/ProviderData.swift`, installed by `native/index.ts`), the only writer since
 * LKM-111 removed the Bun twins; Bun only reads the two files.
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

function dataOwner(): ProviderDataOwner {
  if (!owner) throw new Error('Trezi’s service is not running, so provider connections cannot be changed.')
  return owner
}

/** The connections store: reads are Bun's; writes and keys go to the owner. */
export const connectionStore = {
  list: (): ProviderConnection[] => reader().list(),
  get: (id: string): ProviderConnection | null => reader().get(id),
  save: async (input: ProviderConnectionInput): Promise<ProviderConnection> => dataOwner().save(input),
  remove: async (id: string): Promise<void> => dataOwner().remove(id),
  /** null when there is no key, it cannot be decrypted, or there is no service. */
  secretFor: async (id: string): Promise<string | null> => (owner ? owner.secretFor(id).catch(() => null) : null)
}

/** Lazy for the same reason as the store: `getDataDir` isn't final until registration. */
export function modelCatalog(): ModelCatalog {
  catalog ??= createModelCatalog({
    baseDir: getDataDir(),
    persist: (backend, models) => {
      if (!owner) return false // no service: this run keeps the list in memory
      void owner.saveCatalog(backend, models).catch(() => false)
      return true
    }
  })
  return catalog
}

/** [] on any failure, including no service: the picker keeps its cached list. */
export function codexModels(): Promise<CatalogModel[]> {
  return owner ? owner.codexModels().catch(() => []) : Promise.resolve([])
}

function reader(): ProviderStore {
  store ??= createProviderStore(getDataDir())
  return store
}
