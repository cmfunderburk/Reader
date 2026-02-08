# Reader — Project Context

Reading training app with four display modes (RSVP, saccade, prediction, recall). React 18 + TypeScript + Vite, with optional Electron for local PDF/EPUB support.

## Architecture

```
src/
  components/     18 React components (App, Reader, SaccadeReader,
                  PredictionReader, RecallReader, ReaderControls, etc.)
  hooks/          useRSVP (main orchestrator), usePlaybackTimer,
                  useKeyboard
  lib/            tokenizer, saccade, rsvp (timing), levenshtein,
                  textMetrics, extractor, feeds, storage
  types/          index.ts — all shared types
electron/         main.ts, preload.ts, lib/ (pdf, epub, library, cleanup)
```

### Data flow

1. Content enters via URL extraction, pasted text, RSS feeds, or Electron file loading
2. `useRSVP` tokenizes content into `Chunk[]` based on display mode and token mode
3. For RSVP: `usePlaybackTimer` drives auto-advance with timing from `calculateDisplayTime`
4. For saccade: same timer drives a sweep animation across page lines
5. For prediction/recall: self-paced via `advanceSelfPaced` (allows index to reach `chunks.length` for completion)
6. Reading position persists to localStorage per article

### Key types

- `DisplayMode`: `'rsvp' | 'saccade' | 'prediction' | 'recall'`
- `TokenMode`: `'word' | 'phrase' | 'clause' | 'custom'` (chunking granularity)
- `Chunk`: `{ text, wordCount, orpIndex, saccade? }` — the atomic display unit
- `Article`: content + metadata + reading position + optional cached charCount/wordCount

## Important patterns

**State/ref split in useRSVP**: State drives renders; refs (chunksRef, wpmRef, etc.) are synced via useEffect so timer callbacks read current values without recreating the timer. The `advanceToNextRef` indirection breaks a circular dependency between the timer and the advance function.

**`goToIndex` vs `advanceSelfPaced`**: `goToIndex` clamps to `chunks.length - 1`. `advanceSelfPaced` allows `chunks.length` (one past end) to trigger the completion view in prediction/recall modes. This asymmetry is intentional.

**Tokenization is mode-dependent**: Switching display mode retokenizes the full article. RSVP/saccade use the selected token mode; prediction always uses `'word'`; recall uses `tokenizeRecall`. Position is mapped proportionally when switching between modes.

**Preview timer in PredictionReader**: Uses `setInterval` (not the drift-corrected `usePlaybackTimer`). The effect at the bottom of the component manages creation/cleanup; `startPreview` sets state and lets the effect handle interval creation to avoid double-create.

## Build & test

```bash
npm run dev          # Vite dev server (web only)
npm run electron:dev # Electron with hot reload
npm run build        # Production web build
npm run test         # Vitest (jsdom environment)
```

Vite config conditionally loads Electron plugins when `ELECTRON=true` or mode is `electron`.

## Conventions

- Python package manager: `uv` (use `uv pip install`, `uv run`, etc.)
- All state persisted to localStorage (articles, feeds, settings, reading positions)
- Monospace font stack throughout (JetBrains Mono, Fira Code, SF Mono, etc.)
- Dark theme via CSS custom properties (--bg-primary, --accent, etc.)
- No external state management — React state + localStorage only
- Scoring uses normalized Levenshtein distance (0 = perfect, 1 = total miss), case-insensitive and punctuation-stripped
- Tests use Vitest + Testing Library; test files colocated with source

## Direction

The project is evolving toward a deep reading training tool, informed by frameworks like Adler & Van Doren's *How to Read a Book* (included in the library). Current modes cover speed (RSVP, saccade) and active engagement (prediction, recall). Future features may expand along these lines.
