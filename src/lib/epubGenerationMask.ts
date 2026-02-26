import type { GenerationDifficulty } from '../types';
import { FUNCTION_WORDS } from './tokenizer';

/**
 * Seeded pseudo-random number generator (mulberry32).
 * Deterministic for the same seed, producing values in [0, 1).
 */
function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Difficulty -> target fraction of eligible words to mask */
const MASK_RATES: Record<GenerationDifficulty, number> = {
  normal: 0.3,
  hard: 0.5,
  recall: 0.7,
};

/**
 * Strip punctuation for function-word lookup.
 */
function stripPunctuation(word: string): string {
  return word.toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Select word indices to mask for generation mode.
 *
 * - `normal`: masks ~30% of content words (skipping function words)
 * - `hard`: masks ~50% of content words (skipping function words)
 * - `recall`: masks ~70% of ALL words (including function words)
 *
 * Uses a seeded PRNG so masks are deterministic for the same chapter + seed.
 *
 * @param words - Ordered array of word strings (matching data-word-idx order)
 * @param difficulty - Masking difficulty level
 * @param seed - Seed for deterministic random selection
 * @returns Set of word indices to mask
 */
export function selectMaskedWords(
  words: string[],
  difficulty: GenerationDifficulty,
  seed: number,
): Set<number> {
  const masked = new Set<number>();
  const rate = MASK_RATES[difficulty];
  const random = seededRandom(seed);
  const includeFunction = difficulty === 'recall';

  for (let i = 0; i < words.length; i++) {
    const clean = stripPunctuation(words[i]);
    if (!clean) continue; // skip pure punctuation

    const isFunctionWord = FUNCTION_WORDS.has(clean);

    // In normal/hard, skip function words entirely
    if (!includeFunction && isFunctionWord) continue;

    if (random() < rate) {
      masked.add(i);
    }
  }

  return masked;
}
