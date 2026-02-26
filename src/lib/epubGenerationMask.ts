import type { GenerationDifficulty } from '../types';
import { maskGenerationLine } from './generationMask';

/**
 * Mask characters within words for EPUB generation mode.
 * Returns an array of masked word strings (same length as input).
 * Masked characters are replaced with '_'.
 */
export function maskEpubWords(
  words: string[],
  difficulty: GenerationDifficulty,
  seed: number,
): string[] {
  return words.map((word, i) =>
    maskGenerationLine(word, difficulty, seed, i)
  );
}
