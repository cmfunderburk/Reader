import { useState } from 'react';
import type { SRSCard, SRSCardStatus } from '../types';

type FilterTab = 'all' | 'active' | 'due' | 'complete' | 'deferred';

interface SRSCardManagerProps {
  cards: SRSCard[];
  onDeleteCard: (cardKey: string) => void;
  onResetCard: (cardKey: string) => void;
  onUpdateCardStatus: (cardKey: string, status: SRSCardStatus) => void;
}

function formatRelativeDue(nextDueAt: number): string {
  const now = Date.now();
  const diffMs = nextDueAt - now;
  const diffDays = Math.round(diffMs / 86_400_000);
  if (diffDays < 0) return `overdue ${Math.abs(diffDays)}d`;
  if (diffDays === 0) return 'due now';
  return `due in ${diffDays}d`;
}

function filterCards(cards: SRSCard[], tab: FilterTab): SRSCard[] {
  const now = Date.now();
  switch (tab) {
    case 'active':
      return cards.filter((c) => c.status === 'active');
    case 'due':
      return cards.filter((c) => c.status === 'active' && c.nextDueAt <= now);
    case 'complete':
      return cards.filter((c) => c.status === 'complete');
    case 'deferred':
      return cards.filter((c) => c.status === 'deferred');
    default:
      return cards;
  }
}

function countByTab(cards: SRSCard[]): Record<FilterTab, number> {
  const now = Date.now();
  return {
    all: cards.length,
    active: cards.filter((c) => c.status === 'active').length,
    due: cards.filter((c) => c.status === 'active' && c.nextDueAt <= now).length,
    complete: cards.filter((c) => c.status === 'complete').length,
    deferred: cards.filter((c) => c.status === 'deferred').length,
  };
}

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'due', label: 'Due' },
  { key: 'complete', label: 'Complete' },
  { key: 'deferred', label: 'Deferred' },
];

function CardItem({
  card,
  onDelete,
  onReset,
  onUpdateStatus,
}: {
  card: SRSCard;
  onDelete: (key: string) => void;
  onReset: (key: string) => void;
  onUpdateStatus: (key: string, status: SRSCardStatus) => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <article className="srs-card-item">
      <div className="srs-card-row">
        <span className="srs-card-prompt">{card.prompt}</span>
        <span className="srs-card-box">Box {card.box}</span>
        <span className={`srs-card-status srs-card-status-${card.status}`}>{card.status}</span>
        <span className="srs-card-due">{formatRelativeDue(card.nextDueAt)}</span>
      </div>
      <p className="srs-card-source">{card.articleTitle}</p>
      <details className="srs-card-details">
        <summary>Show details</summary>
        <div className="srs-card-detail-content">
          <p className="srs-card-model-answer">
            <strong>Model answer:</strong> {card.modelAnswer}
          </p>
          <p className="srs-card-meta-line">
            Reviews: {card.reviewCount} · Lapses: {card.lapseCount} · {card.dimension} · {card.format}
          </p>
          <div className="srs-card-actions">
            {confirmingDelete ? (
              <span className="srs-card-confirm">
                Delete this card?{' '}
                <button
                  onClick={() => {
                    onDelete(card.key);
                    setConfirmingDelete(false);
                  }}
                >
                  Confirm
                </button>
                <button onClick={() => setConfirmingDelete(false)}>Cancel</button>
              </span>
            ) : (
              <button onClick={() => setConfirmingDelete(true)}>Delete</button>
            )}
            <button onClick={() => onReset(card.key)}>Reset to Box 1</button>
            {card.status === 'active' ? (
              <button onClick={() => onUpdateStatus(card.key, 'deferred')}>Suspend</button>
            ) : card.status === 'deferred' ? (
              <button onClick={() => onUpdateStatus(card.key, 'active')}>Resume</button>
            ) : null}
          </div>
        </div>
      </details>
    </article>
  );
}

export function SRSCardManager({
  cards,
  onDeleteCard,
  onResetCard,
  onUpdateCardStatus,
}: SRSCardManagerProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const counts = countByTab(cards);
  const filtered = filterCards(cards, activeTab);

  return (
    <section className="srs-card-manager" aria-label="SRS card manager">
      <div className="srs-card-manager-header">
        <h2>SRS Cards</h2>
        <p>{cards.length} total cards</p>
      </div>
      <div className="srs-filter-bar">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`srs-filter-tab${activeTab === tab.key ? ' srs-filter-tab-active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label} ({counts[tab.key]})
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="srs-card-empty">No cards match this filter.</p>
      ) : (
        <div className="srs-card-list">
          {filtered.map((card) => (
            <CardItem
              key={card.key}
              card={card}
              onDelete={onDeleteCard}
              onReset={onResetCard}
              onUpdateStatus={onUpdateCardStatus}
            />
          ))}
        </div>
      )}
    </section>
  );
}
