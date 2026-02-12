import { describe, expect, it } from 'vitest';
import { DRILL_WPM_STEP, adjustDrillDifficulty, getDrillRound } from './trainingDrill';

describe('getDrillRound', () => {
  const sentences = [
    'First sentence.',
    'Second sentence is here.',
    'Third one closes it out.',
  ];

  it('returns one sentence when auto-adjust is off', () => {
    const round = getDrillRound(sentences, 0);
    expect(round).toEqual({ text: 'First sentence.', sentenceCount: 1 });
  });

  it('always includes exactly one sentence', () => {
    const round = getDrillRound(sentences, 1);
    expect(round).toEqual({ text: 'Second sentence is here.', sentenceCount: 1 });
  });
});

describe('adjustDrillDifficulty', () => {
  it('increases wpm by fixed step on success, bounded by max', () => {
    const next = adjustDrillDifficulty(200, 150, 220, true);
    expect(next).toEqual({ wpm: 200 + DRILL_WPM_STEP });
  });

  it('decreases wpm by fixed step on failure, bounded by min', () => {
    const next = adjustDrillDifficulty(200, 195, 260, false);
    expect(next).toEqual({ wpm: 195 });
  });

  it('clamps invalid min/max ordering', () => {
    const next = adjustDrillDifficulty(300, 450, 250, false);
    expect(next).toEqual({ wpm: 290 });
  });
});
