# Code Review: Tech Debt & Simplification Opportunities

**Date:** 2025-02-18
**Scope:** Full codebase (22k LOC source, 6k LOC tests, 3k LOC CSS)
**Goal:** Identify high-impact cleanup without changing behavior

---

## Executive Summary

The codebase is in good shape overall: no unused dependencies, no orphan files, no
significant dead code, strong test coverage for pure logic. The main opportunities
are (1) eliminating duplicated constants and small utilities, (2) removing vestigial
state, (3) consolidating the ref-sync boilerplate in useRSVP, and (4) breaking down
the two largest components. None of these are urgent, but the first three are quick
wins with real payoff.

---

## 1. Duplicated Constants & Utilities

### MIN_WPM / MAX_WPM (3 copies)

Defined identically in three places:

| File | Lines |
|------|-------|
| `src/components/App.tsx` | 115-116 |
| `src/components/TrainingReader.tsx` | 50-51 |
| `src/lib/storage.ts` | 117-118 |

**Fix:** Move to a shared constants module and import everywhere. ~5 min.

### normalizeText (2 copies)

- `src/lib/tokenizer.ts:94` (exported)
- `src/lib/comprehensionExamContext.ts:26` (private, identical implementation)

**Fix:** Import from tokenizer.ts. ~5 min.

### WordKey type + makeWordKey function

- `src/components/RecallReader.tsx:23-25` (local)
- `src/components/TrainingReader.tsx:67` (local type; uses `makeRecallWordKey` from lib)

RecallReader defines its own `makeWordKey(pageIndex, lineIndex, startChar)` while
TrainingReader imports `makeRecallWordKey` from `trainingRecall.ts`. These serve the
same purpose with slightly different signatures.

**Fix:** Unify into a single shared utility. ~30 min.

---

## 2. Vestigial State: customCharWidth

`customCharWidth` is carried through the full pipeline but never actually read:

- Persisted in `Settings` (`storage.ts:55`)
- Passed as `initialCustomCharWidth` to `useRSVP` (`App.tsx:322`)
- Stored as state + ref in `useRSVP` (`useRSVP.ts:102, 122, 185`)
- Exported from hook (`useRSVP.ts:592`) and setter exported (`useRSVP.ts:609`)
- `customCharWidthRef.current` is never read anywhere
- `rsvp.customCharWidth` is never read by any component
- `setCustomCharWidth` is never called

Custom mode now uses `saccadeLength` exclusively. This is a full dead pipeline.

