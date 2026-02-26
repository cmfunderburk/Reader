# Codebase Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce cognitive load in the largest files, improve modularity, close test gaps, and clean up small inconsistencies — all without behavior changes.

**Architecture:** Pure structural refactoring. Files are split along domain boundaries. Re-exports maintain backward compatibility. No logic changes, no new features.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, bun

**Design doc:** `docs/plans/2026-02-24-codebase-cleanup-design.md`

---

## Task 1: Characterization tests for generationMask internals

Test the existing public API with inputs designed to exercise internal paths that will later become separate modules (language detection, token processing). These tests serve as a safety net for the upcoming split.

**Files:**
- Modify: `src/lib/generationMask.test.ts`

**Step 1: Add language detection characterization tests**

Add these tests at the end of the existing describe block in `src/lib/generationMask.test.ts`:

```typescript
  it('masks content words in mixed German/English text with German cues', () => {
    const line = 'Die learning strategy ist retrieval practice.';
    const masked = maskGenerationLine(line, 'hard', 50, 0);
    // German cues (Die, ist) trigger German line detection
    // Content words should be masked; function words preserved
    expect(masked).toContain('Die');
    expect(masked).toContain('ist');
    expect(masked).not.toContain('learning');
    expect(masked).not.toContain('strategy');
  });

  it('treats short lines (< 3 alpha tokens) as non-German regardless of cues', () => {
    const line = 'Die Katze.';
    const masked = maskGenerationLine(line, 'hard', 50, 0);
    // Only 2 alpha tokens — too short for German detection
    // Title case "Katze" mid-sentence would normally be proper noun in English
    expect(masked).toContain('Katze');
  });

  it('treats all-caps lines as having acronyms, not title case', () => {
    const line = 'NASA FBI CIA DHS TSA';
    const masked = maskGenerationLine(line, 'normal', 50, 0);
    // All acronyms — none should be masked
    expect(masked).toBe(line);
  });

  it('handles lines with only function words by returning them unmasked', () => {
    const line = 'the and or but if so';
    const masked = maskGenerationLine(line, 'normal', 50, 0);
    expect(masked).toBe(line);
  });

  it('splits hyphenated tokens and masks each segment independently in recall mode', () => {
    const line = 'state-of-the-art';
    const masked = maskGenerationLine(line, 'recall', 1, 0);
    const segments = masked.split('-');
    // 'of' and 'the' are short function words — recall masks all alpha tokens with >=3 letters
    expect(segments[0]).toBe('s___e'); // state
    expect(segments[1]).toBe('of');    // too short
    expect(segments[2]).toBe('the');   // too short
    expect(segments[3]).toBe('a_t');   // art
  });

  it('preserves whitespace structure of the original line', () => {
    const line = '  retrieval   practice  ';
    const masked = maskGenerationLine(line, 'normal', 50, 0);
    expect(masked.startsWith('  ')).toBe(true);
    expect(masked.endsWith('  ')).toBe(true);
    expect(masked).toMatch(/\S   \S/); // triple space preserved
  });

  it('handles empty and whitespace-only lines', () => {
    expect(maskGenerationLine('', 'normal', 1, 0)).toBe('');
    expect(maskGenerationLine('   ', 'normal', 1, 0)).toBe('   ');
  });
```

**Step 2: Run tests to verify they pass**

Run: `bun run test:run -- src/lib/generationMask.test.ts`
Expected: All tests PASS (these characterize existing behavior, not new behavior)

**Step 3: Commit**

```
git add src/lib/generationMask.test.ts
git commit -m "test: add characterization tests for generationMask internals"
```

---

## Task 2: Split generationMask.ts into three modules

Pure file split. No logic changes. The public API (`maskGenerationLine`) stays in `generationMask.ts` and continues to work identically.

**Files:**
- Create: `src/lib/generationLanguage.ts`
- Create: `src/lib/generationTokens.ts`
- Modify: `src/lib/generationMask.ts`

**Step 1: Create `src/lib/generationLanguage.ts`**

Move language detection constants and functions:

```typescript
const GERMAN_CHAR_REGEX = /[ÄÖÜäöüß]/;

export const GERMAN_CONTEXT_CUES: ReadonlySet<string> = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des',
  'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
  'und', 'nicht', 'mit', 'fuer', 'fur',
  'ich', 'wir', 'sie', 'ist', 'sind', 'dass',
  'vom', 'zum', 'zur', 'im', 'am',
]);

export const NAME_PREFIXES: ReadonlySet<string> = new Set([
  'von', 'van', 'de', 'del', 'da', 'di', 'du', 'la', 'le',
]);

export const NAME_TITLES: ReadonlySet<string> = new Set([
  'dr', 'prof', 'herr', 'frau',
]);

export const GERMAN_DETERMINERS: ReadonlySet<string> = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des',
  'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
]);

export function isLikelyGermanLine(
  alphaTokenCount: number,
  germanCueCount: number,
  hasGermanChar: boolean,
): boolean {
  if (alphaTokenCount < 3) return false;
  if (germanCueCount >= 2) return true;
  return hasGermanChar && germanCueCount >= 1;
}

export function classifyGermanSignals(
  cores: Iterable<{ core: string; normalizedAlpha: string }>,
): { alphaTokenCount: number; germanCueCount: number; hasGermanChar: boolean } {
  let alphaTokenCount = 0;
  let germanCueCount = 0;
  let hasGermanChar = false;

  for (const { core, normalizedAlpha } of cores) {
    if (normalizedAlpha.length === 0) continue;
    alphaTokenCount += 1;
    if (GERMAN_CONTEXT_CUES.has(normalizedAlpha)) germanCueCount += 1;
    if (!hasGermanChar && GERMAN_CHAR_REGEX.test(core)) hasGermanChar = true;
  }

  return { alphaTokenCount, germanCueCount, hasGermanChar };
}
```

