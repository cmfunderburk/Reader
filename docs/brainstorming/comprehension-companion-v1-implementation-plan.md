# Comprehension Companion V1 Implementation Plan

Status: Draft
Owner: Product/Engineering
Related spec: `docs/brainstorming/comprehension-companion-v1-spec.md`

## Goal

Ship a standalone comprehension check activity that generates Adler-inspired, multi-format questions about texts the user has read, with LLM-powered scoring and explanatory feedback.

## Architecture Decisions (V1)

1. New top-level activity type: `comprehension-check`.
2. LLM-required — no deterministic fallback.
3. Provider-agnostic adapter (likely Gemini V1, swappable).
4. Article source is the existing queue — no new content persistence.
5. All existing features unchanged and usable without an API key.
6. Two LLM call types: question generation (one call per check) and answer scoring (one call per free-text question).
7. MC/TF questions auto-scored from generated answer key — no LLM scoring call needed.

## File-Level Plan

| Area | Files | Change |
|---|---|---|
| Types | `src/types/index.ts` | Add `ComprehensionAttempt`, `ComprehensionQuestionResult`, dimension/format types, activity type union. |
| Storage | `src/lib/storage.ts` | Add attempts key, load/save/append helpers, schema bump, cap enforcement. |
| Storage tests | `src/test/storage-helpers.test.ts` | Migration, round-trip, cap, and malformed-data tests. |
| LLM adapter | `src/lib/comprehensionAdapter.ts` | Provider-agnostic interface. `generateCheck()` and `scoreAnswer()`. Gemini implementation. |
| Adapter tests | `src/lib/comprehensionAdapter.test.ts` | Response parsing, error handling, structured output validation. |
| Prompt templates | `src/lib/comprehensionPrompts.ts` | Prompt builders for question generation and answer scoring. |
| Prompt tests | `src/lib/comprehensionPrompts.test.ts` | Prompt construction and response parsing tests. |
| Check UI | `src/components/ComprehensionCheck.tsx` | Main check surface: closed-book phase, open-book phase, question rendering (MC/TF/short/essay), submit, results with explanatory feedback. |
| Launcher card | `src/components/App.tsx` | New launcher card for comprehension-check activity. Article selection from existing queue. |
| Post-reading CTA | `src/components/App.tsx` | Inline button when paced reading reaches end-of-text. Transition to comprehension check. |
| Settings | `src/components/App.tsx` or settings surface | API key entry for LLM provider. |
| Styles | `src/index.css` | Styles for check phases, question formats, results/feedback display. |

## Milestones

### Milestone 1: Types + Storage

1. Add comprehension types to `src/types/index.ts`.
2. Add storage key, helpers, and cap enforcement to `src/lib/storage.ts`.
3. Schema migration (no-op for users without the key).
4. Tests for clean load, malformed filtering, cap behavior.

Acceptance: existing storage/migration tests still pass; new tests green.

### Milestone 2: LLM Adapter + Prompts

1. Define `ComprehensionAdapter` interface with `generateCheck()` and `scoreAnswer()`.
2. Implement Gemini adapter (or whichever provider is chosen).
3. Build question generation prompt that produces:
   - 8-10 questions spanning factual/inference/structural/evaluative dimensions.
   - Mix of MC, T/F, short answer, and essay formats.
   - Correct answers for MC/TF, model answers for all questions.
4. Build answer scoring prompt for free-text questions.
5. Parse structured JSON responses defensively.
6. Tests for response parsing and error paths.

Acceptance: adapter generates a well-formed check for a sample passage and scores a sample answer in a test harness.

### Milestone 3: Check UI + Entry Points

1. Build `ComprehensionCheck` component with:
   - Loading state while questions generate.
   - **Closed-book phase**: MC, T/F, and factual short-answer questions. Passage hidden.
   - **Open-book phase**: Inferential, structural, and evaluative questions. Passage visible.
   - Per-format question renderers (radio buttons for MC, toggle for T/F, text fields, text areas).
   - Submit action.
   - Results view: per-question feedback (explanatory, Adler-style), correct/incorrect indicators, overall summary with score secondary.
   - Dismiss/return action.
2. Add launcher card to home screen with article queue selection.
3. Add post-reading CTA button to end-of-text controls.
4. Wire article context through to check component.
5. Persist attempts on completion.

Acceptance: full flow works from both entry points; existing paced-reading behavior unaffected.

### Milestone 4: Settings + Polish

1. API key settings surface.
2. Error states: missing key prompt, generation failure with retry/dismiss, scoring failure with model answer fallback.
3. Basic attempt history (count or last score visible somewhere).
4. Style polish for both phases and results.

Acceptance: usable for 2-week trial. Quality gates pass (`bun run verify`).

## Delivery Sequence

1. PR1: types + storage + migration + tests.
2. PR2: LLM adapter + prompts + tests.
3. PR3: check UI + launcher card + post-reading CTA + integration.
4. PR4: settings + error handling + polish.

## Integration Notes

### Post-Reading Entry Point

The paced-reading flow in `App.tsx` already handles end-of-text state. The CTA button should appear in the existing end-of-text control area. Clicking it transitions to the `comprehension-check` activity with the current article's text and metadata passed through.

### Launcher Entry Point

Same launcher surface as existing activity cards. Article selection reuses the existing queue/article picker pattern. After selection, transitions to `comprehension-check` activity.

### Activity Type Wiring

Add `'comprehension-check'` to the `ActivityType` union. The app view state planner (`appViewState.ts`) and selectors (`appViewSelectors.ts`) will need cases for the new activity.

### Closed-to-Open-Book Transition

The check component manages a phase state. Questions are ordered: factual dimensions first (closed-book), then inference/structural/evaluative (open-book). When the user advances past the last closed-book question, the passage panel appears.

## QA Checklist

1. Post-reading entry: finish paced reading, tap CTA, complete check, return.
2. Launcher entry: select article, complete check, return.
3. Closed-book phase: passage is hidden, factual questions shown.
4. Open-book phase: passage visible, analytical questions shown.
5. MC/TF scoring: instant, correct answer revealed with explanation.
6. Short answer/essay scoring: LLM evaluates, feedback is explanatory.
7. Results view: per-question feedback prominent, overall score secondary.
8. LLM error on generation: retry and dismiss both work.
9. LLM error on scoring: model answer shown, question marked unscored.
10. Missing API key: clear prompt to configure, no crash.
11. Short passages: check still produces reasonable questions.
12. Existing features: paced reading, recall, prediction, training all unaffected.

## Done Definition for Trial Start

1. Both entry points functional.
2. Questions span factual/inference/structural/evaluative with mixed formats.
3. Closed-book and open-book phases work correctly.
4. MC/TF auto-scored; short answer/essay LLM-scored with explanatory feedback.
5. Attempts persist and survive reload.
6. LLM errors handled gracefully.
7. Quality gates pass: `bun run verify`.
