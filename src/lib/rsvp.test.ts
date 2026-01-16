import { describe, it, expect } from 'vitest';
import { calculateDisplayTime, calculateRemainingTime, isBreakChunk } from './rsvp';
import { tokenize } from './tokenizer';
import type { Chunk } from '../types';

// Constants matching rsvp.ts
const AVG_WORD_LENGTH_WITH_SPACE = 5.8;
const DEFAULT_WPM = 400;
const MS_PER_WORD = 60000 / DEFAULT_WPM; // 150ms at 400 WPM

// For break chunks (character-based)
const CHARS_PER_MINUTE = DEFAULT_WPM * AVG_WORD_LENGTH_WITH_SPACE;
const MS_PER_CHAR = 60000 / CHARS_PER_MINUTE;

function createChunk(text: string): Chunk {
  const isMultiWord = text.includes(' ');
  return {
    text,
    wordCount: text.split(/\s+/).filter(w => w.length > 0).length,
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
  describe('word-based timing', () => {
    it('single word takes msPerWord time', () => {
      const chunk = createChunk('test'); // 1 word
      const time = calculateDisplayTime(chunk, DEFAULT_WPM);

      expect(time).toBeCloseTo(MS_PER_WORD, 5);
    });

    it('multi-word chunk takes wordCount * msPerWord', () => {
      const chunk = createChunk('the quick brown'); // 3 words
      const time = calculateDisplayTime(chunk, DEFAULT_WPM);

      expect(time).toBeCloseTo(3 * MS_PER_WORD, 5);
    });

    it('400 words at 400 WPM takes exactly 60 seconds', () => {
      // Create a chunk with 400 words
      const words = Array(400).fill('word').join(' ');
      const chunk = createChunk(words);
      const time = calculateDisplayTime(chunk, DEFAULT_WPM);

      expect(time).toBeCloseTo(60000, 0);
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
    it('break chunks use character-based timing', () => {
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
  it('1 word = 150ms', () => {
    const chunk = createChunk('hello');
    const time = calculateDisplayTime(chunk, DEFAULT_WPM);
    expect(time).toBe(150);
  });

  it('10 words = 1.5 seconds', () => {
    const chunk = createChunk('one two three four five six seven eight nine ten');
    const time = calculateDisplayTime(chunk, DEFAULT_WPM);
    expect(time).toBe(1500);
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

    // With word-based timing, all modes should be exactly equal
    expect(wordTime).toBe(phraseTime);
    expect(wordTime).toBe(clauseTime);
  });

  it('different chunk sizes produce same total time', () => {
    const text = `This is a test of the chunking system with multiple words.`;

    const wordChunks = tokenize(text, 'word');
    const clauseChunks = tokenize(text, 'clause');

    const wordTime = wordChunks.reduce((sum, c) =>
      sum + calculateDisplayTime(c, DEFAULT_WPM), 0
    );
    const clauseTime = clauseChunks.reduce((sum, c) =>
      sum + calculateDisplayTime(c, DEFAULT_WPM), 0
    );

    // Should be exactly equal now
    expect(wordTime).toBe(clauseTime);
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