Wait — looking at the actual code more carefully, the functions reference `TokenInfo` and `partsByTokenIndex` Map types that tie them to the token processing layer. Let me take a simpler approach: move just the constants (which are the clear seam), and keep the detection functions in generationMask.ts where they use the token data structures.

Actually, the cleanest split follows the design doc's intent but keeps the implementation realistic. Let me restructure:

**Step 1: Create `src/lib/generationLanguage.ts`**

Move the language-related constants. The detection functions that iterate over tokens stay in generationMask.ts since they depend on the token data structures.

```typescript
export const GERMAN_CHAR_REGEX = /[ÄÖÜäöüß]/;

export const GERMAN_CONTEXT_CUES: ReadonlySet<string> = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des',
  'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
  'und', 'nicht', 'mit', 'fuer', 'fur',
  'ich', 'wir', 'sie', 'ist', 'sind', 'dass',
  'vom', 'zum', 'zur', 'im', 'am',
]);

export const NAME_PREFIXES: ReadonlySet<string> = new Set([
  'von', 'van', 'de', 'del', 'da', 'di', 'du', 'la', 'le',
]);

export const NAME_TITLES: ReadonlySet<string> = new Set([
  'dr', 'prof', 'herr', 'frau',
]);

export const GERMAN_DETERMINERS: ReadonlySet<string> = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des',
  'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
]);
```

**Step 2: Create `src/lib/generationTokens.ts`**

Move text processing types, constants, and pure functions that don't depend on mask context:

```typescript
export interface TokenInfo {
  raw: string;
  start: number;
  end: number;
  sentenceInitial: boolean;
}

export interface CoreParts {
  leading: string;
  core: string;
  trailing: string;
}

export const HYPHEN_SEPARATOR_REGEX = /[-\u2010\u2011\u2012\u2013\u2014]/;
export const HYPHEN_SPLIT_REGEX = /([-\u2010\u2011\u2012\u2013\u2014]+)/;
export const LETTER_REGEX = /\p{L}/u;
export const LETTER_OR_DIGIT_REGEX = /[\p{L}\p{N}]/u;

export function hashToUnitInterval(input: string): number {
  // FNV-1a 32-bit hash
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return ((hash >>> 0) & 0xffffffff) / 0x100000000;
}

export function splitCoreParts(token: string): CoreParts | null {
  const match = token.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}][\p{L}\p{N}''\u2019-]*)([^\p{L}\p{N}]*)$/u);
  if (!match) return null;
  return {
    leading: match[1],
    core: match[2],
    trailing: match[3],
  };
}

function isSentenceBoundaryToken(token: string): boolean {
  return /[.!?]["')\]]*$/.test(token);
}

export function extractTokens(lineText: string): TokenInfo[] {
  const regex = /\S+/g;
  const tokens: TokenInfo[] = [];
  let match;
  let sentenceInitial = true;

  while ((match = regex.exec(lineText)) !== null) {
    const raw = match[0];
    tokens.push({
      raw,
      start: match.index,
      end: match.index + raw.length,
      sentenceInitial,
    });
    sentenceInitial = isSentenceBoundaryToken(raw);
  }

  return tokens;
}

export function isAcronym(core: string): boolean {
  const normalized = core.replace(/[^\p{L}]/gu, '');
  return /^\p{Lu}{2,}$/u.test(normalized);
}

export function normalizeAlpha(core: string): string {
  return core
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/ß/g, 'ss')
    .replace(/[^\p{L}]/gu, '');
}

export function isSimpleTitleCase(core: string): boolean {
  return /^\p{Lu}\p{Ll}+(?:[''\u2019-]\p{Lu}?\p{Ll}+)*$/u.test(core);
}

export function isInternalCapWord(core: string): boolean {
  return /^\p{Lu}\p{Ll}+(?:\p{Lu}\p{Ll}+)+$/u.test(core);
}

export function isLikelyTitleCaseLine(tokens: TokenInfo[], partsByTokenIndex: Map<number, CoreParts>): boolean {
  let alphaTokenCount = 0;
  let titleCaseCount = 0;

  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
    const parts = partsByTokenIndex.get(tokenIndex);
    if (!parts) continue;
    const alphaOnly = normalizeAlpha(parts.core);
    if (alphaOnly.length === 0) continue;

    alphaTokenCount += 1;
    if (isSimpleTitleCase(parts.core) || isInternalCapWord(parts.core) || isAcronym(parts.core)) {
      titleCaseCount += 1;
    }
  }

  if (alphaTokenCount < 3) return false;
  return (titleCaseCount / alphaTokenCount) >= 0.65;
}
```

