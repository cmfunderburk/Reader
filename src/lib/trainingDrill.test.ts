import { describe, expect, it } from 'vitest';
import { adjustDrillDifficulty, getDrillRound } from './trainingDrill';

describe('getDrillRound', () => {
  const sentences = [
    'First sentence.',
    'Second sentence is here.',
    'Third one closes it out.',
  ];

  it('returns one sentence when auto-adjust is off', () => {
    const round = getDrillRound(sentences, 0, 500, false);
    expect(round).toEqual({ text: 'First sentence.', sentenceCount: 1 });
  });

  it('accumulates sentences when auto-adjust is on and under the char limit', () => {
    const round = getDrillRound(sentences, 0, 50, true);
    expect(round).toEqual({
      text: 'First sentence. Second sentence is here.',
      sentenceCount: 2,
    });
  });

  it('always includes at least one sentence in adaptive mode', () => {
    const round = getDrillRound(sentences, 1, 1, true);
    expect(round).toEqual({ text: 'Second sentence is here.', sentenceCount: 1 });
  });
});

describe('adjustDrillDifficulty', () => {
  it('increases wpm first on a successful round', () => {
    const next = adjustDrillDifficulty(200, 50, true);
    expect(next).toEqual({ wpm: 215, charLimit: 50 });
  });

  it('decreases wpm at minimum char limit on a failed round', () => {
    const next = adjustDrillDifficulty(200, 50, false);
    expect(next).toEqual({ wpm: 175, charLimit: 50 });
  });
});
