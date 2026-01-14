# Ralph Loop Startup: SpeedRead

Copy and paste the command below to start the ralph-loop.

---

## Pre-flight Checklist

Before starting:
- [ ] Working directory is `/home/cmf/Dropbox/Apps/speed`
- [ ] Node.js installed (v18+)
- [ ] PRD reviewed: `PRD.md`

---

## Startup Prompt

```
/ralph-loop:ralph-loop "Execute SpeedRead PRD (PRD.md) systematically.

Build a modern RSVP news reader web app with:
- Punctuation-aware tokenization (Word/Phrase/Clause modes)
- Full chrome UI with transport controls, progress bar, keyboard shortcuts
- URL extraction + bookmarklet for paywalled sources
- RSS feed management and reading queue
- Persistent progress across sessions

PHASES:
1. Core Infrastructure - Vite scaffold, tokenizer engine, RSVP timing, basic Reader
2. Reader UI - Full layout, controls, progress bar, speed/mode selectors, keyboard shortcuts
3. Content Input - URL extraction, article preview, bookmarklet, paste fallback
4. Feed & Queue - RSS parsing, feed manager, queue, progress persistence

CONSTRAINTS:
- TypeScript + React + Vite stack
- Client-side only (localStorage for persistence)
- Punctuation-aware chunking: chunks END at punctuation, NEVER cross major punctuation
- Timing formula: display_time = base_time + (word_count * 0.6 * per_word_time)
- ORP at ~35% of chunk width

Continue automatically between phases. Track progress via git commits." --max-iterations 60 --completion-promise "SPEEDREAD-COMPLETE"
```

---

## Resume Prompt (for interrupted loops)

```
/ralph-loop:ralph-loop "Resume SpeedRead execution.

Check current state:
1. Review recent git commits
2. Check which features are implemented
3. Read PRD.md for feature list

Continue from where execution stopped." --max-iterations 40 --completion-promise "SPEEDREAD-COMPLETE"
```

---

## Phase-Specific Prompts

### Phase 1 Only
```
/ralph-loop:ralph-loop "Execute SpeedRead PRD Phase 1: Core Infrastructure.

Features:
- FEAT-001: Vite + React + TypeScript scaffold
- FEAT-002: Tokenizer engine (Word/Phrase/Clause)
- FEAT-003: RSVP timing engine with ORP
- FEAT-004: Basic Reader component

Stop after Phase 1 completes." --max-iterations 20 --completion-promise "SPEEDREAD-PHASE-1-COMPLETE"
```

### Phase 2 Only
```
/ralph-loop:ralph-loop "Execute SpeedRead PRD Phase 2: Reader UI.

Features:
- FEAT-005: Full chrome layout
- FEAT-006: Transport controls
- FEAT-007: Progress bar with scrubbing
- FEAT-008: Speed selector
- FEAT-009: Mode selector
- FEAT-010: Keyboard shortcuts
- FEAT-011: Article metadata display

Stop after Phase 2 completes." --max-iterations 20 --completion-promise "SPEEDREAD-PHASE-2-COMPLETE"
```

### Phase 3 Only
```
/ralph-loop:ralph-loop "Execute SpeedRead PRD Phase 3: Content Input.

Features:
- FEAT-012: URL input modal
- FEAT-013: Article preview screen
- FEAT-014: Bookmarklet for paywalled sources
- FEAT-015: Text paste fallback
- FEAT-016: Error handling

Stop after Phase 3 completes." --max-iterations 20 --completion-promise "SPEEDREAD-PHASE-3-COMPLETE"
```

### Phase 4 Only
```
/ralph-loop:ralph-loop "Execute SpeedRead PRD Phase 4: Feed & Queue Management.

Features:
- FEAT-017: RSS feed parser
- FEAT-018: Feed manager UI
- FEAT-019: Article queue
- FEAT-020: Progress persistence
- FEAT-021: Resume reading
- FEAT-022: Queue management

Stop after Phase 4 completes." --max-iterations 20 --completion-promise "SPEEDREAD-PHASE-4-COMPLETE"
```

---

## Key Files

| File | Purpose |
|------|---------|
| `PRD.md` | Full PRD specification |
| `src/lib/tokenizer.ts` | Core chunking engine |
| `src/lib/rsvp.ts` | Timing and ORP calculation |
| `src/components/Reader.tsx` | Main RSVP display |
| `public/bookmarklet.js` | Paywalled content extraction |

---

## Development Commands

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```
