import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { loadEpubFromBuffer, type EpubBookData, type EpubChapter } from '../lib/epubParser';
import { sanitizeEpubHtml } from '../lib/htmlAnnotator';
import { generateBookId, loadBookState, saveBookState } from '../lib/bookStorage';

export type EpubReadingMode = 'browse' | 'pacer' | 'generation';
export type EpubViewMode = 'paged' | 'scroll';

export interface UseEpubReaderResult {
  /** The loaded book data, or null if no book is loaded */
  book: EpubBookData | null;
  /** Whether the book is currently loading */
  isLoading: boolean;
  /** Error message if loading failed */
  error: string | null;
  /** Current chapter index */
  currentChapterIndex: number;
  /** The current chapter object */
  currentChapter: EpubChapter | null;
  /** Sanitized HTML for the current chapter (used by all modes) */
  html: string;
  /** Current reading mode */
  mode: EpubReadingMode;
  /** Set reading mode */
  setMode: (mode: EpubReadingMode) => void;
  /** Load a book from an ArrayBuffer */
  loadBook: (buffer: ArrayBuffer) => Promise<void>;
  /** Navigate to a specific chapter */
  goToChapter: (index: number) => void;
  /** Go to the next chapter */
  nextChapter: () => void;
  /** Go to the previous chapter */
  prevChapter: () => void;
  /** Unload the current book */
  unloadBook: () => void;
  /** Current view mode (paged or scroll) */
  viewMode: EpubViewMode;
  /** Set the view mode */
  setViewMode: (mode: EpubViewMode) => void;
}

export function useEpubReader(): UseEpubReaderResult {
  const [book, setBook] = useState<EpubBookData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [mode, setMode] = useState<EpubReadingMode>('browse');
  const [viewMode, setViewMode] = useState<EpubViewMode>(() => {
    const saved = localStorage.getItem('reader:epub-view-mode');
    return saved === 'scroll' ? 'scroll' : 'paged';
  });
  const bookIdRef = useRef<string | null>(null);

  const currentChapter = book ? (book.chapters[currentChapterIndex] ?? null) : null;

  // Sanitized HTML — used by all modes (browse, pacer, generation).
  // Pacer uses Range-based line detection; generation masks text nodes directly.
  const html = useMemo(() => {
    if (!currentChapter) return '';
    return sanitizeEpubHtml(currentChapter.html, { resources: book?.resources });
  }, [currentChapter, book?.resources]);

  // Persist position on chapter change
  useEffect(() => {
    const id = bookIdRef.current;
    if (!id || !book) return;
    saveBookState(id, {
      title: book.title,
      lastChapterIndex: currentChapterIndex,
      lastWordIndex: 0,
      lastOpenedAt: Date.now(),
    });
  }, [currentChapterIndex, book]);

  // Persist view mode preference
  useEffect(() => {
    localStorage.setItem('reader:epub-view-mode', viewMode);
  }, [viewMode]);

  const loadBook = useCallback(async (buffer: ArrayBuffer) => {
    setIsLoading(true);
    setError(null);
    try {
      const bookData = await loadEpubFromBuffer(buffer);
      const id = generateBookId(bookData.title, bookData.chapters.length, bookData.chapters[0]?.title);
      bookIdRef.current = id;

      // Check for saved position
      const saved = loadBookState(id);
      const resumeChapter = saved
        ? Math.min(saved.lastChapterIndex, bookData.chapters.length - 1)
        : 0;

      setBook(bookData);
      setCurrentChapterIndex(resumeChapter);
      setMode('browse');

      // Update lastOpenedAt
      saveBookState(id, {
        title: bookData.title,
        lastChapterIndex: resumeChapter,
        lastWordIndex: 0,
        lastOpenedAt: Date.now(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load EPUB';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const goToChapter = useCallback((index: number) => {
    if (!book) return;
    const clamped = Math.max(0, Math.min(index, book.chapters.length - 1));
    setCurrentChapterIndex(clamped);
  }, [book]);

  const nextChapter = useCallback(() => {
    if (!book) return;
    setCurrentChapterIndex(prev => Math.min(prev + 1, book.chapters.length - 1));
  }, [book]);

  const prevChapter = useCallback(() => {
    if (!book) return;
    setCurrentChapterIndex(prev => Math.max(prev - 1, 0));
  }, [book]);

  const unloadBook = useCallback(() => {
    bookIdRef.current = null;
    setBook(null);
    setCurrentChapterIndex(0);
    setMode('browse');
    setError(null);
  }, []);

  return {
    book,
    isLoading,
    error,
    currentChapterIndex,
    currentChapter,
    html,
    mode,
    setMode,
    loadBook,
    goToChapter,
    nextChapter,
    prevChapter,
    unloadBook,
    viewMode,
    setViewMode,
  };
}
