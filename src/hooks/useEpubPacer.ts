import { useState, useCallback, useEffect, useRef } from 'react';

export interface UseEpubPacerOptions {
  wordCount: number;
  wpm: number;
  enabled: boolean;
}

export interface UseEpubPacerResult {
  currentWordIndex: number;
  isPlaying: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (wordIndex: number) => void;
}

/**
 * Word-level pacer for EPUB reading. Advances through words at the
 * configured WPM rate. Uses setInterval for consistent timing that
 * works well with fake timers in tests.
 */
export function useEpubPacer({
  wordCount,
  wpm,
  enabled,
}: UseEpubPacerOptions): UseEpubPacerResult {
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Compute interval in ms from WPM: 60000 / wpm
  const intervalMs = wpm > 0 ? 60000 / wpm : 200;

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Reset when wordCount changes (new chapter loaded)
  useEffect(() => {
    clearTimer();
    setCurrentWordIndex(0);
    setIsPlaying(false);
  }, [wordCount, clearTimer]);

  // Core interval effect: run the timer when playing and enabled
  useEffect(() => {
    if (!isPlaying || !enabled || wordCount <= 0) {
      clearTimer();
      return;
    }

    intervalRef.current = setInterval(() => {
      setCurrentWordIndex(prev => {
        const next = prev + 1;
        if (next >= wordCount) {
          // Reached the last word -- stop playback
          clearTimer();
          setIsPlaying(false);
          return wordCount - 1;
        }
        return next;
      });
    }, intervalMs);

    return clearTimer;
  }, [isPlaying, enabled, wordCount, intervalMs, clearTimer]);

  const play = useCallback(() => {
    if (!enabled || wordCount <= 0) return;
    // Don't start if already at the end
    setCurrentWordIndex(prev => {
      if (prev >= wordCount - 1 && wordCount > 1) return prev;
      setIsPlaying(true);
      return prev;
    });
  }, [enabled, wordCount]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    clearTimer();
  }, [clearTimer]);

  const toggle = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, pause, play]);

  const seek = useCallback((wordIndex: number) => {
    const clamped = Math.max(0, Math.min(wordIndex, Math.max(0, wordCount - 1)));
    setCurrentWordIndex(clamped);
  }, [wordCount]);

  return {
    currentWordIndex,
    isPlaying,
    play,
    pause,
    toggle,
    seek,
  };
}
