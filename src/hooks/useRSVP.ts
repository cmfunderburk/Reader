import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { Chunk, TokenMode, Article, SaccadePage, DisplayMode } from '../types';
import { tokenize } from '../lib/tokenizer';
import { tokenizeSaccade } from '../lib/saccade';
import { calculateDisplayTime } from '../lib/rsvp';
import { updateArticlePosition } from '../lib/storage';

interface UseRSVPOptions {
  initialWpm?: number;
  initialMode?: TokenMode;
  initialDisplayMode?: DisplayMode;
  initialCustomCharWidth?: number;
  onComplete?: () => void;
}

interface UseRSVPReturn {
  chunks: Chunk[];
  currentChunkIndex: number;
  currentChunk: Chunk | null;
  isPlaying: boolean;
  wpm: number;
  mode: TokenMode;
  displayMode: DisplayMode;
  customCharWidth: number;
  article: Article | null;
  saccadePages: SaccadePage[];
  currentSaccadePage: SaccadePage | null;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  goToIndex: (index: number) => void;
  setWpm: (wpm: number) => void;
  setMode: (mode: TokenMode) => void;
  setDisplayMode: (displayMode: DisplayMode) => void;
  setCustomCharWidth: (width: number) => void;
  loadArticle: (article: Article) => void;
  reset: () => void;
}

