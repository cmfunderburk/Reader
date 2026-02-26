# Codebase Cleanup & Maintainability Improvements

**Date:** 2026-02-24
**Status:** Approved — ready for implementation

## Context

The Reader codebase is ~27K lines across React 18 + TypeScript + Vite with optional Electron. Overall health is good: zero `any` usages, no circular dependencies, clean lint, 31% test-to-code ratio. Recent A/B/C cleanup phases addressed settings and RSVP persistence.

This plan targets forward-looking maintainability improvements — reducing cognitive load in the largest files, improving modularity, closing test gaps, and cleaning up small inconsistencies.

## Audit Summary

| Metric | Value |
|---|---|
| Total source lines | ~27K |
| Test lines | ~7.8K (31% ratio) |
| Lint errors | 0 |
| `any` type usages | 0 |
| Circular dependencies | 0 |
| Files >500 LOC | 9 |
| Files >1000 LOC | 3 |

Top complexity hotspots by size and hook density:

| File | LOC | useState calls | Concern |
|---|---|---|---|
| `TrainingReader.tsx` | 1,635 | 40 | Monolithic state machine |
| `App.tsx` | 1,599 | 21 | Monolithic orchestrator |
| `storage.ts` | 1,216 | — | 65-export persistence hub |
| `ComprehensionCheck.tsx` | 962 | ~12 | AI Q&A rendering |
| `saccade.ts` | 919 | — | Display layout engine |
| `generationMask.ts` | 467 | — | 23 internal helpers, 3 concerns tangled |

---

## 1. TrainingReader Hook Extractions

**Problem:** 40 `useState` calls and ~15 effects in a single 1,635-line component function. State for drill preview, recall input, and drill configuration are intermixed.

**Key coupling constraint:** `finishRecallPhase` (line ~434) touches recall state, preview state, AND drill state (rounds, rolling scores, WPM adjustments). `handleTabPreviewRemaining` (line ~670) sets both recall state (`recallInput`, `showingMiss`) and preview state (`drillPreviewWordKeys`). Preview and recall are not independent — preview is a recall-phase feature.

### 1a. Extract `useTrainingRecall` hook (recall + preview combined)

**What moves:**
- Recall state: `recallInput`, `recallWordIndex`, `showingMiss`, `lastMissResult`, `lastPreviewPenaltyCount`, `drillForfeitedWordKeys`, `completedWords`, `paragraphStats`
- Preview state: `drillPreviewWordKeys`, `drillPreviewVisibleCount`
- Refs: `inputRef`, `inputContainerRef`, `lastDetailCountRef`, `drillPreviewTimerRef`, `drillPreviewHideTimerRef`
- The Tab-preview reveal/hide effect (current lines ~386-431)
- Callbacks: `handleRecallKeyDown`, `handleTabPreviewRemaining`, `handleMissContinue`, `handleGiveUp`, `scoreRemainingAsMisses`, word submission logic
- Focus/scroll effects for recall phase
- Returns: recall + preview state, handlers, refs for the input element, and a `resetForNextRound()` function

**What stays in TrainingReader:** `finishRecallPhase` remains in the component as the bridge between recall and drill state. It receives recall stats from the hook, then dispatches to both the hook's reset and drill state updates. This avoids the hook needing to know about drill scoring.

**Why preview merges into recall:** `handleTabPreviewRemaining` mutates recall state (`recallInput`, `showingMiss`, `drillForfeitedWordKeys`) alongside preview state. `scoreRemainingAsMisses` clears preview state before calling `finishRecallPhase`. Separating these would require a cross-hook coordination protocol that's more complex than co-locating them.

### 1b. Extract `useTrainingDrillState` hook

**What moves:**
- State: `drillMode`, `drillCorpusFamily`, `drillTier`, `corpusInfo`, `drillArticle`, `drillSentenceIndex`, `autoAdjustDifficulty`, `drillMinWpm`, `drillMaxWpm`, `rollingScores`, `drillRoundsCompleted`, `drillScoreSum`, `drillWpmStart`, `sessionTimeLimit`, `sessionStartTime`
- Refs: `drillFetchRequestRef`, `lastDrillAdjRef`
- Effects: drill state persistence, tier validation, WPM clamping
- Returns: drill config state, setters, computed values like `isDrill`

**Why this IS independent:** Drill config state (corpus family, tier, WPM bounds, auto-adjust, session limits) is set during setup phase and read during feedback. It doesn't mutate during recall. The `finishRecallPhase` bridge in TrainingReader dispatches drill updates (`setDrillRoundsCompleted`, `setRollingScores`, `setWpm`) through the hook's setters — one-directional data flow.

### Expected outcome

TrainingReader drops from ~40 `useState` to ~10 (phase, current indices, feedback text, paused, WPM, sentence/scaffold toggles). The component body becomes a coordinator that wires two hooks together via `finishRecallPhase` and renders the phase-appropriate UI.

---

## 2. App.tsx Hook Extraction

**Problem:** 21 `useState` calls plus ~18 effects mixing initialization, theme management, comprehension/SRS state, and view navigation.

