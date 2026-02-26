import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { loadEpubFromBuffer, type EpubBookData, type EpubChapter } from '../lib/epubParser';
import { annotateHtmlWords, type AnnotationResult } from '../lib/htmlAnnotator';
import { generateBookId, loadBookState, saveBookState } from '../lib/bookStorage';

export type EpubReadingMode = 'browse' | 'pacer' | 'generation';

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
  /** Annotated HTML for the current chapter (words wrapped in spans) */
  annotatedHtml: string;
  /** Total word count in the current chapter */
  wordCount: number;
  /** Ordered word list for the current chapter */
  words: string[];
  /** Current word index (for pacer/generation modes) */
  currentWordIndex: number;
  /** Set the current word index */
  setCurrentWordIndex: (index: number) => void;
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
}

export function useEpubReader(): UseEpubReaderResult {
  const [book, setBook] = useState<EpubBookData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [mode, setMode] = useState<EpubReadingMode>('browse');
  const bookIdRef = useRef<string | null>(null);

  const currentChapter = book ? (book.chapters[currentChapterIndex] ?? null) : null;

  const annotation: AnnotationResult = useMemo(() => {
    if (!currentChapter) {
      return { html: '', wordCount: 0, words: [] };
    }
    return annotateHtmlWords(currentChapter.html, {
      resources: book?.resources,
    });
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

  // Persist word position periodically (every 10 words)
  useEffect(() => {
    const id = bookIdRef.current;
    if (!id || !book || currentWordIndex === 0) return;
    if (currentWordIndex % 10 !== 0) return;
    saveBookState(id, {
      title: book.title,
      lastChapterIndex: currentChapterIndex,
      lastWordIndex: currentWordIndex,
      lastOpenedAt: Date.now(),
    });
  }, [currentWordIndex, currentChapterIndex, book]);

  const loadBook = useCallback(async (buffer: ArrayBuffer) => {
    setIsLoading(true);
    setError(null);
    try {
      const bookData = await loadEpubFromBuffer(buffer);
      const id = generateBookId(bookData.title, bookData.chapters.length);
      bookIdRef.current = id;

      // Check for saved position
      const saved = loadBookState(id);
      const resumeChapter = saved
        ? Math.min(saved.lastChapterIndex, bookData.chapters.length - 1)
        : 0;
      const resumeWord = saved ? saved.lastWordIndex : 0;

      setBook(bookData);
      setCurrentChapterIndex(resumeChapter);
      setCurrentWordIndex(resumeWord);
      setMode('browse');

      // Update lastOpenedAt
      saveBookState(id, {
        title: bookData.title,
        lastChapterIndex: resumeChapter,
        lastWordIndex: resumeWord,
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
    setCurrentWordIndex(0);
  }, [book]);

  const nextChapter = useCallback(() => {
    if (!book) return;
    setCurrentChapterIndex(prev => {
      const next = Math.min(prev + 1, book.chapters.length - 1);
      if (next !== prev) setCurrentWordIndex(0);
      return next;
    });
  }, [book]);

  const prevChapter = useCallback(() => {
    if (!book) return;
    setCurrentChapterIndex(prev => {
      const next = Math.max(prev - 1, 0);
      if (next !== prev) setCurrentWordIndex(0);
      return next;
    });
  }, [book]);

  const unloadBook = useCallback(() => {
    bookIdRef.current = null;
    setBook(null);
    setCurrentChapterIndex(0);
    setCurrentWordIndex(0);
    setMode('browse');
    setError(null);
  }, []);

  return {
    book,
    isLoading,
    error,
    currentChapterIndex,
    currentChapter,
    annotatedHtml: annotation.html,
    wordCount: annotation.wordCount,
    words: annotation.words,
    currentWordIndex,
    setCurrentWordIndex,
    mode,
    setMode,
    loadBook,
    goToChapter,
    nextChapter,
    prevChapter,
    unloadBook,
  };
}
