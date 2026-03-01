import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SRSCardManager } from './SRSCardManager';
import type { SRSCard, LeitnerBox } from '../types';

function makeCard(overrides: Partial<SRSCard> = {}): SRSCard {
  return {
    key: 'a1::what is x?',
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
    articleTitle: 'Article 1',
    sourceAttemptId: 'att-1',
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('SRSCardManager', () => {
  it('renders card list with prompt and metadata', () => {
    const card = makeCard({ box: 3 });
    render(
      <SRSCardManager
        cards={[card]}
        onDeleteCard={vi.fn()}
        onResetCard={vi.fn()}
        onUpdateCardStatus={vi.fn()}
      />
    );
    expect(screen.getByText('What is X?')).toBeTruthy();
    expect(screen.getByText('Box 3')).toBeTruthy();
    expect(screen.getByText('Article 1')).toBeTruthy();
  });

  it('filters by status tab', () => {
    const active = makeCard({ key: 'a1::active', prompt: 'Active Q?', status: 'active' });
    const deferred = makeCard({ key: 'a1::deferred', prompt: 'Deferred Q?', status: 'deferred' });
    render(
      <SRSCardManager
        cards={[active, deferred]}
        onDeleteCard={vi.fn()}
        onResetCard={vi.fn()}
        onUpdateCardStatus={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: /Deferred/i }));
    expect(screen.getByText('Deferred Q?')).toBeTruthy();
    expect(screen.queryByText('Active Q?')).toBeNull();
  });

  it('calls onDeleteCard after confirmation', () => {
    const onDelete = vi.fn();
    render(
      <SRSCardManager
        cards={[makeCard()]}
        onDeleteCard={onDelete}
        onResetCard={vi.fn()}
        onUpdateCardStatus={vi.fn()}
      />
    );

    // Expand card detail
    fireEvent.click(screen.getByText('Show details'));
    // Click delete
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    // Confirm
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onDelete).toHaveBeenCalledWith('a1::what is x?');
  });

  it('does not call onDeleteCard when cancelled', () => {
    const onDelete = vi.fn();
    render(
      <SRSCardManager
        cards={[makeCard()]}
        onDeleteCard={onDelete}
        onResetCard={vi.fn()}
        onUpdateCardStatus={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Show details'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('calls onResetCard', () => {
    const onReset = vi.fn();
    render(
      <SRSCardManager
        cards={[makeCard({ box: 4 })]}
        onDeleteCard={vi.fn()}
        onResetCard={onReset}
        onUpdateCardStatus={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Show details'));
    fireEvent.click(screen.getByRole('button', { name: 'Reset to Box 1' }));
    expect(onReset).toHaveBeenCalledWith('a1::what is x?');
  });

  it('shows Suspend for active cards and Resume for deferred cards', () => {
    const active = makeCard({ key: 'a1::active', prompt: 'Active Q?', status: 'active' });
    const deferred = makeCard({ key: 'a1::deferred', prompt: 'Deferred Q?', status: 'deferred' });
    render(
      <SRSCardManager
        cards={[active, deferred]}
        onDeleteCard={vi.fn()}
        onResetCard={vi.fn()}
        onUpdateCardStatus={vi.fn()}
      />
    );

    // Expand active card — "All" tab shows both
    const summaries = screen.getAllByText('Show details');
    fireEvent.click(summaries[0]);
    expect(screen.getByRole('button', { name: 'Suspend' })).toBeTruthy();

    fireEvent.click(summaries[1]);
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();
  });

  it('calls onUpdateCardStatus with deferred when suspending', () => {
    const onUpdateStatus = vi.fn();
    render(
      <SRSCardManager
        cards={[makeCard({ status: 'active' })]}
        onDeleteCard={vi.fn()}
        onResetCard={vi.fn()}
        onUpdateCardStatus={onUpdateStatus}
      />
    );

    fireEvent.click(screen.getByText('Show details'));
    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    expect(onUpdateStatus).toHaveBeenCalledWith('a1::what is x?', 'deferred');
  });

  it('shows empty message when no cards match filter', () => {
    render(
      <SRSCardManager
        cards={[makeCard({ status: 'active' })]}
        onDeleteCard={vi.fn()}
        onResetCard={vi.fn()}
        onUpdateCardStatus={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: /Complete/i }));
    expect(screen.getByText(/no cards/i)).toBeTruthy();
  });
});
