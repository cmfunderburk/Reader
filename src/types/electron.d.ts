import type { CorpusAPI, LibraryAPI } from '../../shared/electron-contract'

export type * from '../../shared/electron-contract'

declare global {
  interface Window {
    library?: LibraryAPI
    corpus?: CorpusAPI
  }
}
