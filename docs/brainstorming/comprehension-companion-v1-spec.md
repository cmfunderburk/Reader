# Comprehension Companion V1 Spec

Status: Draft
Owner: Product/Engineering

## Purpose

Add a standalone comprehension check activity to Reader, inspired by the question design principles in Adler & Van Doren's *How to Read a Book* (Appendix B). V1 answers one question:

> Can LLM-generated, multi-format comprehension checks produce trustworthy signal about reading understanding and improve reading quality over a 2-week trial?

## Current State

Reader has strong mechanical reading and recall practice (RSVP, Saccade, Prediction, Recall, Training). Scoring is token-level (word accuracy, prediction correctness). There is no measure of whether the reader understood key claims, relations, or implications of what they read.

## Design Principles (from Adler)

Adler's reading exercises demonstrate several principles that guide this feature:

1. **Questions should cause reflection, not just test knowledge.** The purpose is learning, not scoring. Feedback should teach as much as the questions themselves.
2. **Question types should vary within a single check.** Multiple-choice, true/false, short answer, and essay questions coexist, each testing different comprehension dimensions.
3. **Difficulty should range from easy to hard deliberately.** Easy factual questions build confidence; hard inferential and evaluative questions push the reader's understanding deeper.
4. **Explanatory answers are as valuable as the questions.** Adler's answer keys often explain *why* an answer is correct, revealing deeper structure in the text. Our feedback should do the same.

## V1 Scope

A new top-level activity type (`comprehension-check`) that generates 8-10 questions about a text the user has read. Questions span a spectrum of comprehension dimensions:

| Dimension | What it tests | Example question style | Format |
|---|---|---|---|
| **Factual recall** | Did you absorb the key facts? | "At what age did Mill begin working for the East India Company?" | MC, T/F, short answer |
| **Inference** | Can you reason beyond what's stated? | "Can it be inferred that Mill considered his wife to be his greatest intellectual influence?" | MC, short answer |
| **Structural** | Did you grasp the shape of the argument or narrative? | "How does the author organize their central argument?" | Short answer |
| **Evaluative / critical** | Can you assess the author's project and judge it? | "Is the author's conclusion well-supported by the evidence presented? Why or why not?" | Essay |

All questions are passage-grounded in V1 (answerable from the text; no outside-knowledge questions).

## Entry Points

1. **Post-reading CTA** — When paced reading reaches end-of-text (auto or manual), an inline "Comprehension Check" button appears alongside existing end-of-text controls.
2. **Launcher card** — A new card on the home/launcher screen. User selects an article from the current queue and enters the comprehension check directly.

## Book Access: Level-Dependent

Not all questions benefit from the same access to the text:

- **Factual recall questions** are presented **closed-book** (passage hidden). These test genuine retention.
- **Inferential, structural, and evaluative questions** are presented **open-book** (passage available). The point is depth of understanding, not memory.

The check transitions from closed-book to open-book as it moves through question types.

## Explicit Non-Goals (V1)

1. No integration with training mode, drills, or active-recall exercises.
2. No deterministic/offline fallback scoring. LLM is required.
3. No outside-knowledge questions (passage-grounded only).
4. No syntopical / cross-text comparison mode.
5. No mandatory API key for existing features — comprehension check is opt-in.
6. No cross-session article persistence beyond the existing queue.

## UX Flow

### Generating the Check

1. User arrives at the comprehension check (via post-reading CTA or launcher card).
2. App sends the passage text to the LLM.
3. LLM generates 8-10 questions spanning the dimension spectrum, along with:
   - Correct answers for MC/TF questions (for auto-scoring).
   - Model answers and scoring criteria for free-text questions.
4. App presents questions to the user.

### Answering

1. **Closed-book phase**: Factual recall questions (MC, T/F, short answer) are presented first. Passage is hidden.
2. **Open-book phase**: Inferential, structural, and evaluative questions follow. Passage becomes available for reference.
3. User answers each question in sequence or freely navigates between them.
4. User submits when done.

### Scoring and Feedback

1. **MC and T/F** questions are scored instantly from the generated answer key.
2. **Short answer and essay** questions are scored by a second LLM call that evaluates the response and provides explanatory feedback.
3. Results are displayed per-question:
   - Correct/incorrect indicator (for auto-scored questions).
   - LLM-generated explanation of the correct answer and why it's correct.
   - For free-text: the LLM's evaluation of the user's answer plus guidance.
4. An overall summary is shown, but score is **secondary to feedback**. The explanations are the primary output.

### Return

User dismisses results and returns to the launcher or post-reading state.

## Question Generation

### Prompt Design Principles

1. Questions must be answerable from the passage only (V1).
2. Target central claims, key relationships, and argument structure — not trivia.
3. Include a mix of formats: at least 2-3 MC/TF, 2-3 short answer, and 2-3 essay/evaluative.
4. Difficulty should range from straightforward factual to genuinely challenging inferential/evaluative.
5. Each question should specify its dimension (factual, inference, structural, evaluative) and format.
6. For MC questions, generate plausible distractors that test understanding, not trick the reader.
7. For essay questions, generate a model answer that explains the reasoning, not just states the conclusion.

