import { describe, expect, it } from 'vitest';
import type { Chunk } from '../types';
import { findPreviewSentenceTargetIndex, isSentenceBoundaryChunk } from './predictionPreview';

function word(text: string): Chunk {
  return { text, wordCount: 1, orpIndex: 0 };
}

function paragraphBreak(): Chunk {
  return { text: '\n\n', wordCount: 0, orpIndex: 0 };
}

describe('predictionPreview', () => {
  it('finds the target after the next N sentence boundaries', () => {
    const chunks = [
      word('Alpha'),
      word('beta.'),
      word('Gamma'),
      word('delta?'),
      word('Epsilon'),
    ];

    expect(findPreviewSentenceTargetIndex(chunks, 0, 2)).toBe(3);
  });

  it('treats common abbreviations as non-boundary tokens', () => {
    const chunks = [
      word('Dr.'),
      word('Smith'),
      word('arrived.'),
    ];

    expect(isSentenceBoundaryChunk(chunks, 0)).toBe(false);
    expect(isSentenceBoundaryChunk(chunks, 2)).toBe(true);
  });

  it('uses the close-period heuristic for initials/abbreviations', () => {
    const chunks = [
      word('U.'),
      word('S.'),
      word('policy'),
      word('changed.'),
    ];

    expect(isSentenceBoundaryChunk(chunks, 0)).toBe(false);
    expect(isSentenceBoundaryChunk(chunks, 1)).toBe(false);
    expect(findPreviewSentenceTargetIndex(chunks, 0, 1)).toBe(3);
  });

  it('skips paragraph breaks while counting preview sentences', () => {
    const chunks = [
      word('One'),
      word('two.'),
      paragraphBreak(),
      word('Three'),
      word('four.'),
    ];

    expect(findPreviewSentenceTargetIndex(chunks, 0, 2)).toBe(4);
  });

  it('falls back to the last word when fewer than N boundaries remain', () => {
    const chunks = [
      word('No'),
      word('ending'),
      word('here'),
    ];

    expect(findPreviewSentenceTargetIndex(chunks, 0, 2)).toBe(2);
  });
});