**Key coupling constraint (from review):** The original plan had `useAppInitialization` and `useComprehensionState` both claiming `comprehensionApiKey`, `comprehensionApiKeyStorageMode`, and `srsCards`. This creates split-brain state ownership.

### 2a. Extract `useComprehensionState` hook (owns all comprehension/SRS state + init)

**What moves:**
- State: `comprehensionApiKey`, `comprehensionApiKeyStorageMode`, `comprehensionAttempts`, `srsCards`, `srsSessionCards`
- The `comprehensionAdapter` memo
- Comprehension API key initialization effect (lines ~312-332)
- SRS backfill effect (lines ~335-345)
- Returns: comprehension state bundle, adapter, and update functions

**What stays in App.tsx:**
- Library group backfill effect — touches `articles` state, which App owns
- Theme/system-theme setup — small, touches `resolvedTheme` used by App's top-level rendering
- These are small enough (~60 lines combined) to stay without warranting a separate hook

**Why single hook, not two:** One hook owns all comprehension/SRS state including its initialization effects. No state ownership ambiguity. The init effects run inside the hook that owns the state they populate.

### Expected outcome

App.tsx drops from ~21 `useState` to ~16, and the comprehension/SRS subsystem becomes a single opaque unit. The remaining App state covers articles, feeds, passages, view state, and display settings — all of which are tightly coupled to App's routing and rendering logic.

---

## 3. storage.ts Decomposition

**Problem:** 1,216 lines, ~65 exports spanning 8+ domain areas. Growing migration burden.

**Key constraint (from review):** `runStorageMigrations()` is called at the top of nearly every public load/save function, guarded by a `lastKnownStorageSchemaVersion` module-level cache. This is NOT "called once at load time" — it's a lazy-init pattern baked into every entry point. The split must preserve this behavior.

### 3a. `storageKeys.ts` (~50 lines)

- `STORAGE_KEYS` constant — canonical key namespace, imported by all storage modules
- `CURRENT_STORAGE_SCHEMA_VERSION` constant

**Why separate:** Multiple split modules need to read/write specific localStorage keys. Centralizing prevents key collisions and makes the full key inventory visible in one place.

### 3b. `storageMigrations.ts` (~150 lines)

- `runStorageMigrations()` with `lastKnownStorageSchemaVersion` cache
- `loadStorageSchemaVersion()` / `saveStorageSchemaVersion()`
- `migrateSettingsToV1()` / `migrateDrillStateToV1()` / `migrateComprehensionAttemptsToV3()`
- Imports `STORAGE_KEYS` from `storageKeys.ts`
- Exports `runStorageMigrations` for use by all other storage modules

**Critical:** Every split module that has a `load*` or `save*` function continues to call `runStorageMigrations()` at the top, exactly as today. The lazy-init guard makes repeated calls cheap.

### 3c. `storageSettings.ts` (~150 lines)

- `Settings` interface and `DEFAULT_SETTINGS`
- `loadSettings()` / `saveSettings()` (both call `runStorageMigrations()`)
- Parser helpers: `clampWpm`, `parseComprehensionGeminiModel`, `parseGenerationDifficulty`, `parseGenerationSweepReveal`

### 3d. `storageTraining.ts` (~120 lines)

- `TrainingHistory` / `DrillState` types
- `loadTrainingHistory()` / `saveTrainingHistory()`
- `loadDrillState()` / `saveDrillState()`
- `loadTrainingSentenceMode()` / `saveTrainingSentenceMode()`
- `loadTrainingScoreDetails()` / `saveTrainingScoreDetails()`
- `loadTrainingScaffold()` / `saveTrainingScaffold()`

### 3e. `storageComprehension.ts` (~100 lines)

- `loadComprehensionAttempts()` / `saveComprehensionAttempts()`
- API key storage/retrieval functions
- `ComprehensionApiKeyStorageMode` type

### 3f. `storage.ts` remainder (~500 lines)

- `generateId()`
- Article CRUD: `loadArticles()`, `saveArticles()`
- Feed CRUD: `loadFeeds()`, `saveFeeds()`
- Passage CRUD: `loadPassages()`, `upsertPassage()`, `updatePassageReviewState()`, `touchPassageReview()`
- Session snapshots: `loadSessionSnapshot()`, `saveSessionSnapshot()`, `clearSessionSnapshot()`
- Daily info: `loadDailyInfo()`, `saveDailyInfo()`

### Re-export strategy

`storage.ts` re-exports from the new modules so existing import sites don't break. Callers can migrate to direct imports over time.

---

## 4. generationMask.ts Decomposition

**Problem:** 467 lines mixing language detection, text tokenization, and masking strategy in 23 tightly packed helpers.

**Key constraint (from review):** The public export is `maskGenerationLine`, not `maskText`. No API renames during the split.

### 4a. `generationLanguage.ts` (~60 lines)

- Constants: `GERMAN_CHAR_REGEX`, `GERMAN_CONTEXT_CUES`, `GERMAN_DETERMINERS`, `NAME_PREFIXES`, `NAME_TITLES`
- Functions: `detectLikelyGermanLine()`, `isLikelyNameToken()`

### 4b. `generationTokens.ts` (~100 lines)

