# SRS Card Manager Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an inline card management panel to HomeScreen for browsing, filtering, and managing SRS cards (delete, reset, suspend/resume).

**Architecture:** New `SRSCardManager` component rendered inline on HomeScreen, toggled by a button. Two new pure functions in `srsStore.ts` (deleteCard, resetCard). Handlers wired through `useComprehensionState` → App.tsx → HomeScreen → SRSCardManager.

**Tech Stack:** React 18, TypeScript, Vitest + Testing Library

---

### Task 1: Add deleteCard and resetCard to srsStore

**Files:**
- Modify: `src/lib/srsStore.ts`
- Test: `src/lib/srsStore.test.ts`

**Step 1: Write failing tests for deleteCard and resetCard**

Add to the bottom of `src/lib/srsStore.test.ts`, inside the outer `describe('srsStore', ...)`:

```typescript
describe('deleteCard', () => {
  it('removes the card with matching key', () => {
    const keep = makeCard({ key: 'a1::keep', prompt: 'Keep?' });
    const remove = makeCard({ key: 'a1::remove', prompt: 'Remove?' });
    const result = deleteCard([keep, remove], 'a1::remove');
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('a1::keep');
  });

  it('returns all cards unchanged when key not found', () => {
    const card = makeCard();
    const result = deleteCard([card], 'nonexistent');
    expect(result).toEqual([card]);
  });
});

describe('resetCard', () => {
  it('resets matching card to box 1 with fresh scheduling', () => {
    const card = makeCard({ box: 4, reviewCount: 10, lapseCount: 3 });
    const now = 5_000_000;
    const result = resetCard([card], card.key, now);
    expect(result[0].box).toBe(1);
    expect(result[0].reviewCount).toBe(0);
    expect(result[0].lapseCount).toBe(0);
    expect(result[0].nextDueAt).toBe(now + LEITNER_INTERVALS[1] * MS_PER_DAY);
    expect(result[0].lastReviewedAt).toBe(now);
  });

  it('does not affect other cards', () => {
    const target = makeCard({ key: 'a1::target', box: 4 });
    const other = makeCard({ key: 'a1::other', box: 3 });
    const now = 5_000_000;
    const result = resetCard([target, other], 'a1::target', now);
    expect(result[0].box).toBe(1);
    expect(result[1].box).toBe(3);
  });

  it('preserves card status', () => {
    const card = makeCard({ box: 4, status: 'deferred' });
    const result = resetCard([card], card.key, 5_000_000);
    expect(result[0].status).toBe('deferred');
  });
});
```

Update the import at top of test file to include `deleteCard, resetCard`.

**Step 2: Run tests to verify they fail**

Run: `bun run test:run -- src/lib/srsStore.test.ts`
Expected: FAIL — `deleteCard` and `resetCard` are not exported.

**Step 3: Implement deleteCard and resetCard in srsStore.ts**

Add to the bottom of `src/lib/srsStore.ts`, before the closing of the file:

```typescript
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
```

Note: `LeitnerBox` and `computeNextDueAt` are already imported in srsStore.ts.

**Step 4: Run tests to verify they pass**

Run: `bun run test:run -- src/lib/srsStore.test.ts`
Expected: All PASS.

**Step 5: Commit**

```
feat: add deleteCard and resetCard to srsStore
```

---

### Task 2: Wire handlers in useComprehensionState

**Files:**
- Modify: `src/hooks/useComprehensionState.ts`

**Step 1: Add handleDeleteSRSCard and handleResetSRSCard**

