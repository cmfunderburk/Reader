import { afterEach, describe, expect, it } from 'vitest';
import {
  backfillFromAttempts,
  ingestComprehensionAttempt,
  loadSRSPool,
  saveSRSPool,
  updateCardAfterReview,
  updateCardStatus,
} from './srsStore';
import type { ComprehensionAttempt, SRSCard, LeitnerBox } from '../types';
import { LEITNER_INTERVALS } from './srsScheduling';

const MS_PER_DAY = 86_400_000;

function makeCard(overrides: Partial<SRSCard> = {}): SRSCard {
  return {
    key: 'what is x?',
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

function makeAttempt(overrides: Partial<ComprehensionAttempt> = {}): ComprehensionAttempt {
  return {
    id: 'att-1',
    articleId: 'a1',
    articleTitle: 'Test Article',
    entryPoint: 'launcher',
    questions: [
      {
        id: 'q1',
        dimension: 'factual',
        format: 'short-answer',
        prompt: 'What is X?',
        userAnswer: 'Y',
        modelAnswer: 'X is Y.',
        score: 2,
        feedback: 'Partially correct.',
      },
      {
        id: 'q2',
        dimension: 'inference',
        format: 'essay',
        prompt: 'Why does Z matter?',
        userAnswer: 'Because reasons.',
        modelAnswer: 'Z matters because of A and B.',
        score: 3,
        feedback: 'Good.',
      },
    ],
    overallScore: 75,
    createdAt: 1_000_000,
    durationMs: 60_000,
    ...overrides,
  };
}

afterEach(() => {
  localStorage.clear();
});

describe('srsStore', () => {
  describe('loadSRSPool / saveSRSPool', () => {
    it('round-trips valid cards', () => {
      const cards = [makeCard(), makeCard({ key: 'second', prompt: 'Second?' })];
      saveSRSPool(cards);
      const loaded = loadSRSPool();
      expect(loaded).toEqual(cards);
    });

    it('returns empty array for missing data', () => {
      expect(loadSRSPool()).toEqual([]);
    });

    it('returns empty array for non-array data', () => {
      localStorage.setItem('speedread_srs_pool', '"not-array"');
      expect(loadSRSPool()).toEqual([]);
    });

    it('filters out malformed cards', () => {
      const valid = makeCard();
      const malformed = { key: 'bad' }; // missing required fields
      localStorage.setItem('speedread_srs_pool', JSON.stringify([valid, malformed]));
      const loaded = loadSRSPool();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].key).toBe(valid.key);
    });

    it('rejects cards with invalid box values', () => {
      const bad = { ...makeCard(), box: 6 };
      localStorage.setItem('speedread_srs_pool', JSON.stringify([bad]));
      expect(loadSRSPool()).toEqual([]);
    });

    it('rejects cards with invalid status', () => {
      const bad = { ...makeCard(), status: 'invalid' };
      localStorage.setItem('speedread_srs_pool', JSON.stringify([bad]));
      expect(loadSRSPool()).toEqual([]);
    });
  });

  describe('ingestComprehensionAttempt', () => {
    it('creates new cards from attempt questions', () => {
      const attempt = makeAttempt();
      const now = 2_000_000;
      const cards = ingestComprehensionAttempt([], attempt, now);
      expect(cards).toHaveLength(2);

      // q1: score 2 -> needs review -> box 1
      const q1Card = cards.find((c) => c.prompt === 'What is X?')!;
      expect(q1Card.box).toBe(1);
      expect(q1Card.nextDueAt).toBe(now + LEITNER_INTERVALS[1] * MS_PER_DAY);
      expect(q1Card.articleId).toBe('a1');

      // q2: score 3 -> does not need review -> box 3
      const q2Card = cards.find((c) => c.prompt === 'Why does Z matter?')!;
      expect(q2Card.box).toBe(3);
      expect(q2Card.nextDueAt).toBe(now + LEITNER_INTERVALS[3] * MS_PER_DAY);
    });

    it('deduplicates by normalized prompt key', () => {
      const attempt = makeAttempt();
      const now = 2_000_000;
      const initial = ingestComprehensionAttempt([], attempt, now);

      // Re-ingest same attempt — should not add duplicates
      const result = ingestComprehensionAttempt(initial, attempt, now + 1000);
      expect(result).toHaveLength(2);
    });

    it('updates metadata on existing cards without changing scheduling', () => {
      const now = 2_000_000;
      const existingCard = makeCard({
        box: 4,
        reviewCount: 10,
        nextDueAt: 9_999_999,
        modelAnswer: 'Old answer',
      });
      const attempt = makeAttempt({
        id: 'att-2',
        articleTitle: 'Updated Title',
        questions: [
          {
            id: 'q1',
            dimension: 'factual',
            format: 'short-answer',
            prompt: 'What is X?',
            userAnswer: 'Y',
            modelAnswer: 'New answer',
            score: 3,
            feedback: 'Good.',
          },
        ],
      });

      const result = ingestComprehensionAttempt([existingCard], attempt, now);
      expect(result).toHaveLength(1);
      const card = result[0];
      // Metadata updated
      expect(card.modelAnswer).toBe('New answer');
      expect(card.articleTitle).toBe('Updated Title');
      expect(card.sourceAttemptId).toBe('att-2');
      // Scheduling preserved
      expect(card.box).toBe(4);
      expect(card.reviewCount).toBe(10);
      expect(card.nextDueAt).toBe(9_999_999);
    });
  });

  describe('backfillFromAttempts', () => {
    it('processes attempts oldest-first', () => {
      const older = makeAttempt({
        id: 'att-old',
        createdAt: 1_000_000,
        articleTitle: 'Old Title',
        questions: [
          {
            id: 'q1',
            dimension: 'factual',
            format: 'short-answer',
            prompt: 'What is X?',
            userAnswer: 'Y',
            modelAnswer: 'Old answer',
            score: 2,
            feedback: 'Partial.',
          },
        ],
      });
      const newer = makeAttempt({
        id: 'att-new',
        createdAt: 2_000_000,
        articleTitle: 'New Title',
        questions: [
          {
            id: 'q1',
            dimension: 'factual',
            format: 'short-answer',
            prompt: 'What is X?',
            userAnswer: 'Y',
            modelAnswer: 'New answer',
            score: 3,
            feedback: 'Good.',
          },
        ],
      });

      // Pass in reverse order — should still process oldest first
      const cards = backfillFromAttempts([newer, older]);
      expect(cards).toHaveLength(1);
      expect(cards[0].modelAnswer).toBe('New answer');
      expect(cards[0].articleTitle).toBe('New Title');
    });

    it('returns empty for empty attempts', () => {
      expect(backfillFromAttempts([])).toEqual([]);
    });
  });

  describe('updateCardAfterReview', () => {
    it('advances card on correct self-grade', () => {
      const card = makeCard({ box: 2, reviewCount: 1 });
      const now = 5_000_000;
      const result = updateCardAfterReview([card], card.key, true, now);
      expect(result[0].box).toBe(3);
      expect(result[0].reviewCount).toBe(2);
    });

    it('lapses card on incorrect self-grade', () => {
      const card = makeCard({ box: 4, reviewCount: 3, lapseCount: 0 });
      const now = 5_000_000;
      const result = updateCardAfterReview([card], card.key, false, now);
      expect(result[0].box).toBe(1);
      expect(result[0].lapseCount).toBe(1);
      expect(result[0].reviewCount).toBe(4);
    });

    it('does not affect other cards', () => {
      const target = makeCard({ key: 'target', box: 2 });
      const other = makeCard({ key: 'other', box: 3 });
      const result = updateCardAfterReview([target, other], 'target', true, 1000);
      expect(result[0].box).toBe(3);
      expect(result[1].box).toBe(3); // unchanged
      expect(result[1].reviewCount).toBe(0); // unchanged
    });
  });

  describe('updateCardStatus', () => {
    it('sets card status', () => {
      const card = makeCard({ status: 'active' });
      const result = updateCardStatus([card], card.key, 'complete');
      expect(result[0].status).toBe('complete');
    });

    it('does not affect other cards', () => {
      const target = makeCard({ key: 'target', status: 'active' });
      const other = makeCard({ key: 'other', status: 'active' });
      const result = updateCardStatus([target, other], 'target', 'deferred');
      expect(result[0].status).toBe('deferred');
      expect(result[1].status).toBe('active');
    });
  });
});
