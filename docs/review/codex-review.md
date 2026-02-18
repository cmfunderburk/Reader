# Tech-Debt and Simplification Review

Date: 2026-02-18  
Scope: behavior-preserving simplification opportunities across renderer, core logic, persistence, and Electron main process.

## Baseline

- Repository quality gate is currently green: `bun run verify` passed (`eslint`, `vitest` with 320 tests, typecheck, and production build).
- Working tree was clean at review start.
- Current complexity concentration is highly skewed:
  - `src/components/TrainingReader.tsx` (1636 lines)
  - `src/components/App.tsx` (1546 lines)
  - `src/lib/storage.ts` (1199 lines)
  - `src/components/ComprehensionCheck.tsx` (962 lines)
  - `src/lib/saccade.ts` (919 lines)

## Executive Summary

No urgent correctness failures surfaced in this pass, but there are several high-impact simplifications that would reduce change risk and maintenance cost without changing behavior. The biggest leverage is to split orchestration-heavy files and remove repeated state/persistence mutation patterns.

## Findings (Prioritized)

### 1) `App.tsx` is a high-coupling orchestrator with repeated mutation patterns

Evidence:
- Single component holds initialization/migration/backfill, keyboard handling, passage capture, featured fetch flows, and all screen composition: `src/components/App.tsx:147`, `src/components/App.tsx:186`, `src/components/App.tsx:414`, `src/components/App.tsx:962`, `src/components/App.tsx:1176`, `src/components/App.tsx:1345`.
- Repeated settings mutation pattern (clone + save + return) appears many times: `src/components/App.tsx:612`, `src/components/App.tsx:621`, `src/components/App.tsx:629`, `src/components/App.tsx:637`, `src/components/App.tsx:645`, `src/components/App.tsx:653`, `src/components/App.tsx:661`, `src/components/App.tsx:669`, `src/components/App.tsx:677`, `src/components/App.tsx:685`.

Impact:
- High review and regression surface for even small changes.
- Hard to reason about lifecycle interactions (keyboard, playback, navigation, persistence) in one file.

Behavior-preserving simplification:
- Extract `useDisplaySettings` with one `updateSettings(patchOrUpdater)` helper.
- Extract feature hooks:
  - `useFeaturedArticleLauncher`
  - `usePassageWorkspace`
  - `useGenerationRevealHotkey`
- Keep `App` as composition shell + route/screen switch only.

Suggested sequence:
1. Extract helper for settings updates only (no behavior changes).
2. Move passage workspace state/handlers into hook.
3. Move featured/daily article launch flow into hook.
4. Split screen rendering into view components.

### 2) `TrainingReader.tsx` has state explosion and phase logic fragmentation

Evidence:
- 37 `useState` calls and 13 `useEffect` calls in one component (counted statically).
- Large phase-dependent render branches in one file: `src/components/TrainingReader.tsx:933`, `src/components/TrainingReader.tsx:1206`, `src/components/TrainingReader.tsx:1281`, `src/components/TrainingReader.tsx:1365`, `src/components/TrainingReader.tsx:1413`.
- Repeated reset/cleanup logic in multiple paths: `src/components/TrainingReader.tsx:452`, `src/components/TrainingReader.tsx:755`, `src/components/TrainingReader.tsx:803`.

Impact:
- Very high cognitive load; easy to introduce subtle phase-transition bugs.
- Hard to test transitions independently from UI.

Behavior-preserving simplification:
- Introduce `trainingSessionReducer` (typed events + explicit state machine for `setup/reading/recall/feedback/complete`).
- Move reusable reset transitions into reducer actions.
- Extract phase views (`TrainingSetupView`, `TrainingFeedbackView`, `TrainingRecallView`) as pure components.

### 3) Persistence hot path does repeated whole-array round trips and repeated migration checks

Evidence:
- `runStorageMigrations()` called throughout storage API (`src/lib/storage.ts:252` and 21 call sites).
- Position updates load/scan/save the full article list each call: `src/lib/storage.ts:494`, `src/lib/storage.ts:506`, `src/lib/storage.ts:518`.
- `useRSVP` writes positions periodically and on pause/complete: `src/hooks/useRSVP.ts:267`, `src/hooks/useRSVP.ts:292`, `src/hooks/useRSVP.ts:301`.

Impact:
- Increased write amplification and unnecessary localStorage churn during active reading.
- More opportunities for lost updates when multiple write paths touch the same arrays.

Behavior-preserving simplification:
- Add one-time migration guard (`migrationsApplied` memo in module scope) so schema version checks aren’t re-run on every read/write.
- Introduce `mutateArticles((articles) => ...)` helper to centralize read-modify-write and reduce duplication.
- Add lightweight position-write throttling/coalescing (e.g., store in-memory last value and flush on pause/interval).

### 4) `useRSVP` retokenization and mode transition logic is duplicated across multiple handlers

