import { describe, expect, it } from 'vitest';
import {
  LEITNER_INTERVALS,
  advanceCard,
  computeNextDueAt,
  getDueCards,
  getInitialBox,
  isCardDue,
  isGraduationEligible,
  lapseCard,
  normalizePromptKey,
  questionNeedsReview,
} from './srsScheduling';
import type { ComprehensionQuestionResult, LeitnerBox, SRSCard } from '../types';

const MS_PER_DAY = 86_400_000;

function makeCard(overrides: Partial<SRSCard> = {}): SRSCard {
  return {
    key: 'test-key',
    box: 1 as LeitnerBox,
    nextDueAt: 0,
    lastReviewedAt: 0,
    createdAt: 0,
    reviewCount: 0,
    lapseCount: 0,
    status: 'active',
    prompt: 'What is X?',
    modelAnswer: 'X is Y.',
    format: 'short-answer',
    dimension: 'factual',
    articleId: 'a1',
    articleTitle: 'Test Article',
    sourceAttemptId: 'att-1',
    ...overrides,
  };
}

describe('srsScheduling', () => {
  describe('computeNextDueAt', () => {
    it('adds the correct interval for each box', () => {
      const ref = 1_000_000;
      for (const [box, days] of Object.entries(LEITNER_INTERVALS)) {
        expect(computeNextDueAt(Number(box) as LeitnerBox, ref)).toBe(
          ref + days * MS_PER_DAY
        );
      }
    });
  });

  describe('getInitialBox', () => {
    it('returns box 1 for needs-review questions', () => {
      expect(getInitialBox(true)).toBe(1);
    });

    it('returns box 3 for correct questions', () => {
      expect(getInitialBox(false)).toBe(3);
    });
  });

  describe('advanceCard', () => {
    it('advances box by 1 and updates scheduling', () => {
      const card = makeCard({ box: 2, reviewCount: 3 });
      const now = 5_000_000;
      const result = advanceCard(card, now);
      expect(result.box).toBe(3);
      expect(result.lastReviewedAt).toBe(now);
      expect(result.nextDueAt).toBe(now + LEITNER_INTERVALS[3] * MS_PER_DAY);
      expect(result.reviewCount).toBe(4);
      expect(result.lapseCount).toBe(card.lapseCount);
    });

    it('caps at box 5', () => {
      const card = makeCard({ box: 5 });
      const result = advanceCard(card, 1000);
      expect(result.box).toBe(5);
    });
  });

  describe('lapseCard', () => {
    it('resets to box 1 and increments lapseCount', () => {
      const card = makeCard({ box: 4, lapseCount: 1, reviewCount: 5 });
      const now = 8_000_000;
      const result = lapseCard(card, now);
      expect(result.box).toBe(1);
      expect(result.lastReviewedAt).toBe(now);
      expect(result.nextDueAt).toBe(now + LEITNER_INTERVALS[1] * MS_PER_DAY);
      expect(result.reviewCount).toBe(6);
      expect(result.lapseCount).toBe(2);
    });
  });

  describe('isCardDue', () => {
    it('returns true when active and nextDueAt <= now', () => {
      expect(isCardDue(makeCard({ nextDueAt: 100, status: 'active' }), 100)).toBe(true);
      expect(isCardDue(makeCard({ nextDueAt: 100, status: 'active' }), 200)).toBe(true);
    });

    it('returns false when nextDueAt > now', () => {
      expect(isCardDue(makeCard({ nextDueAt: 200, status: 'active' }), 100)).toBe(false);
    });

    it('returns false for non-active cards', () => {
      expect(isCardDue(makeCard({ nextDueAt: 0, status: 'complete' }), 100)).toBe(false);
      expect(isCardDue(makeCard({ nextDueAt: 0, status: 'deferred' }), 100)).toBe(false);
    });
  });

  describe('isGraduationEligible', () => {
    it('returns true for box >= 5 and active', () => {
      expect(isGraduationEligible(makeCard({ box: 5, status: 'active' }))).toBe(true);
    });

    it('returns false for lower boxes', () => {
      expect(isGraduationEligible(makeCard({ box: 4, status: 'active' }))).toBe(false);
    });

    it('returns false for non-active', () => {
      expect(isGraduationEligible(makeCard({ box: 5, status: 'complete' }))).toBe(false);
    });
  });

  describe('getDueCards', () => {
    it('filters and sorts by nextDueAt ascending', () => {
      const cards = [
        makeCard({ key: 'c', nextDueAt: 300, status: 'active' }),
        makeCard({ key: 'a', nextDueAt: 100, status: 'active' }),
        makeCard({ key: 'future', nextDueAt: 999, status: 'active' }),
        makeCard({ key: 'done', nextDueAt: 50, status: 'complete' }),
        makeCard({ key: 'b', nextDueAt: 200, status: 'active' }),
      ];
      const due = getDueCards(cards, 500);
      expect(due.map((c) => c.key)).toEqual(['a', 'b', 'c']);
    });

    it('returns empty for no due cards', () => {
      const cards = [makeCard({ nextDueAt: 999, status: 'active' })];
      expect(getDueCards(cards, 100)).toEqual([]);
    });
  });

  describe('normalizePromptKey', () => {
    it('collapses whitespace, trims, and lowercases', () => {
      expect(normalizePromptKey('  What  is   X? ')).toBe('what is x?');
    });

    it('handles already-normalized text', () => {
      expect(normalizePromptKey('hello')).toBe('hello');
    });
  });

  describe('questionNeedsReview', () => {
    const partial = (overrides: Partial<ComprehensionQuestionResult>): ComprehensionQuestionResult => ({
      id: 'q1',
      dimension: 'factual',
      format: 'short-answer',
      prompt: 'test',
      userAnswer: 'test',
      modelAnswer: 'test',
      score: 0,
      feedback: 'test',
      ...overrides,
    });

    it('returns true for incorrect MC questions', () => {
      expect(questionNeedsReview(partial({ correct: false, score: 3 }))).toBe(true);
    });

    it('returns false for correct MC questions', () => {
      expect(questionNeedsReview(partial({ correct: true, score: 0 }))).toBe(false);
    });

    it('returns true for score < 3 when correct is undefined', () => {
      expect(questionNeedsReview(partial({ score: 2 }))).toBe(true);
      expect(questionNeedsReview(partial({ score: 0 }))).toBe(true);
    });

    it('returns false for score >= 3 when correct is undefined', () => {
      expect(questionNeedsReview(partial({ score: 3 }))).toBe(false);
    });
  });
});
