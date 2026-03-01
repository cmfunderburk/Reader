import type {
  ComprehensionAttempt,
  ComprehensionQuestionResult,
  LeitnerBox,
  SRSCard,
  SRSCardStatus,
} from '../types';
import {
  computeNextDueAt,
  getInitialBox,
  normalizePromptKey,
  questionNeedsReview,
  advanceCard,
  lapseCard,
} from './srsScheduling';

const STORAGE_KEY = 'speedread_srs_pool';
const BACKFILL_INITIALIZED_KEY = 'speedread_srs_backfill_initialized';
const MAX_CARDS = 500;

const VALID_STATUSES: SRSCardStatus[] = ['active', 'complete', 'deferred'];
const VALID_BOXES: LeitnerBox[] = [1, 2, 3, 4, 5];

function buildCardKey(articleId: string, prompt: string): string {
  return `${articleId.trim()}::${normalizePromptKey(prompt)}`;
}

function isValidCard(card: unknown): card is SRSCard {
  if (typeof card !== 'object' || card === null) return false;
  const c = card as Record<string, unknown>;
  return (
    typeof c.key === 'string' && c.key.length > 0 &&
    typeof c.box === 'number' && VALID_BOXES.includes(c.box as LeitnerBox) &&
    typeof c.nextDueAt === 'number' &&
    typeof c.lastReviewedAt === 'number' &&
    typeof c.createdAt === 'number' &&
    typeof c.reviewCount === 'number' &&
    typeof c.lapseCount === 'number' &&
    typeof c.status === 'string' && VALID_STATUSES.includes(c.status as SRSCardStatus) &&
    typeof c.prompt === 'string' &&
    typeof c.modelAnswer === 'string' &&
    typeof c.format === 'string' &&
    typeof c.dimension === 'string' &&
    typeof c.articleId === 'string' &&
    typeof c.articleTitle === 'string' &&
    typeof c.sourceAttemptId === 'string'
  );
}

export function loadSRSPool(): SRSCard[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const filtered = parsed.filter(isValidCard).slice(0, MAX_CARDS);
    const cardsByKey = new Map<string, SRSCard>();

    for (const card of filtered) {
      const normalizedCard = {
        ...card,
        key: buildCardKey(card.articleId, card.prompt),
      };
      const existing = cardsByKey.get(normalizedCard.key);
      if (!existing || normalizedCard.lastReviewedAt >= existing.lastReviewedAt) {
        cardsByKey.set(normalizedCard.key, normalizedCard);
      }
    }

    return Array.from(cardsByKey.values()).slice(0, MAX_CARDS);
  } catch {
    return [];
  }
}

export function saveSRSPool(cards: SRSCard[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards.slice(0, MAX_CARDS)));
}

export function hasInitializedSRSBackfill(): boolean {
  try {
    return localStorage.getItem(BACKFILL_INITIALIZED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markSRSBackfillInitialized(): void {
  try {
    localStorage.setItem(BACKFILL_INITIALIZED_KEY, '1');
  } catch {
    // no-op: best-effort sentinel to prevent repeated auto-backfill
  }
}

function buildCardFromQuestion(
  question: ComprehensionQuestionResult,
  attempt: ComprehensionAttempt,
  now: number,
): SRSCard {
  const needsReview = questionNeedsReview(question);
  const box = getInitialBox(needsReview);
  return {
    key: buildCardKey(attempt.articleId, question.prompt),
    box,
    nextDueAt: computeNextDueAt(box, now),
    lastReviewedAt: now,
    createdAt: now,
    reviewCount: 0,
    lapseCount: 0,
    status: 'active',
    prompt: question.prompt,
    modelAnswer: question.modelAnswer,
    format: question.format,
    dimension: question.dimension,
    section: question.section,
    articleId: attempt.articleId,
    articleTitle: attempt.articleTitle,
    sourceAttemptId: attempt.id,
  };
}

export function ingestComprehensionAttempt(
  existingCards: SRSCard[],
  attempt: ComprehensionAttempt,
  now: number,
): SRSCard[] {
  const cardMap = new Map(existingCards.map((c) => [c.key, c]));

  for (const question of attempt.questions) {
    const key = buildCardKey(attempt.articleId, question.prompt);
    const existing = cardMap.get(key);

    if (existing) {
      // Update metadata, preserve scheduling state
      cardMap.set(key, {
        ...existing,
        modelAnswer: question.modelAnswer,
        articleTitle: attempt.articleTitle,
        sourceAttemptId: attempt.id,
        section: question.section,
      });
    } else {
      cardMap.set(key, buildCardFromQuestion(question, attempt, now));
    }
  }

  return Array.from(cardMap.values()).slice(0, MAX_CARDS);
}

export function backfillFromAttempts(attempts: ComprehensionAttempt[]): SRSCard[] {
  // Process oldest-first so newer attempts update metadata
  const sorted = [...attempts].sort((a, b) => a.createdAt - b.createdAt);
  let cards: SRSCard[] = [];
  for (const attempt of sorted) {
    cards = ingestComprehensionAttempt(cards, attempt, attempt.createdAt);
  }
  return cards;
}

export function updateCardAfterReview(
  cards: SRSCard[],
  cardKey: string,
  selfGradeCorrect: boolean,
  reviewedAt: number,
): SRSCard[] {
  return cards.map((card) => {
    if (card.key !== cardKey) return card;
    return selfGradeCorrect ? advanceCard(card, reviewedAt) : lapseCard(card, reviewedAt);
  });
}

export function updateCardStatus(
  cards: SRSCard[],
  cardKey: string,
  status: SRSCardStatus,
): SRSCard[] {
  return cards.map((card) => {
    if (card.key !== cardKey) return card;
    return { ...card, status };
  });
}

export function deleteCard(cards: SRSCard[], cardKey: string): SRSCard[] {
  return cards.filter((card) => card.key !== cardKey);
}

export function resetCard(cards: SRSCard[], cardKey: string, now: number): SRSCard[] {
  return cards.map((card) => {
    if (card.key !== cardKey) return card;
    return {
      ...card,
      box: 1 as LeitnerBox,
      reviewCount: 0,
      lapseCount: 0,
      lastReviewedAt: now,
      nextDueAt: computeNextDueAt(1, now),
    };
  });
}