Evidence:
- Retokenize + page/chunk/index remap sequence repeated in:
  - `src/hooks/useRSVP.ts:193`
  - `src/hooks/useRSVP.ts:358`
  - `src/hooks/useRSVP.ts:382`
  - `src/hooks/useRSVP.ts:452`
  - `src/hooks/useRSVP.ts:477`
- Hook uses many mirrored refs with sync effects: `src/hooks/useRSVP.ts:118` through `src/hooks/useRSVP.ts:211`.

Impact:
- Higher chance of drift between transitions (mode/display/page-size/article load).
- Harder to confidently change tokenization behavior.

Behavior-preserving simplification:
- Introduce a single internal `retokenizeAndSetState(...)` path to apply pages/chunks/index mapping consistently.
- Optionally move to reducer-driven state transitions while keeping public hook API identical.

### 5) `ComprehensionCheck.tsx` mixes async workflow engine with rendering

Evidence:
- Question loading orchestration: `src/components/ComprehensionCheck.tsx:276`.
- Submission/scoring orchestration and concurrency control: `src/components/ComprehensionCheck.tsx:359`.
- Results rendering and filtering also in same component: `src/components/ComprehensionCheck.tsx:584`.

Impact:
- Harder to isolate scoring pipeline changes from UI changes.
- Large dependency arrays and request-staleness guards are correct but difficult to maintain in one component.

Behavior-preserving simplification:
- Extract `useComprehensionRun` hook for generation/submission/status lifecycle.
- Keep `ComprehensionCheck` as mostly presentational with event handlers.
- Preserve existing component tests; add hook-level unit tests for staleness/concurrency logic.

### 6) Electron main process file bundles unrelated concerns and has limited direct test coverage

Evidence:
- Path/security checks, secure-key storage, corpus loading, protocol handling, and IPC registration all live in `electron/main.ts`: `electron/main.ts:82`, `electron/main.ts:113`, `electron/main.ts:201`, `electron/main.ts:291`, `electron/main.ts:329`, `electron/main.ts:470`, `electron/main.ts:485`.

Impact:
- High blast radius for main-process edits.
- Security-sensitive logic and domain logic are tightly interleaved.

Behavior-preserving simplification:
- Split into dedicated modules:
  - `electron/ipc/libraryHandlers.ts`
  - `electron/ipc/secureKeyHandlers.ts`
  - `electron/ipc/corpusHandlers.ts`
  - `electron/protocol/readerAssetProtocol.ts`
- Keep a thin `main.ts` bootstrap that wires modules.

### 7) Duplicate recall tokenization logic in `saccade.ts`

Evidence:
- Near-identical word-tokenization loops in `tokenizeRecall` and `tokenizeParagraphRecall`: `src/lib/saccade.ts:684` and `src/lib/saccade.ts:893`.

Impact:
- Drift risk when adjusting token boundaries/rules.

Behavior-preserving simplification:
- Factor shared helper (e.g., `tokenizeRecallLines(lines, pageIndexBase)`), then call from both paths.

### 8) Integration tests are valuable but heavily mocked in key places

Evidence:
- `App` integration tests mock `useRSVP` and multiple child components: `src/components/App.integration.test.tsx:14`, `src/components/App.integration.test.tsx:87`, `src/components/App.integration.test.tsx:91`.
- `TrainingReader` integration tests mock core reading transition logic: `src/components/TrainingReader.integration.test.tsx:6`.

Impact:
- Great for deterministic UI flow checks, but weaker coverage of real cross-module interactions under refactors.

Behavior-preserving simplification:
- Add a small number of "semi-integrated" tests that use real hook/state flows for one critical path per subsystem.

## Recommended Work Plan (No Behavior Change)

1. Persistence layer simplification first (`storage.ts` migration guard + mutation helper + write coalescing).  
Reason: immediate risk/cost reduction across many flows.

2. `App.tsx` extraction pass (settings helper + featured launcher + passage workspace hook).  
Reason: biggest orchestrator debt and highest future-change leverage.

3. `useRSVP` retokenization consolidation.  
Reason: aligns with App extraction and lowers transition regressions.

4. `TrainingReader` reducer/state-machine extraction.  
Reason: largest complexity block; best done after shared persistence/state patterns are cleaner.

5. `ComprehensionCheck` hook/view split.

6. Electron main-process modularization + handler tests.

7. `saccade.ts` duplication cleanup.

## Risk Notes

- No critical correctness defects were identified in this review pass.
- Main risk is maintainability-driven regression probability, not current feature breakage.
- The current test suite is strong; use it as a guardrail while doing these refactors incrementally.

## Verification Used

- `bun run verify` (passed).
- Static review across core modules and tests:
  - `src/components/App.tsx`
  - `src/components/TrainingReader.tsx`
  - `src/hooks/useRSVP.ts`
  - `src/lib/storage.ts`
  - `src/components/ComprehensionCheck.tsx`
  - `src/lib/saccade.ts`
  - `electron/main.ts`
  - representative integration/unit tests in `src/components`, `src/hooks`, and `src/test`.
