import type { Chunk } from '../types';

/**
 * Calculate display time for a chunk in milliseconds.
 *
 * Formula: display_time = base_time + (word_count * 0.6 * per_word_time)
 * Where per_word_time = 60000 / WPM
 *
 * This means multi-word chunks display longer, but not linearly -
 * peripheral vision handles some of the extra words.
 */
export function calculateDisplayTime(chunk: Chunk, wpm: number): number {
  const perWordTime = 60000 / wpm;
  const baseTime = perWordTime * 0.4; // 40% of single word time as base
  return baseTime + chunk.wordCount * 0.6 * perWordTime;
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
 * Format milliseconds as mm:ss string.
 */
export function formatTime(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
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
