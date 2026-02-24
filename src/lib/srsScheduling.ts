import type { ComprehensionQuestionResult, LeitnerBox, SRSCard } from '../types';

export const LEITNER_INTERVALS: Record<LeitnerBox, number> = {
  1: 1,
  2: 3,
  3: 7,
  4: 14,
  5: 30,
};

const MS_PER_DAY = 86_400_000;

export function computeNextDueAt(box: LeitnerBox, referenceMs: number): number {
  return referenceMs + LEITNER_INTERVALS[box] * MS_PER_DAY;
}

export function getInitialBox(needsReview: boolean): LeitnerBox {
  return needsReview ? 1 : 3;
}

export function advanceCard(card: SRSCard, reviewedAt: number): SRSCard {
  const nextBox = Math.min(card.box + 1, 5) as LeitnerBox;
  return {
    ...card,
    box: nextBox,
    lastReviewedAt: reviewedAt,
    nextDueAt: computeNextDueAt(nextBox, reviewedAt),
    reviewCount: card.reviewCount + 1,
  };
}

export function lapseCard(card: SRSCard, reviewedAt: number): SRSCard {
  return {
    ...card,
    box: 1,
    lastReviewedAt: reviewedAt,
    nextDueAt: computeNextDueAt(1, reviewedAt),
    reviewCount: card.reviewCount + 1,
    lapseCount: card.lapseCount + 1,
  };
}

export function isCardDue(card: SRSCard, now: number): boolean {
  return card.status === 'active' && card.nextDueAt <= now;
}

export function isGraduationEligible(card: SRSCard): boolean {
  return card.box >= 5 && card.status === 'active';
}

export function getDueCards(cards: SRSCard[], now: number): SRSCard[] {
  return cards
    .filter((card) => isCardDue(card, now))
    .sort((a, b) => a.nextDueAt - b.nextDueAt);
}

export function normalizePromptKey(prompt: string): string {
  return prompt.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function questionNeedsReview(question: ComprehensionQuestionResult): boolean {
  if (question.correct !== undefined) {
    return !question.correct;
  }
  return question.score < 3;
}