**Fix:** Remove state, ref, setter, effect, export, and the Settings field. Migrate
storage (default fallback is fine since it's never read). ~30 min.

---

## 3. Electron Type Duplication

### LibrarySource / LibraryItem

Defined identically in both:
- `shared/electron-contract.ts:1-14` (canonical)
- `electron/lib/library.ts:6-19` (duplicate, no import from contract)

### CorpusArticle / CorpusFamily / CorpusTier

Defined identically in both:
- `shared/electron-contract.ts:60-70` (canonical, exported)
- `electron/main.ts:40-50` (local redeclaration, never imports)

`main.ts` already imports `ApiKeyId` from the contract but not these types.

**Fix:** Import from the contract in both files. ~15 min.

---

## 4. useRSVP Ref-Sync Boilerplate

`useRSVP.ts` has **15 individual useEffect calls** (lines 181-211) that each sync
one state variable to one ref:

```ts
useEffect(() => { chunksRef.current = chunks; }, [chunks]);
useEffect(() => { indexRef.current = currentChunkIndex; }, [currentChunkIndex]);
useEffect(() => { wpmRef.current = wpm; }, [wpm]);
// ... 12 more
```

This is the standard pattern for keeping refs in sync for timer callbacks, but 15
separate effects add noise and make the hook harder to scan.

### Consolidation options

**Option A — Single batch effect:**
```ts
useEffect(() => {
  chunksRef.current = chunks;
  indexRef.current = currentChunkIndex;
  wpmRef.current = wpm;
  // ...
}, [chunks, currentChunkIndex, wpm, /* ... */]);
```
Downside: runs the full sync on any single change (negligible cost for ref writes).

**Option B — Group by concern:**
- Playback refs (chunks, index, wpm, displayMode, mode, showPacer, linesPerPage, saccadeLength)
- Ramp refs (rampEnabled, rampCurve, rampStartPercent, rampRate, rampInterval) — these 5 could become a single `rampConfigRef = useRef({...})` with one sync effect.

**Option C — useLatestRef helper:**
```ts
function useLatestRef<T>(value: T): React.MutableRefObject<T> {
  const ref = useRef(value);
  ref.current = value; // sync on every render, no effect needed
  return ref;
}
```
This is the simplest approach and eliminates all 15 effects. Assigning during render
is safe for refs (they're not side effects in the React sense — no DOM, no subscriptions).

**Recommendation:** Option C. It's the standard community pattern for this exact
situation and removes 15 lines of boilerplate entirely.

---

## 5. Large File Candidates for Decomposition

### TrainingReader.tsx (1636 lines)

This file manages five distinct phases as a single component:
- Setup (paragraph/drill config)
- Reading (line sweep timer)
- Recall (word-by-word input, scaffolding, preview)
- Feedback (scoring display)
- Complete (session summary)

The phase-switching logic at the top (~300 lines of state/effects/callbacks) is the
orchestrator; the rendering for each phase is another ~300 lines each. This is the
single largest source of complexity in the codebase.

**Decomposition approach:** Extract each phase's rendering into a sub-component
(`TrainingSetup`, `TrainingReading`, `TrainingRecall`, `TrainingFeedback`,
`TrainingComplete`). The parent keeps the state machine; children get focused props.
This doesn't change behavior but makes each piece reviewable in isolation.

**Effort:** Medium-high. The phases share some state (wpm, drill config, stats), so
the prop interfaces need careful design. Worth planning before executing.

### App.tsx (1546 lines)

Large but more justified as the top-level orchestrator. Main decomposition
opportunities:

- **Feed/article management** (~200 lines of handlers) could become a `useFeedManager` hook
- **Passage capture** (~100 lines) could become a `usePassageCapture` hook
- **Wikipedia/daily article** (~80 lines) could become a `useDailyArticle` hook

These are less urgent because App.tsx is primarily wiring, not business logic.

---

## 6. Smaller Findings

### Redundant predictionWordIndexRef

`useRSVP.ts:138` maintains a ref that caches what's already in
`article.predictionPosition`. The ref is set from the article field (line 491) and
read as a fallback alongside it (lines 420, 507). It acts as a session-scoped cache
but creates two sources of truth.

**Fix:** Use `article.predictionPosition` directly. Requires checking that the article
object is always up-to-date when accessed. ~30 min investigation.

### useKeyboard handler dependency

`useKeyboard.ts:46` depends on the full `handlers` object, which is recreated every
render. This causes the event listener to be removed and re-added every render cycle.

**Fix:** Either destructure individual handler functions in the dependency array, or
memoize the handlers object in the caller. ~15 min.

### PredictionReader / RecallReader duplication

Both components have nearly identical:
- Input focus/blur effects
- Global keyboard listeners (Space/Enter)
- `handleContinue` patterns
- Word completion tracking

A `useRecallInput` hook could consolidate ~100 lines of duplication. Medium effort
since the two components have slightly different data shapes.

### Magic numbers

A handful of hardcoded values would benefit from named constants:

| Value | Location | Meaning |
|-------|----------|---------|
| `72`, `520` | `SaccadeReader.tsx:110` | Min/max figure height px |
| `500` | `TrainingReader.tsx:332` | Reading lead-in delay ms |
| `80` | `TrainingReader.tsx:402` | Min step duration ms |
| `0.8`, `0.5` | `LossMeter.tsx:15-21` | Score color thresholds |
| `4.8` | `rsvp.ts` | Chars-per-beat for timing |

Not urgent, but would improve readability of the numeric-heavy modules.

---

## 7. Test Suite Observations

**Strengths:**
- 38 test files, 6k LOC of tests
- Pure lib functions have strong coverage (rsvp, saccade, tokenizer, training planners, storage)
- Storage migration tests are particularly thorough

**Gaps:**
- `useKeyboard` has no test file
- `usePlaybackTimer` test is minimal (2 describe blocks)
- Component tests over-mock: `App.integration.test.tsx` mocks `useRSVP`, `useKeyboard`,
  and `fetchDailyArticle` at module level, then asserts on mock calls rather than
  rendered output. This makes tests fragile to internal refactoring.
- Test helpers are inconsistent: `createTestArticle()` in storage-helpers.ts vs local
  `makeArticle()` in individual test files. Could consolidate factory functions.

**Not urgent** — the test suite covers the important logic well. These are polish items.

---

## 8. What's NOT Worth Changing

A few things that came up in review but don't warrant action:

- **`const settings = displaySettings` alias in App.tsx** — looks like dead code at
  first glance but `settings.` is used 25+ times. The alias saves keystrokes and is
  clear enough.
- **15 useRSVP exported fields** — the hook exports many values, but they're all
  consumed by components. No phantom exports.
- **Single CSS file (3183 lines)** — monolithic but functional. CSS modules or
  CSS-in-JS would add complexity without clear benefit for this project size.
- **No path aliases** — relative imports work fine at this project's depth (max 3
  levels). Aliases add config complexity for marginal benefit.

---

## Summary: Recommended Priority Order

### Quick wins (< 1 hour total)

1. **Remove `customCharWidth` pipeline** — dead state through entire stack
2. **Extract `MIN_WPM`/`MAX_WPM` to shared constants** — 3 duplicate definitions
3. **Import shared types in electron** — 2 files with duplicate type declarations
4. **Import `normalizeText` from tokenizer** — duplicate function definition
5. **Add `useLatestRef` helper** and replace 15 ref-sync effects in useRSVP

### Medium effort (1-3 hours each)

6. **Unify `WordKey`/`makeWordKey`** across RecallReader and TrainingReader
7. **Fix `useKeyboard` handler dependency** to prevent per-render listener churn
8. **Extract `useRecallInput` hook** from PredictionReader/RecallReader duplication
9. **Name magic numbers** in SaccadeReader, TrainingReader, LossMeter

### Larger refactors (plan first)

10. **Decompose TrainingReader.tsx** into phase sub-components
11. **Extract App.tsx hooks** (feed manager, passage capture, daily article)
