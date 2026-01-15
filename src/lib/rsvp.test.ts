import { describe, it, expect } from 'vitest';
import { calculateDisplayTime, calculateRemainingTime, isBreakChunk } from './rsvp';
import { tokenize } from './tokenizer';
import type { Chunk } from '../types';

// Constants matching rsvp.ts
const AVG_WORD_LENGTH_WITH_SPACE = 5.8;
const DEFAULT_WPM = 400;

// Derived values
const CHARS_PER_MINUTE = DEFAULT_WPM * AVG_WORD_LENGTH_WITH_SPACE; // 2320
const MS_PER_CHAR = 60000 / CHARS_PER_MINUTE; // ~25.86

function createChunk(text: string): Chunk {
  const isMultiWord = text.includes(' ');
  return {
    text,
    wordCount: text.split(/\s+/).filter(w => w.length > 0).length,
    // Single word: 35% OVP, multi-word: center
    orpIndex: isMultiWord ? Math.floor(text.length / 2) : Math.floor(text.length * 0.35),
  };
}

function createBreakChunk(): Chunk {
  return {
    text: '· · ·',
    wordCount: 0,
    orpIndex: 2,
  };
}

describe('calculateDisplayTime', () => {
  describe('formula verification', () => {
    it('uses formula: (charCount + 1) * msPerChar', () => {
      const chunk = createChunk('test'); // 4 chars
      const time = calculateDisplayTime(chunk, DEFAULT_WPM);

      // (4 + 1) * 25.86... = 129.31...
      const expected = (4 + 1) * MS_PER_CHAR;
      expect(time).toBeCloseTo(expected, 5);
    });

    it('adds 1 char for implicit trailing space', () => {
      const chunk1 = createChunk('a'); // 1 char
      const chunk2 = createChunk('ab'); // 2 chars

      const time1 = calculateDisplayTime(chunk1, DEFAULT_WPM);
      const time2 = calculateDisplayTime(chunk2, DEFAULT_WPM);

      // Difference should be exactly 1 char's worth of time
      expect(time2 - time1).toBeCloseTo(MS_PER_CHAR, 5);
    });
  });

  describe('WPM scaling', () => {
    it('600 WPM is exactly 2x faster than 300 WPM', () => {
      const chunk = createChunk('sample text');

      const time300 = calculateDisplayTime(chunk, 300);
      const time600 = calculateDisplayTime(chunk, 600);

      expect(time300 / time600).toBeCloseTo(2, 5);
    });

    it('doubling WPM halves display time', () => {
      const chunk = createChunk('testing');

      const time400 = calculateDisplayTime(chunk, 400);
      const time800 = calculateDisplayTime(chunk, 800);

      expect(time400).toBeCloseTo(time800 * 2, 5);
    });
  });

  describe('break chunks', () => {
    it('break chunks use same formula as regular chunks', () => {
      const breakChunk = createBreakChunk(); // '· · ·' = 5 chars
      const time = calculateDisplayTime(breakChunk, DEFAULT_WPM);

      const expected = (5 + 1) * MS_PER_CHAR;
      expect(time).toBeCloseTo(expected, 5);
    });

    it('isBreakChunk correctly identifies break markers', () => {
      expect(isBreakChunk(createBreakChunk())).toBe(true);
      expect(isBreakChunk(createChunk('hello'))).toBe(false);
    });
  });
});

describe('exact WPM pacing at 400 WPM', () => {
  it('2320 characters (400 words * 5.8) takes exactly 60 seconds', () => {
    // 400 WPM * 5.8 chars/word = 2320 chars/minute
    // But we need to account for +1 per chunk
    // Single chunk of 2319 chars + 1 = 2320 effective chars
    const chunk = createChunk('x'.repeat(2319));
    const time = calculateDisplayTime(chunk, DEFAULT_WPM);

    expect(time).toBeCloseTo(60000, 0); // within 1ms
  });

  it('ms per effective char is exactly 60000/2320 at 400 WPM', () => {
    const chunk = createChunk('test'); // 4 chars + 1 = 5 effective
    const time = calculateDisplayTime(chunk, DEFAULT_WPM);

    const msPerEffectiveChar = time / 5;
    expect(msPerEffectiveChar).toBeCloseTo(MS_PER_CHAR, 5);
  });
});

describe('consistent WPM across chunk modes', () => {
  it('same text takes same time regardless of tokenization mode', () => {
    const text = `Speed reading is a technique used to improve one's ability to read quickly. The methods include chunking and minimizing subvocalization.`;

    const wordChunks = tokenize(text, 'word');
    const phraseChunks = tokenize(text, 'phrase');
    const clauseChunks = tokenize(text, 'clause');

    const wordTime = wordChunks.reduce((sum, c) =>
      sum + calculateDisplayTime(c, DEFAULT_WPM), 0
    );
    const phraseTime = phraseChunks.reduce((sum, c) =>
      sum + calculateDisplayTime(c, DEFAULT_WPM), 0
    );
    const clauseTime = clauseChunks.reduce((sum, c) =>
      sum + calculateDisplayTime(c, DEFAULT_WPM), 0
    );

    // All modes should be within 50ms of each other
    expect(Math.abs(wordTime - phraseTime)).toBeLessThan(50);
    expect(Math.abs(wordTime - clauseTime)).toBeLessThan(50);
    expect(Math.abs(phraseTime - clauseTime)).toBeLessThan(50);
  });

  it('fewer chunks = slightly faster (fewer +1 overhead)', () => {
    const text = `This is a test of the chunking system with multiple words.`;

    const wordChunks = tokenize(text, 'word');
    const clauseChunks = tokenize(text, 'clause');

    const wordTime = wordChunks.reduce((sum, c) =>
      sum + calculateDisplayTime(c, DEFAULT_WPM), 0
    );
    const clauseTime = clauseChunks.reduce((sum, c) =>
      sum + calculateDisplayTime(c, DEFAULT_WPM), 0
    );

    // Clause mode has fewer chunks, so less +1 overhead = faster
    // But the difference should be small
    expect(clauseTime).toBeLessThanOrEqual(wordTime);
    expect(wordTime - clauseTime).toBeLessThan(wordChunks.length * MS_PER_CHAR);
  });
});

describe('calculateRemainingTime', () => {
  it('calculates total time for remaining chunks', () => {
    const chunks = [
      createChunk('one'),
      createChunk('two'),
      createChunk('three'),
      createChunk('four'),
    ];

    const remaining = calculateRemainingTime(chunks, 2, DEFAULT_WPM);
    const expected = calculateDisplayTime(chunks[2], DEFAULT_WPM) +
                     calculateDisplayTime(chunks[3], DEFAULT_WPM);

    expect(remaining).toBeCloseTo(expected, 5);
  });

  it('returns 0 when at end of chunks', () => {
    const chunks = [createChunk('one'), createChunk('two')];
    expect(calculateRemainingTime(chunks, 2, DEFAULT_WPM)).toBe(0);
  });
});
