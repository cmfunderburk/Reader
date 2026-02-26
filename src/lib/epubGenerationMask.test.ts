import { describe, it, expect } from 'vitest';
import { maskEpubWords } from './epubGenerationMask';

describe('maskEpubWords', () => {
  it('returns masked strings with _ for masked characters', () => {
    const words = ['philosophy', 'the', 'understanding'];
    const result = maskEpubWords(words, 'normal', 42);
    expect(result).toHaveLength(3);
    // Function word 'the' should be unchanged
    expect(result[1]).toBe('the');
  });

  it('preserves word lengths', () => {
    const words = ['hello', 'world', 'test'];
    const result = maskEpubWords(words, 'hard', 99);
    result.forEach((masked, i) => {
      expect(masked.length).toBe(words[i].length);
    });
  });

  it('masks more aggressively at higher difficulty', () => {
    const words = ['philosophy', 'understanding', 'remarkable', 'extraordinary'];
    const normal = maskEpubWords(words, 'normal', 42);
    const hard = maskEpubWords(words, 'hard', 42);
    const recall = maskEpubWords(words, 'recall', 42);
    const countMasks = (arr: string[]) => arr.join('').split('').filter(c => c === '_').length;
    expect(countMasks(hard)).toBeGreaterThanOrEqual(countMasks(normal));
    expect(countMasks(recall)).toBeGreaterThanOrEqual(countMasks(hard));
  });

  it('is deterministic for same seed', () => {
    const words = ['philosophy', 'understanding'];
    const a = maskEpubWords(words, 'normal', 42);
    const b = maskEpubWords(words, 'normal', 42);
    expect(a).toEqual(b);
  });

  it('handles empty word list', () => {
    expect(maskEpubWords([], 'normal', 42)).toEqual([]);
  });
});
