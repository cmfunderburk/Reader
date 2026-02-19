import type { CorpusAPI, LibraryAPI, SecureKeysAPI } from '../../shared/electron-contract'

export type * from '../../shared/electron-contract'

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>

declare global {
  interface Window {
    library?: LibraryAPI
    corpus?: CorpusAPI
    secureKeys?: SecureKeysAPI
    __TAURI__?: {
      core?: {
        invoke?: TauriInvoke
      }
    }
    __TAURI_INTERNALS__?: {
      invoke?: TauriInvoke
    }
  }
}