**Step 3: Update `src/lib/generationMask.ts`**

Replace the moved code with imports. Keep `maskGenerationLine` as the public export. The file should now contain:
- Imports from `generationLanguage.ts` and `generationTokens.ts`
- Import of `FUNCTION_WORDS` from `tokenizer.ts`
- `MaskProfile`, `MaskContext` interfaces
- `DIFFICULTY_PROFILES` constant
- `isLikelyGermanLine`, `isNameLikeTitleWord`, `hasAdjacentNameLikeTitleWord`, `hasNameLikeWordAcrossPrefix`, `hasHonorificBefore`, `isProperNoun`, `isMaskEligible` — name-detection and mask-eligibility functions that depend on both language constants and token types
- `maskSingleCoreWord`, `maskCoreWord`, `maskSingleCoreWordToFirstLast`, `maskCoreWordToFirstLast`, `maskCoreWordByProfile`, `selectNonConsecutiveIndices` — masking mechanics
- `maskGenerationLine` — public entry point

The top of the file becomes:

```typescript
import type { GenerationDifficulty } from '../types';
import { FUNCTION_WORDS } from './tokenizer';
import {
  GERMAN_CHAR_REGEX,
  GERMAN_CONTEXT_CUES,
  GERMAN_DETERMINERS,
  NAME_PREFIXES,
  NAME_TITLES,
} from './generationLanguage';
import {
  type TokenInfo,
  type CoreParts,
  HYPHEN_SEPARATOR_REGEX,
  HYPHEN_SPLIT_REGEX,
  LETTER_REGEX,
  LETTER_OR_DIGIT_REGEX,
  hashToUnitInterval,
  splitCoreParts,
  extractTokens,
  isAcronym,
  normalizeAlpha,
  isSimpleTitleCase,
  isInternalCapWord,
  isLikelyTitleCaseLine,
} from './generationTokens';
```

Remove all the moved declarations. Everything else stays exactly as-is.

**Step 4: Run tests to verify nothing broke**

Run: `bun run verify`
Expected: All tests PASS, lint clean, types clean

**Step 5: Commit**

```
git add src/lib/generationLanguage.ts src/lib/generationTokens.ts src/lib/generationMask.ts
git commit -m "refactor: split generationMask into language, tokens, and mask modules"
```

---

## Task 3: Create `storageKeys.ts` and `storageMigrations.ts`

Extract the key namespace and migration machinery from storage.ts. This is the foundation for the remaining storage splits.

**Files:**
- Create: `src/lib/storageKeys.ts`
- Create: `src/lib/storageMigrations.ts`
- Modify: `src/lib/storage.ts`

**Step 1: Create `src/lib/storageKeys.ts`**

Move `STORAGE_KEYS` and `CURRENT_STORAGE_SCHEMA_VERSION`:

```typescript
export const STORAGE_KEYS = {
  schemaVersion: 'speedread_schema_version',
  articles: 'speedread_articles',
  feeds: 'speedread_feeds',
  settings: 'speedread_settings',
  passages: 'speedread_passages',
  sessionSnapshot: 'speedread_session_snapshot',
  drillState: 'speedread_drill_state',
  trainingSentenceMode: 'speedread_training_sentence',
  trainingScoreDetails: 'speedread_training_score_details',
  trainingScaffold: 'speedread_training_scaffold',
  dailyDate: 'speedread_daily_date',
  dailyArticleId: 'speedread_daily_article_id',
  comprehensionAttempts: 'speedread_comprehension_attempts',
  comprehensionApiKey: 'speedread_comprehension_api_key',
} as const;

export const CURRENT_STORAGE_SCHEMA_VERSION = 3;
```

**Step 2: Create `src/lib/storageMigrations.ts`**

Move schema version tracking, all migration functions, and `runStorageMigrations`. Also move `clampWpm` (the storage variant), `normalizeDrillState`, and the parser helpers that migrations depend on, since they're needed by `migrateSettingsToV1` and `migrateDrillStateToV1`.

Note: `migrateComprehensionAttemptsToV3` calls `parseComprehensionAttempt` which is a large function tree (~400 lines) in storage.ts. For now, `storageMigrations.ts` imports that function from `storage.ts` (or later from `storageComprehension.ts`). This avoids moving the massive comprehension parser chain in this task.

```typescript
import { STORAGE_KEYS, CURRENT_STORAGE_SCHEMA_VERSION } from './storageKeys';
import { MAX_WPM, MIN_WPM } from './wpm';
import type { Activity } from '../types';
import type { DrillState, Settings } from './storage';

let lastKnownStorageSchemaVersion: number | null = null;

function loadStorageSchemaVersion(): number {
  const raw = localStorage.getItem(STORAGE_KEYS.schemaVersion);
  if (!raw) return 0;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) return 0;
  return parsed;
}

function saveStorageSchemaVersion(version: number): void {
  localStorage.setItem(STORAGE_KEYS.schemaVersion, String(version));
}

// --- clampWpm for deserialization (accepts unknown) ---

export function clampWpmFromStorage(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(MIN_WPM, Math.min(MAX_WPM, Math.round(n)));
}
```

