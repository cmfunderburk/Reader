# SpeedRead - Modern RSVP News Reader

## Vision Summary

A personal-use web app for speed-reading daily news. Users paste URLs (including paywalled sources via bookmarklet), preview the full article, then read via RSVP display with configurable chunking modes. Punctuation-aware tokenization maintains reading flow.

## Architecture

**Stack**: TypeScript + React + Vite (client-side only)

```
speed/
├── src/
│   ├── components/
│   │   ├── App.tsx              # Main app shell
│   │   ├── Reader.tsx           # RSVP display component
│   │   ├── ReaderControls.tsx   # Transport, speed, mode controls
│   │   ├── ProgressBar.tsx      # Scrubbing progress bar
│   │   ├── ArticlePreview.tsx   # Full article preview before reading
│   │   ├── ArticleQueue.tsx     # Reading queue panel
│   │   ├── FeedManager.tsx      # RSS feed management
│   │   ├── AddContent.tsx       # URL input / paste modal
│   │   └── Settings.tsx         # Global settings panel
│   ├── lib/
│   │   ├── tokenizer.ts         # Punctuation-aware chunking engine
│   │   ├── rsvp.ts              # RSVP timing and ORP calculation
│   │   ├── extractor.ts         # Article extraction (Readability)
│   │   ├── feeds.ts             # RSS fetching and parsing
│   │   └── storage.ts           # localStorage persistence layer
│   ├── hooks/
│   │   ├── useRSVP.ts           # RSVP playback state management
│   │   ├── useKeyboard.ts       # Keyboard shortcut handling
│   │   └── useStorage.ts        # Persistent state hooks
│   ├── types/
│   │   └── index.ts             # TypeScript interfaces
│   ├── main.tsx
│   └── index.css
├── public/
│   └── bookmarklet.js           # Bookmarklet source for paywalled sites
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Key Design Decisions

### Tokenization Model

Three modes, all punctuation-aware:

| Mode | Target | Behavior |
|------|--------|----------|
| Word | 1 word | Classic RSVP, breaks on whitespace |
| Phrase | 2-4 words | Targets 3 words, respects punctuation |
| Clause | 5-8 words | Full clauses, breaks at sentence punctuation |

**Rule**: Chunks END at punctuation even if below target. Chunks NEVER cross major punctuation.

### Timing Formula

```
display_time = base_time + (word_count * 0.6 * per_word_time)
```

Where `per_word_time = 60000 / WPM`

### ORP Calculation

Optimal Reading Point at ~35% of chunk width, highlighted character.

### Content Input

1. **URL paste** - Fetch via local CORS proxy, extract with Readability.js
2. **Bookmarklet** - For paywalled sites, extracts from logged-in browser DOM
3. **Text paste** - Manual fallback

---

## Phases

### Phase 1: Core Infrastructure

| ID | Feature | Description |
|----|---------|-------------|
| FEAT-001 | Vite + React + TypeScript scaffold | Project setup with dependencies |
| FEAT-002 | Tokenizer engine | Word/Phrase/Clause modes with punctuation-awareness |
| FEAT-003 | RSVP timing engine | ORP calculation, timing formula implementation |
| FEAT-004 | Basic Reader component | Display chunks with ORP highlighting |

**Exit Criteria**: Can tokenize sample text in all three modes, display chunks one at a time with correct timing.

---

### Phase 2: Reader UI

| ID | Feature | Description |
|----|---------|-------------|
| FEAT-005 | Full chrome layout | Header, reader area, queue panel structure |
| FEAT-006 | Transport controls | Play/pause, prev/next chunk, skip to start/end |
| FEAT-007 | Progress bar | Visual progress with click-to-scrub |
| FEAT-008 | Speed selector | WPM adjustment (100-800 range) |
| FEAT-009 | Mode selector | Word/Phrase/Clause dropdown |
| FEAT-010 | Keyboard shortcuts | Space (pause), ←/→ (prev/next), [/] (speed) |
| FEAT-011 | Article metadata | Title, source, time remaining display |

**Exit Criteria**: Full UI renders, all controls functional, keyboard shortcuts work.

---

### Phase 3: Content Input

| ID | Feature | Description |
|----|---------|-------------|
| FEAT-012 | URL input modal | Input field with fetch + extraction |
| FEAT-013 | Article preview | Full scrollable text before RSVP mode |
| FEAT-014 | Bookmarklet | Extract content from paywalled sites |
| FEAT-015 | Text paste fallback | Manual text input option |
| FEAT-016 | Error handling | Extraction failures, user feedback |

**Exit Criteria**: Can add articles via URL, bookmarklet, or paste. Preview displays before reading.

---

### Phase 4: Feed & Queue Management

| ID | Feature | Description |
|----|---------|-------------|
| FEAT-017 | RSS feed parser | Fetch and parse RSS/Atom feeds |
| FEAT-018 | Feed manager UI | Add/remove feeds, feed list display |
| FEAT-019 | Article queue | Queue panel with estimated read times |
| FEAT-020 | Progress persistence | Save reading position to localStorage |
| FEAT-021 | Resume reading | Restore position on return |
| FEAT-022 | Queue management | Mark read, auto-advance, remove articles |

**Exit Criteria**: Can subscribe to feeds, queue articles, stop mid-article and resume later.

---

## UI Wireframes

### Main Reading View

```
┌─────────────────────────────────────────────────────────────────┐
│  SpeedRead                                        [Settings ⚙]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                         │   │
│  │              "would be imposed"                         │   │
│  │                    ▲                                    │   │
│  │                  (ORP)                                  │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ══════════════════════●══════════════════════════════════════  │
│  Article: "New Tariffs Announced by White House"                │
│  Source: Reuters  │  3:42 remaining  │  320 WPM                 │
│                                                                 │
│  [⏮] [⏪]      [▶ PAUSE]      [⏩] [⏭]        Mode: Phrase ▼   │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Reading Queue (3)                              [+ Add URL]     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ● Tech Giants Report Earnings...        TechCrunch  2m  │   │
│  │ ○ Climate Summit Reaches Agreement...   BBC News    5m  │   │
│  │ ○ Local Elections Show Shifting...      NPR         3m  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Feeds: [Reuters] [BBC] [Ars Technica] [+ Add Feed]            │
└─────────────────────────────────────────────────────────────────┘
```

### Article Preview

```
┌──────────────────────────────────────────────────────────────────┐
│  ARTICLE PREVIEW                                      [✕ Close] │
├──────────────────────────────────────────────────────────────────┤
│  New Tariffs Announced by White House                            │
│  Reuters • 5 min read • Added 2h ago                             │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ The president announced today that new tariffs would be    │ │
│  │ imposed starting next month on imported goods from several │ │
│  │ trading partners. The move comes amid ongoing tensions...  │ │
│  │                                                            │ │
│  │ "This is about protecting American workers," the president │ │
│  │ said in a statement released early Thursday morning...     │ │
│  │                                                            │ │
│  │ [scrollable full article text]                             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ [Start Reading ▶]    Mode: Phrase ▼    Speed: 320 WPM ▼   ││
│  └─────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

---

## Verification

Manual testing during development:

| Area | Test |
|------|------|
| Tokenization | Same article at Word/Phrase/Clause - verify sensible breaks |
| ORP | Visual inspection - focus point feels natural |
| Speed | Test 100-800 WPM range, verify timing feels correct |
| Bookmarklet | Test on NYT, WSJ, Ground.news while logged in |
| URL extraction | Test on non-paywalled articles (Reuters, AP) |
| Persistence | Stop mid-article, refresh, verify resume works |

---

## Dependencies

```json
{
  "dependencies": {
    "react": "^18.x",
    "react-dom": "^18.x",
    "@mozilla/readability": "^0.5.x",
    "rss-parser": "^3.x"
  },
  "devDependencies": {
    "vite": "^5.x",
    "typescript": "^5.x",
    "@types/react": "^18.x",
    "@types/react-dom": "^18.x"
  }
}
```
