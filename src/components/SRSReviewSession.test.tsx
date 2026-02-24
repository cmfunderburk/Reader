import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SRSReviewSession } from './SRSReviewSession';
import type { SRSCard } from '../types';

function makeCard(overrides: Partial<SRSCard> = {}): SRSCard {
  return {
    key: 'a1::what is x?',
    box: 1,
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
    articleTitle: 'Article 1',
    sourceAttemptId: 'att-1',
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('SRSReviewSession', () => {
  it('shows graduation choices after successful recall while card is already in box 5', () => {
    const onCardReviewed = vi.fn();
    const onCardStatusChange = vi.fn();
    render(
      <SRSReviewSession
        dueCards={[makeCard({ box: 5 })]}
        onCardReviewed={onCardReviewed}
        onCardStatusChange={onCardStatusChange}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show Answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Got It' }));

    expect(onCardReviewed).toHaveBeenCalledWith('a1::what is x?', true);
    expect(screen.getByText(/reached Box 5/i)).toBeTruthy();
  });

  it('does not show graduation choices when advancing from box 4 to box 5', () => {
    const onCardReviewed = vi.fn();
    const onCardStatusChange = vi.fn();
    render(
      <SRSReviewSession
        dueCards={[makeCard({ box: 4 })]}
        onCardReviewed={onCardReviewed}
        onCardStatusChange={onCardStatusChange}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show Answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Got It' }));

    expect(onCardReviewed).toHaveBeenCalledWith('a1::what is x?', true);
    expect(onCardStatusChange).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Review Complete' })).toBeTruthy();
  });
});