### Generated Output Shape

```ts
interface GeneratedCheck {
  questions: GeneratedQuestion[];
}

interface GeneratedQuestion {
  id: string;
  dimension: 'factual' | 'inference' | 'structural' | 'evaluative';
  format: 'multiple-choice' | 'true-false' | 'short-answer' | 'essay';
  prompt: string;
  // MC/TF fields:
  options?: string[];           // MC answer choices
  correctOptionIndex?: number;  // index into options array
  correctAnswer?: boolean;      // for T/F
  // Shared:
  modelAnswer: string;          // explanatory model answer (shown in feedback)
}
```

## Scoring

### Auto-Scored Questions (MC, T/F)

Scored instantly by comparing user's selection to the generated correct answer. Feedback: the model answer explanation is revealed regardless of correctness.

### LLM-Scored Questions (Short Answer, Essay)

A second LLM call receives the passage, question, model answer/criteria, and user's response. It returns:

```ts
interface QuestionScore {
  score: number;          // 0-3 scale
  feedback: string;       // explanatory evaluation, Adler-style
}
```

The scoring prompt instructs the LLM to:
- Evaluate against the passage, not general knowledge.
- Explain what the answer got right and what it missed.
- Keep feedback educational and concise (2-3 sentences).

### Overall Score

- Computed from individual question scores but displayed **secondarily** to per-question feedback.
- Intended for trend tracking over time, not as the primary output of the check.

## Data Model

```ts
export type ComprehensionDimension = 'factual' | 'inference' | 'structural' | 'evaluative';
export type ComprehensionFormat = 'multiple-choice' | 'true-false' | 'short-answer' | 'essay';

export interface ComprehensionQuestionResult {
  id: string;
  dimension: ComprehensionDimension;
  format: ComprehensionFormat;
  prompt: string;
  userAnswer: string;                // user's response (or selected option label)
  modelAnswer: string;               // explanatory model answer
  score: number;                     // 0-3
  feedback: string;                  // LLM explanation or auto-generated for MC/TF
  correct?: boolean;                 // for auto-scored MC/TF
}

export interface ComprehensionAttempt {
  id: string;
  articleId: string;
  articleTitle: string;
  entryPoint: 'post-reading' | 'launcher';
  questions: ComprehensionQuestionResult[];
  overallScore: number;              // aggregate, 0-100
  createdAt: number;
  durationMs: number;
}
```

### Persistence

1. New storage key: `speedread_comprehension_attempts`.
2. Helpers: `loadComprehensionAttempts()`, `saveComprehensionAttempts()`, `appendComprehensionAttempt()`.
3. Capped history (last 200 attempts) to limit localStorage growth.
4. Schema version bump with no-op migration for users without the key.

## LLM Integration

### Provider

V1 will likely use Google Gemini API. The adapter interface should be provider-agnostic.

### Adapter Interface

```ts
interface ComprehensionAdapter {
  generateCheck(passage: string, questionCount: number): Promise<GeneratedCheck>;
  scoreAnswer(passage: string, question: GeneratedQuestion, userAnswer: string): Promise<QuestionScore>;
}
```

### Failure Handling

- If question generation fails, show an error and let the user retry or dismiss.
- If scoring fails for a question, mark it as unscored and still show the model answer.
- Never block the user from returning to their reading flow.

## API Key Handling (V1)

1. Existing features remain fully available without any API key.
2. Comprehension check requires a configured API key.
3. Settings surface for entering/updating the key.
4. Key stored in localStorage for web; secure store for Electron (future).

## 2-Week Trial Plan

### Protocol

- Week 1: Use post-reading entry only. Collect baseline on completion, score stability, and feedback quality.
- Week 2: Enable launcher entry as well. Compare usage patterns.

### Success Criteria

1. Completion rate >= 60% when started.
2. Median completion time <= 10 minutes.
3. LLM failure rate <= 5%.
4. >= 70% of questions judged face-valid in manual spot review.
5. Feedback perceived as educational and actionable.
6. Question difficulty range feels appropriate (not all trivial, not all impossibly hard).

### Failure Criteria

1. Completion rate < 40%.
2. Frequent hallucinated or obviously wrong scoring/feedback.
3. Generated questions are mostly trivial or mostly off-target.
4. Flow disruption (check feels like a tax on reading).

### Decision

1. **Continue**: reliability and usability acceptable.
2. **Iterate**: keep concept, adjust prompts/question generation/UX.
3. **Kill/pause**: scoring trust or question quality cannot be raised quickly.

## Future Directions (Post-V1)

1. **Outside-knowledge questions** — Questions that connect the text to broader knowledge.
2. **Syntopical checks** — Compare comprehension across multiple texts on a shared theme.
3. **Adaptive difficulty** — Adjust question mix based on user's performance history.
4. **Spaced review** — Surface old passages for re-checking at intervals.

## Open Questions

1. Should the closed-to-open-book transition be a hard phase boundary, or can the user reveal the passage at any time?
2. Should the check allow revisiting/changing answers before final submit?
3. Should there be a time indicator (not a limit) to help the user pace?
4. For very short passages, should the question count be reduced automatically?
