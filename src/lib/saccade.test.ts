import { describe, it, expect } from 'vitest';
import { calculateSaccadeLineDuration, computeFocusTargetTimings, computeFocusTargets, computeLineFixations, computeWordFixations, computeWordTargets, segmentIntoParagraphs, tokenizeParagraphSaccade, tokenizeParagraphRecall } from './saccade';

describe('calculateSaccadeLineDuration', () => {
  it('returns 0 for empty text or zero WPM', () => {
    expect(calculateSaccadeLineDuration(0, 300)).toBe(0);
    expect(calculateSaccadeLineDuration(50, 0)).toBe(0);
    expect(calculateSaccadeLineDuration(-1, 300)).toBe(0);
    expect(calculateSaccadeLineDuration(50, -10)).toBe(0);
  });

  it('treats 5 characters as 1 word', () => {
    // At 300 WPM, 1 word = 60000/300 = 200ms
    // 5 chars = 1 word = 200ms
    expect(calculateSaccadeLineDuration(5, 300)).toBe(200);
  });

  it('scales linearly with character count', () => {
    const wpm = 300;
    const dur10 = calculateSaccadeLineDuration(10, wpm);
    const dur20 = calculateSaccadeLineDuration(20, wpm);
    const dur40 = calculateSaccadeLineDuration(40, wpm);

    expect(dur20).toBe(dur10 * 2);
    expect(dur40).toBe(dur10 * 4);
  });

  it('scales inversely with WPM', () => {
    const chars = 50; // 10 "words"
    const dur300 = calculateSaccadeLineDuration(chars, 300);
    const dur600 = calculateSaccadeLineDuration(chars, 600);

    expect(dur300).toBe(dur600 * 2);
  });

  it('computes correct duration for a typical 80-char line', () => {
    // 80 chars = 16 words. At 300 WPM: 16/300 * 60000 = 3200ms
    expect(calculateSaccadeLineDuration(80, 300)).toBe(3200);
  });

  it('computes correct duration at common WPM settings', () => {
    const chars = 50; // 10 words

    // 200 WPM: 10/200 * 60000 = 3000ms
    expect(calculateSaccadeLineDuration(chars, 200)).toBe(3000);

    // 400 WPM: 10/400 * 60000 = 1500ms
    expect(calculateSaccadeLineDuration(chars, 400)).toBe(1500);

    // 600 WPM: 10/600 * 60000 = 1000ms
    expect(calculateSaccadeLineDuration(chars, 600)).toBe(1000);
  });
});

describe('computeLineFixations', () => {
  it('returns at least one fixation for non-empty text', () => {
    const fixations = computeLineFixations('Hello world', 10);
    expect(fixations.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty array for empty text', () => {
    expect(computeLineFixations('', 10)).toEqual([]);
  });

  it('skips short first words', () => {
    const fixations = computeLineFixations('A wonderful day', 10);
    // First fixation should NOT be on 'A' (char 0) — should skip to 'wonderful'
    expect(fixations[0]).toBeGreaterThan(0);
  });

  it('produces fixation indices within text bounds', () => {
    const text = 'The quick brown fox jumps over the lazy dog near the river bank';
    const fixations = computeLineFixations(text, 10);
    for (const idx of fixations) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(text.length);
    }
  });

  it('produces monotonically increasing fixation positions', () => {
    const text = 'Reading is a complex cognitive process that involves multiple brain regions';
    const fixations = computeLineFixations(text, 10);
    for (let i = 1; i < fixations.length; i++) {
      expect(fixations[i]).toBeGreaterThan(fixations[i - 1]);
    }
  });

  it('prefers longer content words over short function words', () => {
    // "a" should be skipped in favor of "pharmaceutical"
    const text = 'a pharmaceutical';
    const fixations = computeLineFixations(text, 10);
    expect(fixations.length).toBe(1);
    // Fixation should be on "pharmaceutical", not "a"
    expect(fixations[0]).toBeGreaterThan(1);
  });
});

describe('computeFocusTargets', () => {
  it('returns empty array for empty text or fixations', () => {
    expect(computeFocusTargets('', [1, 2])).toEqual([]);
    expect(computeFocusTargets('hello world', [])).toEqual([]);
  });

  it('builds ranges from the start of each fixation word', () => {
    const text = 'Alpha beta gamma delta';
    const fixations = computeLineFixations(text, 8);
    const ranges = computeFocusTargets(text, fixations);

    expect(ranges.length).toBeGreaterThan(0);
    expect(ranges[0].startChar).toBe(0);
    expect(ranges[ranges.length - 1].endChar).toBe(text.length);
  });

  it('deduplicates repeated fixation words', () => {
    const text = 'alpha beta';
    const ranges = computeFocusTargets(text, [1, 2, 7]);
    expect(ranges).toEqual([
      { startChar: 0, endChar: 6 },
      { startChar: 6, endChar: text.length },
    ]);
  });
});

describe('computeWordTargets', () => {
  it('returns one range per token', () => {
    const text = 'Read this line.';
    expect(computeWordTargets(text)).toEqual([
      { startChar: 0, endChar: 4 },
      { startChar: 5, endChar: 9 },
      { startChar: 10, endChar: 15 },
    ]);
  });

  it('returns empty for empty text', () => {
    expect(computeWordTargets('')).toEqual([]);
  });
});

describe('computeWordFixations', () => {
  it('returns one fixation per token', () => {
    const text = 'Alpha beta gamma';
    const fixations = computeWordFixations(text);
    expect(fixations.length).toBe(3);
    expect(fixations[0]).toBeGreaterThanOrEqual(0);
    expect(fixations[2]).toBeLessThan(text.length);
  });

  it('returns empty for empty text', () => {
    expect(computeWordFixations('')).toEqual([]);
  });
});

