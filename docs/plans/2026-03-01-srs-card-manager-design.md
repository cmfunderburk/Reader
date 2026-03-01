# SRS Card Manager — Design

## Overview

Add an inline card management panel to HomeScreen for browsing, filtering, and managing SRS cards. Enables manual deletion, reset, and suspend/resume of cards outside the review flow.

## Data Layer

Two new functions in `srsStore.ts`:

- **`deleteCard(cards, cardKey) → SRSCard[]`** — filters the card out of the array (hard delete, not recoverable).
- **`resetCard(cards, cardKey, now) → SRSCard[]`** — resets matching card to box 1 with fresh `nextDueAt`, zeroes `reviewCount` and `lapseCount`.

Suspend/resume uses existing `updateCardStatus(cards, cardKey, 'deferred' | 'active')` — no new function needed.

## UI Component: SRSCardManager

New component `SRSCardManager.tsx`, rendered inline on HomeScreen below the review section.

### Filter Bar

Tabs at top: **All | Active | Due | Complete | Deferred** — each shows count in parentheses.

### Card List

Each row displays:
- Prompt text (truncated to ~1 line)
- Box level (e.g., "Box 3")
- Status badge
- Relative due date (e.g., "due in 2d", "due now", "overdue 3d")
- Source article title (small/muted)

### Expandable Detail

`<details>` element (consistent with Review History pattern) reveals:
- Full model answer
- Action buttons: **Delete**, **Reset to Box 1**, **Suspend/Resume** (label toggles based on current status)
- Delete has inline confirmation ("Are you sure?" replaces button, not a modal)

### Props

```typescript
interface SRSCardManagerProps {
  cards: SRSCard[];
  onDeleteCard: (cardKey: string) => void;
  onResetCard: (cardKey: string) => void;
  onUpdateCardStatus: (cardKey: string, status: SRSCardStatus) => void;
}
```

State management stays in the parent; component renders and calls callbacks.

## HomeScreen Integration

- New props: `srsCards`, `onDeleteSRSCard`, `onResetSRSCard`, `onUpdateSRSCardStatus`
- New toggle state `isCardManagerOpen` (independent of `isHistoryOpen`)
- Third button in review-actions: **"Manage Cards"** — toggles the panel
- Opening card manager closes review history (and vice versa) to avoid stacking panels

## App.tsx / useComprehensionState Integration

- New handler `handleDeleteSRSCard(cardKey)` — calls `deleteCard()`, updates state, persists.
- New handler `handleResetSRSCard(cardKey)` — calls `resetCard()`, updates state, persists.
- Existing `handleSRSCardStatusChange` handles suspend/resume.
- Full `srsCards` array and handlers passed down to HomeScreen.

No new app view states — the card manager is a panel within the home view.

## Styling

Styles in existing stylesheet alongside `.comprehension-history-*` rules:
- `.srs-card-manager` — same spacing/background as `.comprehension-history-panel`
- `.srs-filter-bar` — row of small tab buttons, active highlighted
- `.srs-card-list` / `.srs-card-item` — matches history list patterns
- `.srs-card-actions` — row of small action buttons in expanded detail
- `.srs-card-confirm` — inline delete confirmation