export function useRSVP(options: UseRSVPOptions = {}): UseRSVPReturn {
  const {
    initialWpm = 400,
    initialMode = 'phrase',
    initialDisplayMode = 'rsvp',
    initialCustomCharWidth = 30,
    onComplete,
  } = options;

  const [article, setArticle] = useState<Article | null>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [wpm, setWpm] = useState(initialWpm);
  const [mode, setMode] = useState<TokenMode>(initialMode);
  const [displayMode, setDisplayModeState] = useState<DisplayMode>(initialDisplayMode);
  const [customCharWidth, setCustomCharWidthState] = useState(initialCustomCharWidth);
  const [saccadePages, setSaccadePages] = useState<SaccadePage[]>([]);

  const timerRef = useRef<number | null>(null);
  const chunksRef = useRef<Chunk[]>(chunks);
  const indexRef = useRef(currentChunkIndex);
  const wpmRef = useRef(wpm);
  const articleRef = useRef<Article | null>(article);
  const customCharWidthRef = useRef(customCharWidth);
  const displayModeRef = useRef(displayMode);
  const modeRef = useRef(mode);

  // Keep refs in sync with state
  useEffect(() => { chunksRef.current = chunks; }, [chunks]);
  useEffect(() => { indexRef.current = currentChunkIndex; }, [currentChunkIndex]);
  useEffect(() => { wpmRef.current = wpm; }, [wpm]);
  useEffect(() => { articleRef.current = article; }, [article]);
  useEffect(() => { customCharWidthRef.current = customCharWidth; }, [customCharWidth]);
  useEffect(() => { displayModeRef.current = displayMode; }, [displayMode]);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  // Clear timer helper
  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Clear timer on unmount
  useEffect(() => clearTimer, [clearTimer]);

  // Helper to tokenize based on current display mode and chunk mode
  const retokenize = useCallback((
    content: string,
    dm: DisplayMode,
    tm: TokenMode,
    charWidth: number
  ): { chunks: Chunk[]; pages: SaccadePage[] } => {
    if (dm === 'saccade') {
      const result = tokenizeSaccade(content, tm, tm === 'custom' ? charWidth : undefined);
      return { chunks: result.chunks, pages: result.pages };
    } else {
      const newChunks = tokenize(content, tm, tm === 'custom' ? charWidth : undefined);
      return { chunks: newChunks, pages: [] };
    }
  }, []);

  // Advance to next chunk
  const advanceToNext = useCallback(() => {
    const chunks = chunksRef.current;
    const currentIndex = indexRef.current;

    if (currentIndex >= chunks.length - 1) {
      // Reached the end
      setIsPlaying(false);
      onComplete?.();
      return;
    }

    // Move to next chunk
    const nextIndex = currentIndex + 1;
    setCurrentChunkIndex(nextIndex);

    // Persist position periodically
    if (articleRef.current && nextIndex % 10 === 0) {
      updateArticlePosition(articleRef.current.id, nextIndex);
    }
  }, [onComplete]);

  // Schedule next chunk display
  const scheduleNext = useCallback(() => {
    clearTimer();

    const chunks = chunksRef.current;
    const currentIndex = indexRef.current;
    const currentWpm = wpmRef.current;

    if (currentIndex >= chunks.length) {
      setIsPlaying(false);
      return;
    }

    const chunk = chunks[currentIndex];
    if (!chunk) {
      setIsPlaying(false);
      return;
    }

    const delay = calculateDisplayTime(chunk, currentWpm);

    timerRef.current = window.setTimeout(() => {
      advanceToNext();
    }, delay);
  }, [clearTimer, advanceToNext]);

  // Handle playback state changes
  useEffect(() => {
    if (isPlaying && chunks.length > 0) {
      scheduleNext();
    } else {
      clearTimer();
    }
  }, [isPlaying, currentChunkIndex, chunks.length, scheduleNext, clearTimer]);

  const play = useCallback(() => {
    if (chunks.length > 0 && currentChunkIndex < chunks.length) {
      setIsPlaying(true);
    }
  }, [chunks.length, currentChunkIndex]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    clearTimer();
    // Persist position on pause
    if (articleRef.current) {
      updateArticlePosition(articleRef.current.id, currentChunkIndex);
    }
  }, [clearTimer, currentChunkIndex]);

  const toggle = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, pause, play]);

  const next = useCallback(() => {
    setCurrentChunkIndex(i => Math.min(i + 1, chunks.length - 1));
  }, [chunks.length]);

  const prev = useCallback(() => {
    setCurrentChunkIndex(i => Math.max(i - 1, 0));
  }, []);

  const goToIndex = useCallback((index: number) => {
    setCurrentChunkIndex(Math.max(0, Math.min(index, chunks.length - 1)));
  }, [chunks.length]);

  const handleSetMode = useCallback((newMode: TokenMode) => {
    setMode(newMode);
    if (article) {
      const { chunks: newChunks, pages } = retokenize(
        article.content,
        displayMode,
        newMode,
        customCharWidthRef.current
      );
      setSaccadePages(pages);

      // Try to preserve approximate position
      const progress = chunks.length > 0 ? currentChunkIndex / chunks.length : 0;
      const newIndex = Math.floor(progress * newChunks.length);
      setChunks(newChunks);
      setCurrentChunkIndex(Math.min(newIndex, newChunks.length - 1));
    }
  }, [article, displayMode, chunks.length, currentChunkIndex, retokenize]);

  const handleSetDisplayMode = useCallback((newDisplayMode: DisplayMode) => {
    setDisplayModeState(newDisplayMode);
    if (article) {
      const { chunks: newChunks, pages } = retokenize(
        article.content,
        newDisplayMode,
        mode,
        customCharWidthRef.current
      );
      setSaccadePages(pages);

      // Try to preserve approximate position
      const progress = chunks.length > 0 ? currentChunkIndex / chunks.length : 0;
      const newIndex = Math.floor(progress * newChunks.length);
      setChunks(newChunks);
      setCurrentChunkIndex(Math.min(newIndex, newChunks.length - 1));
    }
  }, [article, mode, chunks.length, currentChunkIndex, retokenize]);

  const setCustomCharWidth = useCallback((width: number) => {
    setCustomCharWidthState(width);
    if (article && mode === 'custom') {
      const { chunks: newChunks, pages } = retokenize(
        article.content,
        displayMode,
        'custom',
        width
      );
      setSaccadePages(pages);

      // Try to preserve approximate position
      const progress = chunks.length > 0 ? currentChunkIndex / chunks.length : 0;
      const newIndex = Math.floor(progress * newChunks.length);
      setChunks(newChunks);
      setCurrentChunkIndex(Math.min(newIndex, newChunks.length - 1));
    }
  }, [article, mode, displayMode, chunks.length, currentChunkIndex, retokenize]);

  const loadArticle = useCallback((newArticle: Article) => {
    pause();
    setArticle(newArticle);

    const { chunks: newChunks, pages } = retokenize(
      newArticle.content,
      displayModeRef.current,
      modeRef.current,
      customCharWidthRef.current
    );
    setSaccadePages(pages);
    setChunks(newChunks);

    // Resume from saved position if available
    const startIndex = newArticle.readPosition || 0;
    setCurrentChunkIndex(Math.min(startIndex, newChunks.length - 1));
  }, [pause, retokenize]);

  const reset = useCallback(() => {
    pause();
    setCurrentChunkIndex(0);
  }, [pause]);

  // Compute current saccade page
  const currentChunk = chunks[currentChunkIndex] ?? null;
  const currentSaccadePage = useMemo(() => {
    if (displayMode !== 'saccade' || !currentChunk?.saccade) return null;
    return saccadePages[currentChunk.saccade.pageIndex] ?? null;
  }, [displayMode, saccadePages, currentChunk]);

  return {
    chunks,
    currentChunkIndex,
    currentChunk,
    isPlaying,
    wpm,
    mode,
    displayMode,
    customCharWidth,
    article,
    saccadePages,
    currentSaccadePage,
    play,
    pause,
    toggle,
    next,
    prev,
    goToIndex,
    setWpm,
    setMode: handleSetMode,
    setDisplayMode: handleSetDisplayMode,
    setCustomCharWidth,
    loadArticle,
    reset,
  };
}