Wait — there's a circular dependency risk. `storageMigrations.ts` needs `DrillState` and `Settings` types from `storage.ts`, but `storage.ts` will import `runStorageMigrations` from `storageMigrations.ts`. TypeScript `import type` avoids runtime circularity, but this is still fragile.

Better approach: keep migration functions that reference complex types (like `parseComprehensionAttempt`) inline in `storage.ts` for now, and only extract the version tracking + `runStorageMigrations` wrapper. The migration functions themselves stay in `storage.ts` but are called by the extracted `runStorageMigrations`.

**Revised approach: `storageMigrations.ts` exports only the migration runner and version tracking. Migration function implementations stay in `storage.ts` and are passed as a callback.**

Actually, simplest and cleanest: `storageMigrations.ts` owns the full migration pipeline. The types it needs (`DrillState`, `Settings`) move to their respective new modules in later tasks. For THIS task, we accept that `storageMigrations.ts` imports types from `storage.ts` via `import type` (no runtime circular dependency).

Let me keep this pragmatic. The migration functions reference `clampWpm`, `normalizeDrillState`, `parseComprehensionAttempt`, and `DEFAULT_SETTINGS` — all currently in storage.ts. Moving all of those now would make this task too large.

**Revised step 2: Minimal extraction — version tracking + migration runner shell**

Create `src/lib/storageMigrations.ts` with version tracking. The actual migration function implementations stay in `storage.ts` for now. `runStorageMigrations` calls through to them.

```typescript
import { STORAGE_KEYS, CURRENT_STORAGE_SCHEMA_VERSION } from './storageKeys';

let lastKnownStorageSchemaVersion: number | null = null;

function loadStorageSchemaVersion(): number {
  const raw = localStorage.getItem(STORAGE_KEYS.schemaVersion);
  if (!raw) return 0;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) return 0;
  return parsed;
}

function saveStorageSchemaVersion(version: number): void {
  localStorage.setItem(STORAGE_KEYS.schemaVersion, String(version));
}

export type MigrationCallbacks = {
  migrateToV1: () => void;
  migrateToV3: () => void;
};

let callbacks: MigrationCallbacks | null = null;

export function registerMigrationCallbacks(cbs: MigrationCallbacks): void {
  callbacks = cbs;
}

export function runStorageMigrations(): void {
  const currentVersion = loadStorageSchemaVersion();
  if (
    currentVersion >= CURRENT_STORAGE_SCHEMA_VERSION
    && lastKnownStorageSchemaVersion === currentVersion
  ) {
    return;
  }
  if (currentVersion >= CURRENT_STORAGE_SCHEMA_VERSION) {
    lastKnownStorageSchemaVersion = currentVersion;
    return;
  }

  if (!callbacks) {
    throw new Error('Storage migrations not initialized — call registerMigrationCallbacks first');
  }

  if (currentVersion < 1) {
    callbacks.migrateToV1();
  }

  if (currentVersion < 3) {
    callbacks.migrateToV3();
  }

  saveStorageSchemaVersion(CURRENT_STORAGE_SCHEMA_VERSION);
  lastKnownStorageSchemaVersion = CURRENT_STORAGE_SCHEMA_VERSION;
}
```

Hmm — this callback pattern adds complexity that doesn't exist today. Let me reconsider.

**Final approach: keep it simple.** The cleanest path is:

1. Extract `storageKeys.ts` (constants only — trivial, no dependencies)
2. Leave `storageMigrations.ts` for a later task when the storage domain modules exist and the migration functions can reference them without circularity
3. For now, `storage.ts` imports `STORAGE_KEYS` and `CURRENT_STORAGE_SCHEMA_VERSION` from `storageKeys.ts`

This gives us the shared key namespace that all split modules need, without introducing complexity.

**Step 1: Create `src/lib/storageKeys.ts`** (as above)

**Step 2: Update `src/lib/storage.ts`**

Replace the `STORAGE_KEYS` and `CURRENT_STORAGE_SCHEMA_VERSION` declarations with:

```typescript
import { STORAGE_KEYS, CURRENT_STORAGE_SCHEMA_VERSION } from './storageKeys';
```

Remove the `const STORAGE_KEYS = { ... } as const;` block (lines 33-48) and `const CURRENT_STORAGE_SCHEMA_VERSION = 3;` (line 50).

**Step 3: Run tests**

Run: `bun run verify`
Expected: All tests PASS

**Step 4: Commit**

```
git add src/lib/storageKeys.ts src/lib/storage.ts
git commit -m "refactor: extract storageKeys.ts from storage.ts"
```

---

## Task 4: Split storageSettings.ts from storage.ts

**Files:**
- Create: `src/lib/storageSettings.ts`
- Modify: `src/lib/storage.ts`

**Step 1: Create `src/lib/storageSettings.ts`**