Add imports for `deleteCard` and `resetCard` from `../lib/srsStore` (they're already imported from that module, just add to the existing import).

Add to `UseComprehensionStateReturn` interface:

```typescript
handleDeleteSRSCard: (cardKey: string) => void;
handleResetSRSCard: (cardKey: string) => void;
```

Add handler implementations after the existing `handleSRSCardStatusChange`:

```typescript
const handleDeleteSRSCard = useCallback((cardKey: string) => {
  setSrsCards((existing) => {
    const updated = deleteCard(existing, cardKey);
    saveSRSPool(updated);
    return updated;
  });
}, []);

const handleResetSRSCard = useCallback((cardKey: string) => {
  setSrsCards((existing) => {
    const updated = resetCard(existing, cardKey, Date.now());
    saveSRSPool(updated);
    return updated;
  });
}, []);
```

Add both to the return object.

**Step 2: Verify build compiles**

Run: `bun run lint`
Expected: No errors.

**Step 3: Commit**

```
feat: wire deleteCard and resetCard handlers in useComprehensionState
```

---

### Task 3: Create SRSCardManager component

**Files:**
- Create: `src/components/SRSCardManager.tsx`
- Test: `src/components/SRSCardManager.test.tsx`

**Step 1: Write failing tests**

Create `src/components/SRSCardManager.test.tsx`:

```typescript
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

    fireEvent.click(screen.getByRole('button', { name: /Deferred/i }));
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

    fireEvent.click(screen.getByRole('button', { name: /Complete/i }));
    expect(screen.getByText(/no cards/i)).toBeTruthy();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun run test:run -- src/components/SRSCardManager.test.tsx`
Expected: FAIL — module not found.

**Step 3: Implement SRSCardManager component**

Create `src/components/SRSCardManager.tsx`:

```typescript
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
          <p className="srs-card-model-answer"><strong>Model answer:</strong> {card.modelAnswer}</p>
          <p className="srs-card-meta-line">
            Reviews: {card.reviewCount} · Lapses: {card.lapseCount} · {card.dimension} · {card.format}
          </p>
          <div className="srs-card-actions">
            {confirmingDelete ? (
              <span className="srs-card-confirm">
                Delete this card?{' '}
                <button onClick={() => { onDelete(card.key); setConfirmingDelete(false); }}>Confirm</button>
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

export function SRSCardManager({ cards, onDeleteCard, onResetCard, onUpdateCardStatus }: SRSCardManagerProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const counts = countByTab(cards);
  const filtered = filterCards(cards, activeTab);

  return (
    <section className="srs-card-manager" aria-label="SRS card manager">
      <div className="srs-card-manager-header">
        <h2>SRS Cards</h2>
        <p>{cards.length} total cards</p>
      </div>
      <div className="srs-filter-bar" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
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
```

**Step 4: Run tests to verify they pass**

Run: `bun run test:run -- src/components/SRSCardManager.test.tsx`
Expected: All PASS.

**Step 5: Commit**

```
feat: add SRSCardManager component with filter tabs and card actions
```

---

### Task 4: Integrate into HomeScreen

**Files:**
- Modify: `src/components/HomeScreen.tsx`
- Modify: `src/components/App.tsx`

**Step 1: Update HomeScreen props and add Manage Cards button**

In `HomeScreen.tsx`:

1. Add to imports: `import { SRSCardManager } from './SRSCardManager';` and `import type { SRSCard, SRSCardStatus } from '../types';`

2. Add to `HomeScreenProps`:
```typescript
srsCards: SRSCard[];
onDeleteSRSCard: (cardKey: string) => void;
onResetSRSCard: (cardKey: string) => void;
onUpdateSRSCardStatus: (cardKey: string, status: SRSCardStatus) => void;
```

3. Destructure the new props in the component function.

4. Add `isCardManagerOpen` state (like `isHistoryOpen`):
```typescript
const [isCardManagerOpen, setIsCardManagerOpen] = useState(false);
```

5. Add a third button in `div.review-actions` (after the Review History button):
```tsx
<button
  className="launcher-secondary-btn"
  onClick={() => {
    setIsCardManagerOpen((v) => !v);
    if (!isCardManagerOpen) setIsHistoryOpen(false);
  }}
>
  {isCardManagerOpen ? 'Hide Cards' : 'Manage Cards'}
</button>
```

6. Update the Review History button's onClick to also close the card manager:
```tsx
onClick={() => {
  setIsHistoryOpen((v) => !v);
  if (!isHistoryOpen) setIsCardManagerOpen(false);
}}
```

7. After the comprehension history panel section (the `{isHistoryOpen && (...)}` block), add:
```tsx
{isCardManagerOpen && (
  <SRSCardManager
    cards={srsCards}
    onDeleteCard={onDeleteSRSCard}
    onResetCard={onResetSRSCard}
    onUpdateCardStatus={onUpdateSRSCardStatus}
  />
)}
```

**Step 2: Wire props in App.tsx**

In `App.tsx`, update the `<HomeScreen>` JSX to pass the new props:

```tsx
srsCards={srsCards}
onDeleteSRSCard={comp.handleDeleteSRSCard}
onResetSRSCard={comp.handleResetSRSCard}
onUpdateSRSCardStatus={comp.handleSRSCardStatusChange}
```

**Step 3: Verify build compiles and lint passes**

Run: `bun run lint`
Expected: No errors.

**Step 4: Commit**

```
feat: integrate SRSCardManager into HomeScreen with manage cards toggle
```

---

### Task 5: Add CSS styles

**Files:**
- Modify: `src/index.css`

**Step 1: Add SRS card manager styles**

Add after the `.comprehension-history-answer p` rule block (around line 2916), before the `@media` query:

```css
/* SRS Card Manager */
.srs-card-manager {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-secondary);
  padding: 0.9rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.srs-card-manager-header h2 {
  font-size: 1rem;
  margin-bottom: 0.25rem;
}

.srs-card-manager-header p {
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.srs-filter-bar {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.srs-filter-tab {
  padding: 0.3rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 0.78rem;
  cursor: pointer;
}

.srs-filter-tab-active {
  background: var(--accent);
  color: var(--bg-primary);
  border-color: var(--accent);
}

.srs-card-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: min(52vh, 460px);
  overflow-y: auto;
  padding-right: 0.2rem;
}

.srs-card-item {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
  padding: 0.65rem 0.8rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.srs-card-row {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.srs-card-prompt {
  font-size: 0.88rem;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.srs-card-box {
  font-size: 0.75rem;
  color: var(--text-secondary);
  white-space: nowrap;
}

.srs-card-status {
  font-size: 0.72rem;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  white-space: nowrap;
}

.srs-card-due {
  font-size: 0.75rem;
  color: var(--text-muted);
  white-space: nowrap;
}

.srs-card-source {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.srs-card-details summary {
  cursor: pointer;
  color: var(--accent);
  font-size: 0.82rem;
}

.srs-card-detail-content {
  margin-top: 0.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.srs-card-model-answer {
  font-size: 0.82rem;
  line-height: 1.4;
}

.srs-card-meta-line {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.srs-card-actions {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.srs-card-actions button {
  padding: 0.25rem 0.55rem;
  font-size: 0.75rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  cursor: pointer;
}

.srs-card-confirm {
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.srs-card-empty {
  color: var(--text-secondary);
  font-size: 0.9rem;
}
```

**Step 2: Verify visual appearance**

Run: `bun run dev`
Visually confirm the card manager panel renders correctly on the HomeScreen.

**Step 3: Commit**

```
feat: add SRS card manager styles
```

---

### Task 6: Run full test suite and lint

**Step 1: Run all tests**

Run: `bun run verify`
Expected: All tests pass, lint clean, build succeeds.

**Step 2: Fix any issues found**

Address any type errors, lint warnings, or test failures.

**Step 3: Final commit (if fixes needed)**

```
fix: address review issues from SRS card manager integration
```
