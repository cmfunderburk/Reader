import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CorpusAPI, LibraryAPI, SecureKeysAPI } from '../types/electron';
import { installNativeBridge } from './nativeBridge';

function resetGlobals(): void {
  delete window.library;
  delete window.corpus;
  delete window.secureKeys;
  delete (window as { __TAURI__?: unknown }).__TAURI__;
  delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
}

afterEach(() => {
  resetGlobals();
});

describe('nativeBridge', () => {
  it('installs bridge APIs from Tauri invoke', async () => {
    const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
      if (command === 'library_get_sources') return [];
      if (command === 'library_list_books') return [{ ...args, name: 'sample.txt' }];
      if (command === 'library_open_book') return { title: 'sample', content: 'body' };
      if (command === 'library_add_source') return null;
      if (command === 'library_remove_source') return null;
      if (command === 'library_select_directory') return '/tmp/library';
      if (command === 'library_export_manifest') return { status: 'exported', path: '/tmp/manifest.json', sourceCount: 1, entryCount: 10 };
      if (command === 'library_import_manifest') return { status: 'imported', added: 1, existing: 0, missing: 0 };
      if (command === 'corpus_get_info') return { wiki: { easy: { available: true, totalArticles: 1 } } };
      if (command === 'corpus_sample_article') return { title: 't', text: 'x', domain: 'wiki', fk_grade: 5, words: 10, sentences: 1 };
      if (command === 'secure_keys_is_available') return false;
      if (command === 'secure_keys_get') return null;
      if (command === 'secure_keys_set') return null;
      return null;
    });
    (window as { __TAURI__?: unknown }).__TAURI__ = {
      core: { invoke },
    };

    installNativeBridge();

    expect(window.library).toBeDefined();
    expect(window.corpus).toBeDefined();
    expect(window.secureKeys).toBeDefined();

    await expect(window.library!.getSources()).resolves.toEqual([]);
    await expect(window.library!.listBooks('/tmp/books')).resolves.toEqual([{ dirPath: '/tmp/books', name: 'sample.txt' }]);
    await expect(window.library!.openBook('/tmp/books/sample.txt')).resolves.toEqual({ title: 'sample', content: 'body' });
    await expect(window.library!.addSource({ name: 'A', path: '/tmp/a' })).resolves.toBeNull();
    await expect(window.library!.removeSource('/tmp/a')).resolves.toBeNull();
    await expect(window.library!.selectDirectory()).resolves.toBe('/tmp/library');
    await expect(window.library!.exportManifest()).resolves.toEqual({
      status: 'exported',
      path: '/tmp/manifest.json',
      sourceCount: 1,
      entryCount: 10,
    });
    await expect(window.library!.importManifest()).resolves.toEqual({
      status: 'imported',
      added: 1,
      existing: 0,
      missing: 0,
    });
    await expect(window.corpus!.getInfo()).resolves.toEqual({ wiki: { easy: { available: true, totalArticles: 1 } } });
    await expect(window.corpus!.sampleArticle('wiki', 'easy')).resolves.toEqual({
      title: 't',
      text: 'x',
      domain: 'wiki',
      fk_grade: 5,
      words: 10,
      sentences: 1,
    });
    await expect(window.secureKeys!.isAvailable()).resolves.toBe(false);
    await expect(window.secureKeys!.get('comprehension-gemini')).resolves.toBeNull();
    await expect(window.secureKeys!.set('comprehension-gemini', 'secret')).resolves.toBeNull();

    expect(invoke).toHaveBeenCalledWith('library_get_sources');
    expect(invoke).toHaveBeenCalledWith('library_list_books', { dirPath: '/tmp/books' });
    expect(invoke).toHaveBeenCalledWith('library_open_book', { filePath: '/tmp/books/sample.txt' });
    expect(invoke).toHaveBeenCalledWith('library_add_source', { source: { name: 'A', path: '/tmp/a' } });
    expect(invoke).toHaveBeenCalledWith('library_remove_source', { sourcePath: '/tmp/a' });
    expect(invoke).toHaveBeenCalledWith('library_select_directory');
    expect(invoke).toHaveBeenCalledWith('library_export_manifest');
    expect(invoke).toHaveBeenCalledWith('library_import_manifest');
    expect(invoke).toHaveBeenCalledWith('corpus_get_info');
    expect(invoke).toHaveBeenCalledWith('corpus_sample_article', { family: 'wiki', tier: 'easy' });
    expect(invoke).toHaveBeenCalledWith('secure_keys_is_available');
    expect(invoke).toHaveBeenCalledWith('secure_keys_get', { keyId: 'comprehension-gemini' });
    expect(invoke).toHaveBeenCalledWith('secure_keys_set', {
      keyId: 'comprehension-gemini',
      value: 'secret',
    });
  });

  it('preserves Electron preload APIs when they already exist', () => {
    const existingLibrary = {
      getSources: vi.fn(),
      listBooks: vi.fn(),
      openBook: vi.fn(),
      addSource: vi.fn(),
      removeSource: vi.fn(),
      selectDirectory: vi.fn(),
      exportManifest: vi.fn(),
      importManifest: vi.fn(),
    } as unknown as LibraryAPI;
    const existingCorpus = {
      getInfo: vi.fn(),
      sampleArticle: vi.fn(),
    } as unknown as CorpusAPI;
    const existingSecureKeys = {
      isAvailable: vi.fn(),
      get: vi.fn(),
      set: vi.fn(),
    } as unknown as SecureKeysAPI;

    window.library = existingLibrary;
    window.corpus = existingCorpus;
    window.secureKeys = existingSecureKeys;
    (window as { __TAURI__?: unknown }).__TAURI__ = {
      core: { invoke: vi.fn() },
    };

    installNativeBridge();

    expect(window.library).toBe(existingLibrary);
    expect(window.corpus).toBe(existingCorpus);
    expect(window.secureKeys).toBe(existingSecureKeys);
  });
});
