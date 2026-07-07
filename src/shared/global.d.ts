import type { DsgnApi } from './api'

declare global {
  interface Window {
    api: DsgnApi
  }
}

export {}
