import type { BookState } from '../types';

const STORAGE_KEY = 'reader:book_states';

export function generateBookId(title: string, chapterCount: number, firstChapterTitle?: string): string {
  // Simple deterministic hash — combine title + chapter count + first chapter title
  let hash = 0;
  const str = `${title}::${chapterCount}::${firstChapterTitle ?? ''}`;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return `book_${Math.abs(hash).toString(36)}`;
}

function loadAll(): Record<string, BookState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, BookState>;
  } catch {
    return {};
  }
}

function saveAll(states: Record<string, BookState>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
}

export function loadBookState(bookId: string): BookState | null {
  const all = loadAll();
  return all[bookId] ?? null;
}

export function saveBookState(bookId: string, state: BookState): void {
  const all = loadAll();
  all[bookId] = state;
  saveAll(all);
}

/** @internal Exposed for tests only */
export function deleteBookState(bookId: string): void {
  const all = loadAll();
  delete all[bookId];
  saveAll(all);
}