Move the `Settings` interface, `DEFAULT_SETTINGS`, parser helpers (`clampWpm`, `parseComprehensionGeminiModel`, `parseGenerationDifficulty`, `parseGenerationSweepReveal`), and `loadSettings`/`saveSettings`.

The file imports `STORAGE_KEYS` from `storageKeys.ts`, types from `../types`, WPM constants from `wpm.ts`, and `runStorageMigrations` from `storage.ts` (which is still the migration host).

Note: `runStorageMigrations` stays in `storage.ts` for now. `storageSettings.ts` imports it.

```typescript
import type {
  TokenMode,
  PredictionLineWidth,
  PredictionPreviewMode,
  ThemePreference,
  RampCurve,
  Activity,
  DisplayMode,
  SaccadePacerStyle,
  SaccadeFocusTarget,
  GenerationDifficulty,
  ComprehensionGeminiModel,
} from '../types';
import { COMPREHENSION_GEMINI_MODELS } from '../types';
import { STORAGE_KEYS } from './storageKeys';
import { MAX_WPM, MIN_WPM } from './wpm';
import { runStorageMigrations } from './storage';

export interface Settings { ... }  // exact copy from storage.ts lines 53-81

export const DEFAULT_SETTINGS: Settings = { ... };  // exact copy from storage.ts lines 83-115

// exact copies of clampWpm, parseComprehensionGeminiModel, parseGenerationDifficulty, parseGenerationSweepReveal

export function loadSettings(): Settings { ... }  // exact copy from storage.ts lines 400-443

export function saveSettings(settings: Settings): void { ... }  // exact copy from storage.ts lines 448-467
```

**Step 2: Update `storage.ts`**

