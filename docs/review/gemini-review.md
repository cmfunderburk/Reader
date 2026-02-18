# Codebase Review & Simplification Report

**Date:** February 18, 2026
**Reviewer:** Gemini CLI Agent

## Executive Summary

The project is in a functional state with a robust feature set. The codebase is highly modular, which has allowed for rapid feature addition. However, this has also led to some fragmentation, logic duplication, and a few "mega-components" that are difficult to maintain. This report identifies high-impact areas for technical debt reduction and simplification without changing application behavior.

---

## High-Impact Simplification Areas

### 1. Modularize `src/lib/storage.ts`
**Issue:** At over 800 lines, `storage.ts` has become a "catch-all" for persistence. It contains complex migration logic, repetitive sanitization for comprehension attempts, and mix-and-match exports for different features.
**Recommendation:**
- Split into a directory `src/lib/storage/` with separate files:
    - `settings.ts`: Setting defaults and persistence.
    - `articles.ts`: Article and feed management.
    - `comprehension.ts`: Large-scale sanitization and persistence for comprehension attempts.
    - `training.ts`: Drill state and history.
    - `migrations.ts`: Centralized migration logic.
- Simplify sanitization using a more declarative approach if possible.

### 2. Decompose `src/components/TrainingReader.tsx`
**Issue:** This is the largest component in the codebase (>1200 lines). it manages 5 different phases, 2 different modes, and contains significant sub-component logic inlined.
**Recommendation:**
- Move phase-specific UI into separate components:
    - `TrainingSetup.tsx`
    - `TrainingFeedback.tsx`
    - `TrainingComplete.tsx`
- Extract recall-specific logic into a custom hook `useTrainingRecall.ts`.
- Extract random-drill logic into `useRandomDrill.ts`.
- Use a `useReducer` for the complex phase/state transitions instead of 20+ `useState` calls.

### 3. Unify Tokenization and Timing Logic
**Issue:** `src/lib/rsvp.ts` and `src/lib/saccade.ts` share similar concerns but implement them differently. There are multiple tokenization functions for different modes (saccade vs recall vs training).
**Recommendation:**
- Create a unified `src/lib/pacing.ts` for WPM calculation and ramp-up logic.
- Consolidate tokenization into a single robust engine that can produce different "views" (e.g., word-at-a-time for recall, line-at-a-time for saccade) from the same underlying structure.

### 4. Simplify `src/components/SaccadeReader.tsx`
**Issue:** The figure height calculation is brittle and relies on direct DOM measurements and `ResizeObserver`. The dynamic `@keyframes` generation, while performant, adds significant complexity to the render loop.
**Recommendation:**
- Investigate CSS-only solutions for figure scaling if possible (e.g., Flexbox/Grid with better constraints).
- Move `@keyframes` generation to a dedicated utility or use a more standard CSS-in-JS approach if appropriate, though performance must be maintained.

---

## Technical Debt & Consistency

### 5. AI Prompt & Parsing Consolidation
**Issue:** Robust but fragmented across `comprehensionAdapter.ts`, `comprehensionPrompts.ts`, `comprehensionExamPrompts.ts`, and `comprehensionSchemas.ts`.
**Recommendation:**
- Keep schemas and prompt builders closely associated.
- The "Flexible" parsing logic in `comprehensionExamPrompts.ts` is great; consider if it can be unified with the more rigid sanitization in `storage.ts`.

### 6. Testing Consistency
**Issue:** Some logic is heavily tested (`rsvp.test.ts`), while some components rely more on integration tests.
**Recommendation:**
- Ensure new decomposed components (from `TrainingReader`) have focused unit tests.
- Standardize on testing patterns for components that use `ipcMain`/`ipcRenderer`.

---

## Proposed Next Steps

1.  **Phase 1: Storage Refactor.** Split `storage.ts` to improve maintainability and clear the path for other refactors.
2.  **Phase 2: TrainingReader Decomposition.** This is the most complex component and represents the biggest maintenance risk.
3.  **Phase 3: Logic Unification.** Refactor `rsvp.ts` and `saccade.ts` to share core pacing and tokenization logic.