describe('computeFocusTargetTimings', () => {
  it('uses equal dwell in word mode when no punctuation is present', () => {
    const text = 'alpha beta gamma';
    const targets = computeWordTargets(text);
    const timings = computeFocusTargetTimings(text, targets, 'word');
    expect(timings.length).toBe(3);
    const d0 = timings[0].endPct - timings[0].startPct;
    const d1 = timings[1].endPct - timings[1].startPct;
    const d2 = timings[2].endPct - timings[2].startPct;
    expect(Math.abs(d0 - d1)).toBeLessThan(0.01);
    expect(Math.abs(d1 - d2)).toBeLessThan(0.01);
  });

  it('adds punctuation pause bonus in word mode', () => {
    const text = 'alpha, beta gamma.';
    const targets = computeWordTargets(text);
    const timings = computeFocusTargetTimings(text, targets, 'word');
    const d0 = timings[0].endPct - timings[0].startPct; // comma
    const d1 = timings[1].endPct - timings[1].startPct; // plain
    const d2 = timings[2].endPct - timings[2].startPct; // sentence end
    expect(d0).toBeGreaterThan(d1);
    expect(d2).toBeGreaterThan(d1);
  });

  it('uses character span in char mode', () => {
    const text = 'alpha beta';
    const targets = [
      { startChar: 0, endChar: 5 },
      { startChar: 6, endChar: 10 },
    ];
    const timings = computeFocusTargetTimings(text, targets, 'char');
    expect(timings[0].startPct).toBe(0);
    expect(timings[0].endPct).toBe(50);
    expect(timings[1].startPct).toBe(60);
    expect(timings[1].endPct).toBe(100);
  });
});

describe('segmentIntoParagraphs', () => {
  it('returns empty array for empty text', () => {
    expect(segmentIntoParagraphs('')).toEqual([]);
    expect(segmentIntoParagraphs('   ')).toEqual([]);
  });

  it('returns single paragraph for short text', () => {
    const result = segmentIntoParagraphs('This is a short paragraph that contains enough characters to pass the minimum.');
    expect(result.length).toBe(1);
  });

  it('merges paragraphs under minChars with next', () => {
    const text = 'Short.\n\nThis is a longer paragraph that definitely exceeds the minimum character count for a standalone paragraph.';
    const result = segmentIntoParagraphs(text, 50);
    // "Short." is under 50 chars so it should be merged
    expect(result.length).toBe(1);
    expect(result[0]).toContain('Short.');
    expect(result[0]).toContain('longer paragraph');
  });

  it('splits paragraphs over maxChars at sentence boundaries', () => {
    const sentences = Array(20).fill('This is a sentence that adds some length to the paragraph.').join(' ');
    const result = segmentIntoParagraphs(sentences, 50, 200);
    expect(result.length).toBeGreaterThan(1);
    for (const para of result) {
      // Each paragraph should end at a sentence boundary (period)
      expect(para.trimEnd()).toMatch(/[.!?]$/);
    }
  });

  it('strips markdown heading markers', () => {
    const text = '## Introduction\n\nThis is the body text of the introduction paragraph with enough content.';
    const result = segmentIntoParagraphs(text, 10);
    // No paragraph should start with #
    for (const para of result) {
      expect(para).not.toMatch(/^#/);
    }
    expect(result.some(p => p.includes('Introduction'))).toBe(true);
  });

  it('handles multiple paragraphs correctly', () => {
    const text = [
      'First paragraph with enough content to be standalone and pass the minimum character threshold easily.',
      '',
      'Second paragraph also with enough content to be standalone and pass the minimum character threshold.',
      '',
      'Third paragraph with sufficient content to stand alone and pass the minimum character count needed.',
    ].join('\n');
    const result = segmentIntoParagraphs(text, 50);
    expect(result.length).toBe(3);
  });
});

describe('tokenizeParagraphSaccade', () => {
  it('produces one chunk per non-blank line', () => {
    const text = 'The quick brown fox jumps over the lazy dog near the river.';
    const { page, chunks } = tokenizeParagraphSaccade(text);
    const bodyLines = page.lines.filter(l => l.type !== 'blank' && l.text.trim().length > 0);
    expect(chunks.length).toBe(bodyLines.length);
  });

  it('sets pageIndex to 0 for all chunks', () => {
    const text = 'Some text for testing the tokenizer output.';
    const { chunks } = tokenizeParagraphSaccade(text);
    for (const chunk of chunks) {
      expect(chunk.saccade?.pageIndex).toBe(0);
    }
  });

  it('returns page with lines and lineChunks', () => {
    const text = 'Hello world.';
    const { page } = tokenizeParagraphSaccade(text);
    expect(page.lines.length).toBeGreaterThan(0);
    expect(page.lineChunks.length).toBe(page.lines.length);
  });
});

describe('tokenizeParagraphRecall', () => {
  it('produces one chunk per word', () => {
    const text = 'The quick brown fox';
    const { chunks } = tokenizeParagraphRecall(text);
    expect(chunks.length).toBe(4);
    expect(chunks.map(c => c.text)).toEqual(['The', 'quick', 'brown', 'fox']);
  });

  it('each chunk has wordCount 1', () => {
    const text = 'Hello world again';
    const { chunks } = tokenizeParagraphRecall(text);
    for (const chunk of chunks) {
      expect(chunk.wordCount).toBe(1);
    }
  });

  it('sets pageIndex to 0 for all chunks', () => {
    const text = 'A few words here';
    const { chunks } = tokenizeParagraphRecall(text);
    for (const chunk of chunks) {
      expect(chunk.saccade?.pageIndex).toBe(0);
    }
  });
});