- Remove the `Settings` interface, `DEFAULT_SETTINGS`, parser helpers, `loadSettings`, and `saveSettings`
- Add re-exports: `export { type Settings, DEFAULT_SETTINGS, loadSettings, saveSettings } from './storageSettings';`
- The `clampWpm` function is still needed by migration functions in storage.ts — either keep a local copy or import from storageSettings. Since storageSettings imports `runStorageMigrations` from storage.ts, importing `clampWpm` back would be circular at runtime. **Keep a local `clampWpm` in storage.ts for migration use** (it's 4 lines).

**Step 3: Run tests**

Run: `bun run verify`
Expected: PASS

**Step 4: Commit**

```
git add src/lib/storageSettings.ts src/lib/storage.ts
git commit -m "refactor: extract storageSettings.ts from storage.ts"
```

---

## Task 5: Split storageTraining.ts from storage.ts

**Files:**
- Create: `src/lib/storageTraining.ts`
- Modify: `src/lib/storage.ts`

**Step 1: Create `src/lib/storageTraining.ts`**

Move: `TrainingHistoryEntry` interface, `TrainingHistory` type, `trainingKey` helper, `loadTrainingHistory`, `saveTrainingHistory`, `loadStoredBoolean`, `saveStoredBoolean`, sentence mode/score details/scaffold load/save pairs, `DrillState` interface, `normalizeDrillState`, `loadDrillState`, `saveDrillState`.

Imports: `STORAGE_KEYS` from `storageKeys.ts`, `runStorageMigrations` from `storage.ts`, `MAX_WPM`/`MIN_WPM` from `wpm.ts`.

Note: `normalizeDrillState` calls `clampWpm` — include the storage variant locally (4 lines) to avoid circular imports.

**Step 2: Update `storage.ts`**

Remove moved code. Add re-exports:
```typescript
export {
  type TrainingHistoryEntry,
  type TrainingHistory,
  type DrillState,
  loadTrainingHistory,
  saveTrainingHistory,
  loadTrainingSentenceMode,
  saveTrainingSentenceMode,
  loadTrainingScoreDetails,
  saveTrainingScoreDetails,
  loadTrainingScaffold,
  saveTrainingScaffold,
  loadDrillState,
  saveDrillState,
} from './storageTraining';
```

Keep `normalizeDrillState` and `migrateDrillStateToV1` in storage.ts (migration needs them), OR import `normalizeDrillState` from `storageTraining.ts` since storage.ts → storageTraining.ts is one-directional and storageTraining.ts → storage.ts is only for `runStorageMigrations`. Check that this doesn't create a runtime circular issue.

Actually: `storageTraining.ts` imports `runStorageMigrations` from `storage.ts`. If `storage.ts` also imports `normalizeDrillState` from `storageTraining.ts`, that's a circular import. ES modules handle this for values that are accessed lazily (function calls), but it's fragile.

**Safer:** keep `normalizeDrillState` and `clampWpm` duplicated in both files (they're small pure functions). Or better: move `clampWpm` to `wpm.ts` (Task 7 does this anyway), then both files import from `wpm.ts`.

**Pragmatic order:** Do Task 7 (clampWpm to wpm.ts) before this task. Let me reorder.

---

*At this point the dependencies are getting entangled. Let me restructure the execution order to avoid circular import issues.*

---

## Revised Execution Order

The storage split has a fundamental challenge: split modules need `runStorageMigrations()`, which lives in `storage.ts`, but `storage.ts` needs to re-export from the split modules. This creates bidirectional imports.

**Resolution:** Extract `runStorageMigrations` into `storageMigrations.ts` FIRST, breaking the cycle. Migration functions that reference complex types can import those types via `import type` (no runtime dependency).

Here's the corrected order:

1. **Task 1:** Characterization tests for generationMask
2. **Task 2:** Split generationMask.ts
3. **Task 3:** Extract storageKeys.ts (constants)
4. **Task 4:** Move clampWpm variants to wpm.ts (prerequisite for storage splits)
5. **Task 5:** Extract storageMigrations.ts (migration runner + migration functions)
6. **Task 6:** Extract storageSettings.ts
7. **Task 7:** Extract storageTraining.ts
8. **Task 8:** Extract storageComprehension.ts
9. **Task 9:** Move pure utilities out of App.tsx
10. **Task 10:** Extract comprehensionJson.ts (shared LLM JSON parser)
11. **Task 11:** Characterization tests for TrainingReader
12. **Task 12:** Extract useTrainingRecall hook
13. **Task 13:** Extract useTrainingDrillState hook
14. **Task 14:** Extract useComprehensionState hook

Each task: implement → `bun run verify` → commit.

---

## Task 4 (revised): Move clampWpm variants to wpm.ts

**Files:**
- Modify: `src/lib/wpm.ts`
- Modify: `src/lib/storage.ts`
- Modify: `src/components/App.tsx`

**Step 1: Add clampWpm functions to wpm.ts**

```typescript
export const MIN_WPM = 100;
export const MAX_WPM = 800;

export function clampWpm(value: number): number {
  return Math.max(MIN_WPM, Math.min(MAX_WPM, Math.round(value)));
}

export function clampWpmFromStorage(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(MIN_WPM, Math.min(MAX_WPM, Math.round(n)));
}
```

**Step 2: Update storage.ts**

Replace the local `clampWpm` function (lines 117-121) with:
```typescript
import { clampWpmFromStorage as clampWpm } from './wpm';
```

Update the existing import line to include it:
```typescript
import { MAX_WPM, MIN_WPM, clampWpmFromStorage as clampWpm } from './wpm';
```

Remove the local `function clampWpm(...)` definition.

**Step 3: Update App.tsx**

Replace the local `clampWpm` function (lines 142-144) with an import:
```typescript
import { clampWpm } from '../lib/wpm';
```

Remove the local `function clampWpm(...)` definition. Remove `MAX_WPM`/`MIN_WPM` from the `../lib/wpm` import if they're already there (they are — line 127).

**Step 4: Run tests**

Run: `bun run verify`
Expected: PASS

**Step 5: Commit**

```
git add src/lib/wpm.ts src/lib/storage.ts src/components/App.tsx
git commit -m "refactor: consolidate clampWpm variants into wpm.ts"
```

---

## Task 5 (revised): Extract storageMigrations.ts

All migration functions and the runner move here. This file imports from `storageKeys.ts` and `wpm.ts` only. It uses `import type` for types from other storage modules.

**Files:**
- Create: `src/lib/storageMigrations.ts`
- Modify: `src/lib/storage.ts`

**Step 1: Create `src/lib/storageMigrations.ts`**

Move from storage.ts:
- `lastKnownStorageSchemaVersion` variable
- `loadStorageSchemaVersion` / `saveStorageSchemaVersion`
- `migrateSettingsToV1` / `migrateDrillStateToV1` / `normalizeDrillState` / `migrateComprehensionAttemptsToV3`
- `runStorageMigrations`

This file needs: `STORAGE_KEYS`, `CURRENT_STORAGE_SCHEMA_VERSION` from storageKeys; `clampWpmFromStorage` from wpm; types from `../types`. For `migrateComprehensionAttemptsToV3`, it calls `parseComprehensionAttempt` — which is a large function tree. **Move `parseComprehensionAttempt` and its helpers into storageMigrations.ts as well**, since they're only used for migration and load/save (which will move to storageComprehension.ts later).

Actually — `parseComprehensionAttempt` is used by both `migrateComprehensionAttemptsToV3` AND `loadComprehensionAttempts`. So it needs to be accessible from both. Best option: keep `parseComprehensionAttempt` in `storage.ts` for now and have `storageMigrations.ts` import it. Since `storage.ts` will import `runStorageMigrations` from `storageMigrations.ts`, this is circular.

**Simplest resolution:** `storageMigrations.ts` accepts the V3 migration as a callback registered by storage.ts at module load time.

```typescript
import { STORAGE_KEYS, CURRENT_STORAGE_SCHEMA_VERSION } from './storageKeys';
import { clampWpmFromStorage } from './wpm';
import type { Activity } from '../types';

let lastKnownStorageSchemaVersion: number | null = null;

function loadStorageSchemaVersion(): number {
  const raw = localStorage.getItem(STORAGE_KEYS.schemaVersion);
  if (!raw) return 0;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) return 0;
  return parsed;
}

function saveStorageSchemaVersion(version: number): void {
  localStorage.setItem(STORAGE_KEYS.schemaVersion, String(version));
}

// V1 migrations are self-contained (only depend on STORAGE_KEYS and clampWpmFromStorage)

function migrateSettingsToV1(): void {
  // ... exact copy from storage.ts, using clampWpmFromStorage instead of clampWpm
}

function normalizeDrillState(parsed: Record<string, unknown>): Record<string, unknown> {
  // ... exact copy from storage.ts, using clampWpmFromStorage
}

function migrateDrillStateToV1(): void {
  // ... exact copy from storage.ts
}

// V3 migration callback — registered by storageComprehension.ts or storage.ts
let migrateToV3: (() => void) | null = null;

export function registerV3Migration(fn: () => void): void {
  migrateToV3 = fn;
}

export function runStorageMigrations(): void {
  const currentVersion = loadStorageSchemaVersion();
  if (
    currentVersion >= CURRENT_STORAGE_SCHEMA_VERSION
    && lastKnownStorageSchemaVersion === currentVersion
  ) {
    return;
  }
  if (currentVersion >= CURRENT_STORAGE_SCHEMA_VERSION) {
    lastKnownStorageSchemaVersion = currentVersion;
    return;
  }

  if (currentVersion < 1) {
    migrateSettingsToV1();
    migrateDrillStateToV1();
  }

  if (currentVersion < 3) {
    migrateToV3?.();
  }

  saveStorageSchemaVersion(CURRENT_STORAGE_SCHEMA_VERSION);
  lastKnownStorageSchemaVersion = CURRENT_STORAGE_SCHEMA_VERSION;
}
```

**Step 2: Update storage.ts**

- Remove: `lastKnownStorageSchemaVersion`, `loadStorageSchemaVersion`, `saveStorageSchemaVersion`, `migrateSettingsToV1`, `normalizeDrillState`, `migrateDrillStateToV1`, `runStorageMigrations`
- Keep: `migrateComprehensionAttemptsToV3` and `parseComprehensionAttempt` (and its helper chain)
- Add imports and registration:

```typescript
import { runStorageMigrations, registerV3Migration } from './storageMigrations';
export { runStorageMigrations };

// Register the V3 migration callback (needs parseComprehensionAttempt which lives here)
registerV3Migration(migrateComprehensionAttemptsToV3);
```

The `registerV3Migration` call executes at module load time, before any `runStorageMigrations` call.

**Step 3: Run tests**

Run: `bun run verify`
Expected: PASS

**Step 4: Commit**

```
git add src/lib/storageMigrations.ts src/lib/storage.ts
git commit -m "refactor: extract storageMigrations.ts from storage.ts"
```

---

## Tasks 6-8: Extract storageSettings.ts, storageTraining.ts, storageComprehension.ts

Now that `runStorageMigrations` lives in `storageMigrations.ts`, split modules can import it without circular dependencies.

### Task 6: storageSettings.ts

Move: `Settings` interface, `DEFAULT_SETTINGS`, parser helpers, `loadSettings`, `saveSettings`.
Imports: `storageKeys`, `wpm`, `storageMigrations`, types.
storage.ts adds: `export { type Settings, ... } from './storageSettings';`

### Task 7: storageTraining.ts

Move: `TrainingHistoryEntry`, `TrainingHistory`, `DrillState`, `trainingKey`, `loadStoredBoolean`, `saveStoredBoolean`, all training load/save functions, `loadDrillState`, `saveDrillState`.
Imports: `storageKeys`, `wpm`, `storageMigrations`.
Note: `normalizeDrillState` is now in `storageMigrations.ts`. `loadDrillState` needs it — import from there, or duplicate the small function. Since `storageMigrations.ts` already has it, export it and import in `storageTraining.ts`.
storage.ts adds re-exports.

### Task 8: storageComprehension.ts

Move: `MAX_COMPREHENSION_ATTEMPTS`, all comprehension validation sets, `parseComprehension*` functions, `loadComprehensionAttempts`, `saveComprehensionAttempts`, `appendComprehensionAttempt`, API key functions, `ComprehensionApiKeyStorageMode`.
Also move `migrateComprehensionAttemptsToV3` here and register the V3 migration from this module instead of storage.ts.
storage.ts adds re-exports.

Each task follows the same pattern: create file, move code, add re-exports, `bun run verify`, commit.

---

## Task 9: Move pure utilities out of App.tsx

**Files:**
- Modify: `src/lib/passageCapture.ts`
- Create: `src/lib/theme.ts`
- Modify: `src/components/App.tsx`

**Step 1: Move `clipPassagePreview` and `captureKindLabel` to passageCapture.ts**

Add to the end of `src/lib/passageCapture.ts`:

```typescript
export function clipPassagePreview(text: string, maxChars: number = 180): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 1)}...`;
}

export function captureKindLabel(captureKind: PassageCaptureKind): string {
  switch (captureKind) {
    case 'sentence': return 'sentence';
    case 'paragraph': return 'paragraph';
    case 'last-lines': return 'lines';
    case 'line':
    default: return 'line';
  }
}
```

Note: `PassageCaptureKind` type import may need to be added. Check if it's already imported in passageCapture.ts.

**Step 2: Create `src/lib/theme.ts`**

```typescript
import type { ThemePreference } from '../types';

export function resolveThemePreference(
  themePreference: ThemePreference,
  systemTheme: 'dark' | 'light',
): 'dark' | 'light' {
  if (themePreference === 'system') return systemTheme;
  return themePreference;
}
```

**Step 3: Update App.tsx**

Remove the three local function definitions. Add imports:
```typescript
import { clipPassagePreview, captureKindLabel } from '../lib/passageCapture';
import { resolveThemePreference } from '../lib/theme';
```

**Step 4: Run tests**

Run: `bun run verify`
Expected: PASS

**Step 5: Commit**

```
git add src/lib/passageCapture.ts src/lib/theme.ts src/components/App.tsx
git commit -m "refactor: move pure utilities out of App.tsx into lib modules"
```

---

## Task 10: Extract comprehensionJson.ts

**Files:**
- Create: `src/lib/comprehensionJson.ts`
- Modify: `src/lib/comprehensionExamPrompts.ts`
- Modify: `src/lib/comprehensionPrompts.ts`

**Step 1: Create `src/lib/comprehensionJson.ts`**

```typescript
export function extractFallbackJsonSnippet(rawResponse: string): string {
  const trimmed = rawResponse.trim();
  if (!trimmed) {
    throw new Error('LLM response was empty');
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  throw new Error('LLM response did not contain JSON');
}

export function parseRawJsonObject(rawResponse: string): Record<string, unknown> {
  const trimmed = rawResponse.trim();
  if (!trimmed) {
    throw new Error('LLM response was empty');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const fallbackText = extractFallbackJsonSnippet(rawResponse);
    try {
      parsed = JSON.parse(fallbackText);
    } catch {
      throw new Error('LLM response JSON was invalid');
    }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('LLM response JSON must be an object');
  }

  return parsed as Record<string, unknown>;
}
```

**Step 2: Update both prompt files**

In `comprehensionExamPrompts.ts`: remove `extractFallbackJsonSnippet` (lines 78-96) and `parseRawJsonObject` (lines 98-122). Add:
```typescript
import { parseRawJsonObject } from './comprehensionJson';
```

In `comprehensionPrompts.ts`: remove `extractFallbackJsonSnippet` (lines 22-40) and `parseRawJsonObject` (lines 161-185). Add:
```typescript
import { parseRawJsonObject } from './comprehensionJson';
```

**Step 3: Run tests**

Run: `bun run verify`
Expected: PASS

**Step 4: Commit**

```
git add src/lib/comprehensionJson.ts src/lib/comprehensionExamPrompts.ts src/lib/comprehensionPrompts.ts
git commit -m "refactor: deduplicate LLM JSON parsing into comprehensionJson.ts"
```

---

## Tasks 11-14: Hook extractions

These are the largest refactors and require careful implementation. Each follows the pattern:
1. Write characterization tests (Task 11)
2. Extract hook, preserving exact behavior
3. Write hook-level tests alongside
4. Verify

### Task 11: Characterization tests for TrainingReader

Expand `trainingFeedback.test.ts` with `planFinishRecallPhase` edge cases (auto-adjust WPM at min/max boundaries, sentence mode transitions). These test the planner functions that the hooks will call.

### Task 12: Extract useTrainingRecall hook

Create `src/hooks/useTrainingRecall.ts`. Move recall + preview state, refs, effects, and callbacks. The hook accepts recall data and config as parameters, returns state and handlers. `finishRecallPhase` stays in TrainingReader as the bridge.

### Task 13: Extract useTrainingDrillState hook

Create `src/hooks/useTrainingDrillState.ts`. Move drill config state, persistence effects, tier validation. Returns drill state and setters.

### Task 14: Extract useComprehensionState hook

Create `src/hooks/useComprehensionState.ts`. Move comprehension/SRS state, adapter memo, init effects. Returns comprehension state bundle.

---

Each hook extraction task follows this template:
1. Create the hook file with moved state/effects
2. Update the component to use the hook
3. Write hook tests
4. `bun run verify`
5. Commit

The exact code for Tasks 12-14 should be written at implementation time based on the current state of the files after Tasks 1-10 are complete, since the earlier refactors will have changed line numbers and import structures.

---

## Summary

| Task | Description | Risk | Dependencies |
|------|-------------|------|-------------|
| 1 | Characterization tests for generationMask | Low | None |
| 2 | Split generationMask.ts | Low | Task 1 |
| 3 | Extract storageKeys.ts | Trivial | None |
| 4 | Move clampWpm to wpm.ts | Low | None |
| 5 | Extract storageMigrations.ts | Medium | Tasks 3, 4 |
| 6 | Extract storageSettings.ts | Low | Task 5 |
| 7 | Extract storageTraining.ts | Low | Task 5 |
| 8 | Extract storageComprehension.ts | Medium | Task 5 |
| 9 | Move App.tsx pure utilities | Trivial | None |
| 10 | Extract comprehensionJson.ts | Low | None |
| 11 | Characterization tests for TrainingReader | Low | None |
| 12 | Extract useTrainingRecall | High | Task 11 |
| 13 | Extract useTrainingDrillState | Medium | Task 11 |
| 14 | Extract useComprehensionState | Medium | Tasks 6, 8 |

Verification after every task: `bun run verify`
