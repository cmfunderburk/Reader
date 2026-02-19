import type {
  CorpusAPI,
  CorpusFamily,
  CorpusTier,
  LibraryAPI,
  LibrarySource,
  SecureKeysAPI,
  ApiKeyId,
} from '../types/electron';

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

interface TauriWindow extends Window {
  __TAURI__?: {
    core?: {
      invoke?: TauriInvoke;
    };
  };
  __TAURI_INTERNALS__?: {
    invoke?: TauriInvoke;
  };
}

function resolveTauriInvoke(win: TauriWindow): TauriInvoke | null {
  return win.__TAURI__?.core?.invoke ?? win.__TAURI_INTERNALS__?.invoke ?? null;
}

function createLibraryApi(invoke: TauriInvoke): LibraryAPI {
  return {
    getSources: () => invoke('library_get_sources'),
    listBooks: (dirPath: string) => invoke('library_list_books', { dirPath }),
    openBook: (filePath: string) => invoke('library_open_book', { filePath }),
    addSource: (source: LibrarySource) => invoke('library_add_source', { source }),
    removeSource: (sourcePath: string) => invoke('library_remove_source', { sourcePath }),
    selectDirectory: () => invoke('library_select_directory'),
    exportManifest: () => invoke('library_export_manifest'),
    importManifest: () => invoke('library_import_manifest'),
  };
}

function createCorpusApi(invoke: TauriInvoke): CorpusAPI {
  return {
    getInfo: () => invoke('corpus_get_info'),
    sampleArticle: (family: CorpusFamily, tier: CorpusTier) =>
      invoke('corpus_sample_article', { family, tier }),
  };
}

function createSecureKeysApi(invoke: TauriInvoke): SecureKeysAPI {
  return {
    isAvailable: () => invoke('secure_keys_is_available'),
    get: (keyId: ApiKeyId) => invoke('secure_keys_get', { keyId }),
    set: (keyId: ApiKeyId, value: string | null) => invoke('secure_keys_set', { keyId, value }),
  };
}

export function installNativeBridge(): void {
  if (typeof window === 'undefined') return;
  const win = window as TauriWindow;

  // Electron preload owns these bridges when running in Electron.
  if (win.library && win.corpus && win.secureKeys) return;

  const invoke = resolveTauriInvoke(win);
  if (!invoke) return;

  if (!win.library) {
    win.library = createLibraryApi(invoke);
  }
  if (!win.corpus) {
    win.corpus = createCorpusApi(invoke);
  }
  if (!win.secureKeys) {
    win.secureKeys = createSecureKeysApi(invoke);
  }
}
