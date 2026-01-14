import { useState, useCallback, useRef, useEffect } from 'react';
import type { Chunk, TokenMode, Article } from '../types';
import { tokenize } from '../lib/tokenizer';
import { calculateDisplayTime } from '../lib/rsvp';
import { updateArticlePosition } from '../lib/storage';

interface UseRSVPOptions {
  initialWpm?: number;
  initialMode?: TokenMode;
  onComplete?: () => void;
}

interface UseRSVPReturn {
  chunks: Chunk[];
  currentChunkIndex: number;
  currentChunk: Chunk | null;
  isPlaying: boolean;
  wpm: number;
  mode: TokenMode;
  article: Article | null;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  goToIndex: (index: number) => void;
  setWpm: (wpm: number) => void;
  setMode: (mode: TokenMode) => void;
  loadArticle: (article: Article) => void;
  reset: () => void;
}

export function useRSVP(options: UseRSVPOptions = {}): UseRSVPReturn {
  const {
    initialWpm = 300,
    initialMode = 'phrase',
    onComplete,
  } = options;

  const [article, setArticle] = useState<Article | null>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [wpm, setWpm] = useState(initialWpm);
  const [mode, setMode] = useState<TokenMode>(initialMode);

  const timerRef = useRef<number | null>(null);
  const articleRef = useRef<Article | null>(null);

  // Keep articleRef in sync
  useEffect(() => {
    articleRef.current = article;
  }, [article]);

  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // Schedule next chunk
  const scheduleNext = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    setCurrentChunkIndex(prevIndex => {
      setChunks(currentChunks => {
        if (prevIndex >= currentChunks.length - 1) {
          setIsPlaying(false);
          onComplete?.();
          return currentChunks;
        }

        const chunk = currentChunks[prevIndex];
        const delay = calculateDisplayTime(chunk, wpm);

        timerRef.current = window.setTimeout(() => {
          setCurrentChunkIndex(i => {
            const newIndex = i + 1;
            // Persist position periodically
            if (articleRef.current && newIndex % 10 === 0) {
              updateArticlePosition(articleRef.current.id, newIndex);
            }
            return newIndex;
          });
        }, delay);

        return currentChunks;
      });

      return prevIndex;
    });
  }, [wpm, onComplete]);

  // Effect to handle playback
  useEffect(() => {
    if (isPlaying && chunks.length > 0) {
      scheduleNext();
    } else if (!isPlaying && timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [isPlaying, currentChunkIndex, chunks.length, scheduleNext]);

  const play = useCallback(() => {
    if (chunks.length > 0 && currentChunkIndex < chunks.length) {
      setIsPlaying(true);
    }
  }, [chunks.length, currentChunkIndex]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // Persist position on pause
    if (articleRef.current) {
      updateArticlePosition(articleRef.current.id, currentChunkIndex);
    }
  }, [currentChunkIndex]);

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
      const newChunks = tokenize(article.content, newMode);
      // Try to preserve approximate position
      const progress = chunks.length > 0 ? currentChunkIndex / chunks.length : 0;
      const newIndex = Math.floor(progress * newChunks.length);
      setChunks(newChunks);
      setCurrentChunkIndex(Math.min(newIndex, newChunks.length - 1));
    }
  }, [article, chunks.length, currentChunkIndex]);

  const loadArticle = useCallback((newArticle: Article) => {
    pause();
    setArticle(newArticle);
    const newChunks = tokenize(newArticle.content, mode);
    setChunks(newChunks);
    // Resume from saved position if available
    const startIndex = newArticle.readPosition || 0;
    setCurrentChunkIndex(Math.min(startIndex, newChunks.length - 1));
  }, [mode, pause]);

  const reset = useCallback(() => {
    pause();
    setCurrentChunkIndex(0);
  }, [pause]);

  return {
    chunks,
    currentChunkIndex,
    currentChunk: chunks[currentChunkIndex] ?? null,
    isPlaying,
    wpm,
    mode,
    article,
    play,
    pause,
    toggle,
    next,
    prev,
    goToIndex,
    setWpm,
    setMode: handleSetMode,
    loadArticle,
    reset,
  };
}
