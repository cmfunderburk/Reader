import type { Chunk } from '../types';

/**
 * Check if a chunk is a paragraph break marker.
 */
export function isBreakChunk(chunk: Chunk): boolean {
  return chunk.wordCount === 0;
}

// Average word length including trailing space
const AVG_WORD_LENGTH_WITH_SPACE = 5.8;

/**
 * Calculate display time for a chunk in milliseconds.
 *
 * Uses word count for accurate WPM timing. At 400 WPM, each word
 * gets 150ms (60000/400). A 3-word chunk displays for 450ms.
 *
 * Break chunks (wordCount=0) use character-based timing for their pause.
 */
export function calculateDisplayTime(chunk: Chunk, wpm: number): number {
  const msPerWord = 60000 / wpm;

  // Break chunks (paragraph markers) use character-based pause
  if (chunk.wordCount === 0) {
    const charsPerMinute = wpm * AVG_WORD_LENGTH_WITH_SPACE;
    const msPerChar = 60000 / charsPerMinute;
    return (chunk.text.length + 1) * msPerChar;
  }

  return chunk.wordCount * msPerWord;
}

/**
 * Calculate remaining time from current position to end.
 */
export function calculateRemainingTime(
  chunks: Chunk[],
  currentIndex: number,
  wpm: number
): number {
  let totalMs = 0;
  for (let i = currentIndex; i < chunks.length; i++) {
    totalMs += calculateDisplayTime(chunks[i], wpm);
  }
  return totalMs;
}

/**
 * Format milliseconds as h:mm:ss or mm:ss string.
 */
export function formatTime(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Calculate progress percentage (0-100).
 */
export function calculateProgress(currentIndex: number, totalChunks: number): number {
  if (totalChunks === 0) return 0;
  return (currentIndex / totalChunks) * 100;
}

/**
 * Find chunk index from progress percentage.
 */
export function indexFromProgress(progress: number, totalChunks: number): number {
  if (totalChunks === 0) return 0;
  return Math.floor((progress / 100) * totalChunks);
}