- Types: `TokenInfo`, `CoreParts`
- Constants: `HYPHEN_SEPARATOR_REGEX`, `HYPHEN_SPLIT_REGEX`, `LETTER_REGEX`, `LETTER_OR_DIGIT_REGEX`
- Functions: `splitCoreParts()`, `tokenizeLineForMasking()`, `isTitleCaseLine()`, `hashToUnitInterval()`

### 4c. `generationMask.ts` remainder (~250 lines)

- Types: `MaskProfile`, `MaskContext`
- Constants: `DIFFICULTY_PROFILES`
- Functions: `shouldMaskToken()`, `maskLine()`, `maskGenerationLine()` (public entry point)
- Imports from the other two modules

---

## 5. Test Coverage Improvements

**Key constraint (from review):** Characterization tests must be written BEFORE or ALONGSIDE extractions, not after. Large refactors need a safety net in place before the structural changes.

### 5a. Characterization tests before generationMask split

Write before Section 4 extraction:
- `generationLanguage.test.ts` — German detection edge cases: mixed-language, all-caps, short/ambiguous lines
- `generationTokens.test.ts` — title-case detection, hyphen splitting, core-parts extraction
- Expand `generationMask.test.ts` for masking strategy coverage

These tests initially import from the monolithic `generationMask.ts` (functions will need temporary exports or the tests target the public API). After the split, update imports to point at the new modules.

### 5b. Characterization tests before TrainingReader hook extraction

Write before Section 1 extraction:
- Integration tests covering TrainingReader phase transitions: setup→reading→recall→feedback→complete for both article and drill mode
- Expand `trainingFeedback.test.ts` for `planFinishRecallPhase` with auto-adjust difficulty boundary cases

### 5c. New hook test files (written alongside extraction)

Each extracted hook gets its own test file during extraction:
- `useTrainingRecall.test.ts` — word submission, miss handling, scoring, Tab-preview reveal/hide sequences
- `useTrainingDrillState.test.ts` — persistence sync, tier validation, WPM clamping

---

## 6. Small Utility Relocations

### 6a. Deduplicate/clarify `clampWpm`

- `storage.ts` has `clampWpm(value: unknown, fallback: number)` — deserialization clamping
- `App.tsx` has `clampWpm(value: number)` — runtime clamping
- Move both to `wpm.ts` with distinct names: `clampWpmFromStorage(value: unknown, fallback: number)` and `clampWpm(value: number)`

### 6b. Move pure utilities out of App.tsx

- `clipPassagePreview()` → `lib/passageCapture.ts`
- `resolveThemePreference()` → `lib/theme.ts` (new, tiny)
- `captureKindLabel()` → `lib/passageCapture.ts`

### 6c. Shared LLM JSON parser

- `comprehensionExamPrompts.ts` and `comprehensionPrompts.ts` both extract JSON from LLM responses
- Extract shared `parseJsonFromLLMResponse()` into `comprehensionJson.ts` (not `comprehensionSchemas.ts`, which is schema-only)

---

## Execution Order

Suggested implementation sequence (each step is independently mergeable):

1. **Characterization tests for generationMask** (Section 5a, first half) — Safety net before splitting.

2. **generationMask.ts decomposition** (Section 4) — Pure file splits. Update test imports.

3. **storage.ts decomposition** (Section 3) — Pure file splits with re-exports. Migration call pattern preserved exactly.

4. **Small utility relocations** (Section 6) — Quick wins, independent.

5. **Characterization tests for TrainingReader** (Section 5b) — Safety net before hook extraction.

6. **TrainingReader hook extractions** (Section 1) — Largest behavior-preserving refactor. Write hook tests (Section 5c) alongside.

7. **App.tsx hook extraction** (Section 2) — Single `useComprehensionState` hook.

## Verification

After each step:
- `bun run verify` (lint + type-check + test) must pass
- No new exports from the original files — only re-exports
- Existing import sites continue working (re-exports maintain backward compatibility)
- Git diff should show net-zero line changes for moved code (no logic changes)

---

## Review Log

**2026-02-24 — Initial design reviewed.** Five findings incorporated:

1. **(High) App hook state ownership conflict:** Dropped `useAppInitialization` as separate hook. Single `useComprehensionState` hook owns all comprehension/SRS state and its init effects. Theme and library backfill stay in App.tsx.

2. **(High) TrainingReader coupling underestimated:** Merged drill preview into `useTrainingRecall` since preview is a recall-phase feature with shared state mutations. `finishRecallPhase` stays in TrainingReader as the bridge between recall hook and drill state hook. Two hooks instead of three.

3. **(Medium) Migration lazy-init pattern:** `runStorageMigrations()` is called from every public load/save, not once at load time. Split modules continue calling it identically. Added `storageKeys.ts` for shared key namespace.

4. **(Medium) API naming:** Fixed `maskText()` → `maskGenerationLine()` to match actual public export.

5. **(Medium) Test sequencing:** Reversed order — characterization tests written BEFORE structural changes, not after. Hook tests written alongside extraction.

6. **(Low) JSON parser location:** `comprehensionJson.ts` instead of `comprehensionSchemas.ts`.
