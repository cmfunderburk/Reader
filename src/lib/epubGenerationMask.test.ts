import { describe, it, expect } from 'vitest';
import { selectMaskedWords } from './epubGenerationMask';

describe('selectMaskedWords', () => {
  it('masks approximately 30% of content words on normal', () => {
    const words = 'The quick brown fox jumps over the lazy dog near the river'.split(' ');
    const masked = selectMaskedWords(words, 'normal', 42);
    expect(masked.size).toBeGreaterThan(0);
    expect(masked.size).toBeLessThan(words.length);
  });

  it('hard masks more than normal', () => {
    const words = 'The quick brown fox jumps over the lazy dog near the river'.split(' ');
    const normalMasked = selectMaskedWords(words, 'normal', 42);
    const hardMasked = selectMaskedWords(words, 'hard', 42);
    expect(hardMasked.size).toBeGreaterThanOrEqual(normalMasked.size);
  });

  it('is deterministic with same seed', () => {
    const words = 'The quick brown fox jumps over the lazy dog'.split(' ');
    const a = selectMaskedWords(words, 'normal', 42);
    const b = selectMaskedWords(words, 'normal', 42);
    expect([...a]).toEqual([...b]);
  });

  it('different seeds produce different masks', () => {
    const words = 'The quick brown fox jumps over the lazy dog and the cat'.split(' ');
    const a = selectMaskedWords(words, 'normal', 42);
    const b = selectMaskedWords(words, 'normal', 99);
    // With enough words, different seeds should produce different masks
    expect([...a]).not.toEqual([...b]);
  });

  it('normal mode skips function words', () => {
    // "the", "a", "is" are function words and should not be masked in normal mode
    const words = ['The', 'quick', 'brown', 'fox', 'is', 'a', 'lazy', 'dog'];
    const masked = selectMaskedWords(words, 'normal', 42);
    // Function words indices: 0 (The), 4 (is), 5 (a)
    expect(masked.has(0)).toBe(false);
    expect(masked.has(4)).toBe(false);
    expect(masked.has(5)).toBe(false);
  });

  it('recall mode can mask function words', () => {
    // With recall at 70%, function words should appear in masked set
    // Use a longer text to increase statistical likelihood
    const words = 'the the the the the the the the the the quick'.split(' ');
    const masked = selectMaskedWords(words, 'recall', 42);
    // At 70% rate with 10 "the" words, at least some should be masked
    const functionWordsMasked = [...masked].filter(i => i < 10);
    expect(functionWordsMasked.length).toBeGreaterThan(0);
  });

  it('returns empty set for empty input', () => {
    const masked = selectMaskedWords([], 'normal', 42);
    expect(masked.size).toBe(0);
  });

  it('recall masks more than hard', () => {
    // Use a longer text for statistical reliability
    const words = 'The quick brown fox jumps over the lazy dog and the cat sat on the mat by the river near the mountain'.split(' ');
    const hardMasked = selectMaskedWords(words, 'hard', 42);
    const recallMasked = selectMaskedWords(words, 'recall', 42);
    expect(recallMasked.size).toBeGreaterThanOrEqual(hardMasked.size);
  });
});
