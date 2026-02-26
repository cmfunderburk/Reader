import { describe, it, expect, beforeEach } from 'vitest';
import { loadBookState, saveBookState, deleteBookState, generateBookId } from './bookStorage';
import type { BookState } from '../types';

beforeEach(() => localStorage.clear());

describe('bookStorage', () => {
  it('saves and loads book state', () => {
    const state: BookState = {
      title: 'Test Book',
      lastChapterIndex: 3,
      lastWordIndex: 42,
      lastOpenedAt: Date.now(),
    };
    saveBookState('book-123', state);
    expect(loadBookState('book-123')).toEqual(state);
  });

  it('returns null for unknown book', () => {
    expect(loadBookState('unknown')).toBeNull();
  });

  it('generates deterministic book IDs', () => {
    const a = generateBookId('Test Book', 10);
    const b = generateBookId('Test Book', 10);
    expect(a).toBe(b);
  });

  it('generates different IDs for different books', () => {
    const a = generateBookId('Book A', 10);
    const b = generateBookId('Book B', 10);
    expect(a).not.toBe(b);
  });

  it('deletes book state', () => {
    saveBookState('book-123', { title: 'T', lastChapterIndex: 0, lastWordIndex: 0, lastOpenedAt: 0 });
    deleteBookState('book-123');
    expect(loadBookState('book-123')).toBeNull();
  });

  it('handles multiple books independently', () => {
    const state1: BookState = { title: 'Book 1', lastChapterIndex: 1, lastWordIndex: 10, lastOpenedAt: 100 };
    const state2: BookState = { title: 'Book 2', lastChapterIndex: 5, lastWordIndex: 50, lastOpenedAt: 200 };
    saveBookState('book-1', state1);
    saveBookState('book-2', state2);
    expect(loadBookState('book-1')).toEqual(state1);
    expect(loadBookState('book-2')).toEqual(state2);
  });

  it('overwrites existing state for same book ID', () => {
    const state1: BookState = { title: 'Book', lastChapterIndex: 1, lastWordIndex: 10, lastOpenedAt: 100 };
    const state2: BookState = { title: 'Book', lastChapterIndex: 3, lastWordIndex: 30, lastOpenedAt: 300 };
    saveBookState('book-1', state1);
    saveBookState('book-1', state2);
    expect(loadBookState('book-1')).toEqual(state2);
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem('reader:book_states', 'not-json');
    expect(loadBookState('any')).toBeNull();
  });
});
