import type {
  ComprehensionAttempt, ComprehensionQuestionResult, ComprehensionSourceRef,
  ComprehensionRunMode, ComprehensionExamPreset, ComprehensionExamSection,
  ComprehensionItemMode,
  ComprehensionScheduleMetadata, ComprehensionKeyPoint, ComprehensionKeyPointResult,
} from '../types';
import { STORAGE_KEYS } from './storageKeys';
import { runStorageMigrations, registerV3Migration } from './storageMigrations';

const MAX_COMPREHENSION_ATTEMPTS = 200;

const COMPREHENSION_DIMENSIONS = new Set(['factual', 'inference', 'structural', 'evaluative']);
const COMPREHENSION_FORMATS = new Set(['multiple-choice', 'true-false', 'short-answer', 'essay']);
const COMPREHENSION_SECTIONS = new Set(['recall', 'interpretation', 'synthesis']);
const COMPREHENSION_EXAM_PRESETS: Set<ComprehensionExamPreset> = new Set(['quiz', 'midterm', 'final']);
const COMPREHENSION_RUN_MODES: Set<ComprehensionRunMode> = new Set(['quick-check', 'exam']);
const COMPREHENSION_ITEM_MODES: Set<ComprehensionItemMode> = new Set([
  'retrieval-check',
  'elaboration',
  'self-explanation',
  'argument-map',
  'synthesis',
  'spaced-recheck',
  'interleaved-drill',
]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isComprehensionEntryPoint(value: unknown): value is ComprehensionAttempt['entryPoint'] {
  return value === 'post-reading' || value === 'launcher';
}

function warnComprehensionSanitization(context: string, field: string): void {
  if (!import.meta.env.DEV || import.meta.env.MODE === 'test') return;
  console.warn(`[storage] sanitized comprehension ${context} field "${field}"`);
}

function parseComprehensionSourceRef(value: unknown, attemptId: string): ComprehensionSourceRef | null {
  if (typeof value !== 'object' || value === null) {
    warnComprehensionSanitization(`attempt ${attemptId}`, 'sourceArticles[]');
    return null;
  }
  const ref = value as Record<string, unknown>;
  if (typeof ref.articleId !== 'string' || ref.articleId.length === 0) {
    warnComprehensionSanitization(`attempt ${attemptId}`, 'sourceArticles[].articleId');
    return null;
  }
  if (typeof ref.title !== 'string' || ref.title.length === 0) {
    warnComprehensionSanitization(`attempt ${attemptId}`, 'sourceArticles[].title');
    return null;
  }

  const parsed: ComprehensionSourceRef = {
    articleId: ref.articleId,
    title: ref.title,
  };
  if (ref.group !== undefined) {
    if (typeof ref.group === 'string') {
      parsed.group = ref.group;
    } else {
      warnComprehensionSanitization(`attempt ${attemptId}`, 'sourceArticles[].group');
    }
  }
  return parsed;
}

function parseComprehensionKeyPoint(value: unknown, questionId: string): ComprehensionKeyPoint | null {
  if (typeof value !== 'object' || value === null) {
    warnComprehensionSanitization(`question ${questionId}`, 'keyPoints[]');
    return null;
  }
  const obj = value as Record<string, unknown>;
  if (typeof obj.text !== 'string' || obj.text.length === 0) {
    warnComprehensionSanitization(`question ${questionId}`, 'keyPoints[].text');
    return null;
  }

  const parsed: ComprehensionKeyPoint = { text: obj.text };
  if (obj.id !== undefined) {
    if (typeof obj.id === 'string') {
      parsed.id = obj.id;
    } else {
      warnComprehensionSanitization(`question ${questionId}`, 'keyPoints[].id');
    }
  }
  if (obj.weight !== undefined) {
    if (isFiniteNumber(obj.weight) && obj.weight >= 0) {
      parsed.weight = obj.weight;
    } else {
      warnComprehensionSanitization(`question ${questionId}`, 'keyPoints[].weight');
    }
  }

  return parsed;
}

function parseComprehensionKeyPointResult(
  value: unknown,
  questionId: string
): ComprehensionKeyPointResult | null {
  if (typeof value !== 'object' || value === null) {
    warnComprehensionSanitization(`question ${questionId}`, 'keyPointResults[]');
    return null;
  }

  const obj = value as Record<string, unknown>;
  if (typeof obj.keyPoint !== 'string' || obj.keyPoint.trim().length === 0) {
    warnComprehensionSanitization(`question ${questionId}`, 'keyPointResults[].keyPoint');
    return null;
  }
  if (typeof obj.hit !== 'boolean') {
    warnComprehensionSanitization(`question ${questionId}`, 'keyPointResults[].hit');
    return null;
  }

  const result: ComprehensionKeyPointResult = {
    keyPoint: obj.keyPoint.trim(),
    hit: obj.hit,
  };

  if (obj.evidence !== undefined) {
    if (typeof obj.evidence === 'string' && obj.evidence.trim().length > 0) {
      result.evidence = obj.evidence.trim();
    } else {
      warnComprehensionSanitization(`question ${questionId}`, 'keyPointResults[].evidence');
    }
  }
  if (obj.weight !== undefined) {
    if (isFiniteNumber(obj.weight) && obj.weight >= 0) {
      result.weight = obj.weight;
    } else {
      warnComprehensionSanitization(`question ${questionId}`, 'keyPointResults[].weight');
    }
  }

  return result;
}

function parseComprehensionScheduleMetadata(
  value: unknown,
  questionId: string,
): ComprehensionScheduleMetadata | null {
  if (typeof value !== 'object' || value === null) {
    warnComprehensionSanitization(`question ${questionId}`, 'schedule');
    return null;
  }
  const obj = value as Record<string, unknown>;
  const parsed: ComprehensionScheduleMetadata = {};

  if (obj.nextDueAt !== undefined) {
    if (isFiniteNumber(obj.nextDueAt)) parsed.nextDueAt = obj.nextDueAt;
    else warnComprehensionSanitization(`question ${questionId}`, 'schedule.nextDueAt');
  }
  if (obj.lastSeenAt !== undefined) {
    if (isFiniteNumber(obj.lastSeenAt)) parsed.lastSeenAt = obj.lastSeenAt;
    else warnComprehensionSanitization(`question ${questionId}`, 'schedule.lastSeenAt');
  }
  if (obj.intervalDays !== undefined) {
    if (isFiniteNumber(obj.intervalDays) && obj.intervalDays >= 0) parsed.intervalDays = obj.intervalDays;
    else warnComprehensionSanitization(`question ${questionId}`, 'schedule.intervalDays');
  }
  if (obj.stability !== undefined) {
    if (isFiniteNumber(obj.stability) && obj.stability >= 0) parsed.stability = obj.stability;
    else warnComprehensionSanitization(`question ${questionId}`, 'schedule.stability');
  }
  if (obj.lapseCount !== undefined) {
    if (isFiniteNumber(obj.lapseCount) && Number.isInteger(obj.lapseCount) && obj.lapseCount >= 0) {
      parsed.lapseCount = obj.lapseCount;
    } else {
      warnComprehensionSanitization(`question ${questionId}`, 'schedule.lapseCount');
    }
  }

  return Object.keys(parsed).length > 0 ? parsed : null;
}

function parseComprehensionQuestionResult(value: unknown): ComprehensionQuestionResult | null {
  if (typeof value !== 'object' || value === null) return null;
  const obj = value as Record<string, unknown>;
  if (!(
    typeof obj.id === 'string' &&
    typeof obj.prompt === 'string' &&
    typeof obj.userAnswer === 'string' &&
    typeof obj.modelAnswer === 'string' &&
    typeof obj.feedback === 'string' &&
    typeof obj.dimension === 'string' &&
    COMPREHENSION_DIMENSIONS.has(obj.dimension) &&
    typeof obj.format === 'string' &&
    COMPREHENSION_FORMATS.has(obj.format) &&
    isFiniteNumber(obj.score) &&
    obj.score >= 0 &&
    obj.score <= 3
  )) {
    return null;
  }

  const question: ComprehensionQuestionResult = {
    id: obj.id,
    prompt: obj.prompt,
    userAnswer: obj.userAnswer,
    modelAnswer: obj.modelAnswer,
    feedback: obj.feedback,
    dimension: obj.dimension as ComprehensionQuestionResult['dimension'],
    format: obj.format as ComprehensionQuestionResult['format'],
    score: obj.score,
  };

  if (obj.section !== undefined) {
    if (
      typeof obj.section === 'string'
      && COMPREHENSION_SECTIONS.has(obj.section as ComprehensionExamSection)
    ) {
      question.section = obj.section as ComprehensionExamSection;
    } else {
      warnComprehensionSanitization(`question ${question.id}`, 'section');
    }
  }
  if (obj.sourceArticleId !== undefined) {
    if (typeof obj.sourceArticleId === 'string') {
      question.sourceArticleId = obj.sourceArticleId;
    } else {
      warnComprehensionSanitization(`question ${question.id}`, 'sourceArticleId');
    }
  }
  if (obj.correct !== undefined) {
    if (typeof obj.correct === 'boolean') {
      question.correct = obj.correct;
    } else {
      warnComprehensionSanitization(`question ${question.id}`, 'correct');
    }
  }
  if (obj.mode !== undefined) {
    if (
      typeof obj.mode === 'string'
      && COMPREHENSION_ITEM_MODES.has(obj.mode as ComprehensionItemMode)
    ) {
      question.mode = obj.mode as ComprehensionItemMode;
    } else {
      warnComprehensionSanitization(`question ${question.id}`, 'mode');
    }
  }
  if (obj.keyPoints !== undefined) {
    if (Array.isArray(obj.keyPoints)) {
      const keyPoints = obj.keyPoints
        .map((item) => parseComprehensionKeyPoint(item, question.id))
        .filter((item): item is ComprehensionKeyPoint => item !== null);
      if (keyPoints.length > 0 || obj.keyPoints.length === 0) {
        question.keyPoints = keyPoints;
      }
    } else {
      warnComprehensionSanitization(`question ${question.id}`, 'keyPoints');
    }
  }
  if (obj.targetLatencySec !== undefined) {
    if (isFiniteNumber(obj.targetLatencySec) && obj.targetLatencySec > 0) {
      question.targetLatencySec = obj.targetLatencySec;
    } else {
      warnComprehensionSanitization(`question ${question.id}`, 'targetLatencySec');
    }
  }
  if (obj.confidence !== undefined) {
    if (
      isFiniteNumber(obj.confidence)
      && Number.isInteger(obj.confidence)
      && obj.confidence >= 1
      && obj.confidence <= 5
    ) {
      question.confidence = obj.confidence as ComprehensionQuestionResult['confidence'];
    } else {
      warnComprehensionSanitization(`question ${question.id}`, 'confidence');
    }
  }
  if (obj.withheld !== undefined) {
    if (typeof obj.withheld === 'boolean') {
      question.withheld = obj.withheld;
    } else {
      warnComprehensionSanitization(`question ${question.id}`, 'withheld');
    }
  }
  if (obj.hintsUsed !== undefined) {
    if (Array.isArray(obj.hintsUsed)) {
      const hints = obj.hintsUsed
        .filter((hint): hint is string => typeof hint === 'string')
        .map((hint) => hint.trim())
        .filter((hint) => hint.length > 0);
      if (hints.length > 0 || obj.hintsUsed.length === 0) {
        question.hintsUsed = hints;
      } else {
        warnComprehensionSanitization(`question ${question.id}`, 'hintsUsed');
      }
    } else {
      warnComprehensionSanitization(`question ${question.id}`, 'hintsUsed');
    }
  }
  if (obj.timeToAnswerMs !== undefined) {
    if (isFiniteNumber(obj.timeToAnswerMs) && obj.timeToAnswerMs >= 0) {
      question.timeToAnswerMs = obj.timeToAnswerMs;
    } else {
      warnComprehensionSanitization(`question ${question.id}`, 'timeToAnswerMs');
    }
  }
  if (obj.schedule !== undefined) {
    const schedule = parseComprehensionScheduleMetadata(obj.schedule, question.id);
    if (schedule) question.schedule = schedule;
  }
  if (obj.keyPointResults !== undefined) {
    if (Array.isArray(obj.keyPointResults)) {
      const keyPointResults = obj.keyPointResults
        .map((item) => parseComprehensionKeyPointResult(item, question.id))
        .filter((item): item is ComprehensionKeyPointResult => item !== null);
      if (keyPointResults.length > 0 || obj.keyPointResults.length === 0) {
        question.keyPointResults = keyPointResults;
      }
    } else {
      warnComprehensionSanitization(`question ${question.id}`, 'keyPointResults');
    }
  }

  return question;
}

function parseComprehensionAttempt(value: unknown): ComprehensionAttempt | null {
  if (typeof value !== 'object' || value === null) return null;
  const obj = value as Record<string, unknown>;
  if (
    !(
      typeof obj.id === 'string' &&
      typeof obj.articleId === 'string' &&
      typeof obj.articleTitle === 'string' &&
      isComprehensionEntryPoint(obj.entryPoint) &&
      Array.isArray(obj.questions) &&
      isFiniteNumber(obj.overallScore) &&
      obj.overallScore >= 0 &&
      obj.overallScore <= 100 &&
      isFiniteNumber(obj.createdAt) &&
      isFiniteNumber(obj.durationMs) &&
      obj.durationMs >= 0
    )
  ) {
    return null;
  }

  const questions = obj.questions
    .map(parseComprehensionQuestionResult)
    .filter((question): question is ComprehensionQuestionResult => question !== null);
  if (questions.length !== obj.questions.length) {
    return null;
  }

  const attempt: ComprehensionAttempt = {
    id: obj.id,
    articleId: obj.articleId,
    articleTitle: obj.articleTitle,
    entryPoint: obj.entryPoint,
    questions,
    overallScore: obj.overallScore,
    createdAt: obj.createdAt,
    durationMs: obj.durationMs,
  };

  if (obj.runMode !== undefined) {
    if (typeof obj.runMode === 'string' && COMPREHENSION_RUN_MODES.has(obj.runMode as ComprehensionRunMode)) {
      attempt.runMode = obj.runMode as ComprehensionRunMode;
    } else {
      warnComprehensionSanitization(`attempt ${attempt.id}`, 'runMode');
    }
  }
  if (obj.examPreset !== undefined) {
    if (
      typeof obj.examPreset === 'string'
      && COMPREHENSION_EXAM_PRESETS.has(obj.examPreset as ComprehensionExamPreset)
    ) {
      attempt.examPreset = obj.examPreset as ComprehensionExamPreset;
    } else {
      warnComprehensionSanitization(`attempt ${attempt.id}`, 'examPreset');
    }
  }
  if (obj.sourceArticles !== undefined) {
    if (Array.isArray(obj.sourceArticles)) {
      const sourceArticles = obj.sourceArticles
        .map((source) => parseComprehensionSourceRef(source, attempt.id))
        .filter((source): source is ComprehensionSourceRef => source !== null);
      if (sourceArticles.length > 0 || obj.sourceArticles.length === 0) {
        attempt.sourceArticles = sourceArticles;
      }
    } else {
      warnComprehensionSanitization(`attempt ${attempt.id}`, 'sourceArticles');
    }
  }
  if (obj.difficultyTarget !== undefined) {
    if (obj.difficultyTarget === 'standard' || obj.difficultyTarget === 'challenging') {
      attempt.difficultyTarget = obj.difficultyTarget;
    } else {
      warnComprehensionSanitization(`attempt ${attempt.id}`, 'difficultyTarget');
    }
  }
  if (obj.openBookSynthesis !== undefined) {
    if (typeof obj.openBookSynthesis === 'boolean') {
      attempt.openBookSynthesis = obj.openBookSynthesis;
    } else {
      warnComprehensionSanitization(`attempt ${attempt.id}`, 'openBookSynthesis');
    }
  }

  return attempt;
}

function migrateComprehensionAttemptsToV3(): void {
  const raw = localStorage.getItem(STORAGE_KEYS.comprehensionAttempts);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      localStorage.removeItem(STORAGE_KEYS.comprehensionAttempts);
      return;
    }
    const migrated = parsed
      .map(parseComprehensionAttempt)
      .filter((attempt): attempt is ComprehensionAttempt => attempt !== null)
      .slice(0, MAX_COMPREHENSION_ATTEMPTS);
    localStorage.setItem(STORAGE_KEYS.comprehensionAttempts, JSON.stringify(migrated));
  } catch {
    localStorage.removeItem(STORAGE_KEYS.comprehensionAttempts);
  }
}

registerV3Migration(migrateComprehensionAttemptsToV3);

export function loadComprehensionAttempts(): ComprehensionAttempt[] {
  runStorageMigrations();
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.comprehensionAttempts);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parseComprehensionAttempt)
      .filter((attempt): attempt is ComprehensionAttempt => attempt !== null)
      .slice(0, MAX_COMPREHENSION_ATTEMPTS);
  } catch {
    return [];
  }
}

export function saveComprehensionAttempts(attempts: ComprehensionAttempt[]): void {
  runStorageMigrations();
  localStorage.setItem(
    STORAGE_KEYS.comprehensionAttempts,
    JSON.stringify(attempts.slice(0, MAX_COMPREHENSION_ATTEMPTS))
  );
}

export function appendComprehensionAttempt(attempt: ComprehensionAttempt): void {
  const existing = loadComprehensionAttempts();
  saveComprehensionAttempts([attempt, ...existing]);
}

export function loadComprehensionApiKey(): string | null {
  runStorageMigrations();
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.comprehensionApiKey);
    if (!raw) return null;
    const normalized = raw.trim();
    return normalized.length > 0 ? normalized : null;
  } catch {
    return null;
  }
}

export function saveComprehensionApiKey(apiKey: string | null): void {
  runStorageMigrations();
  const normalized = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (normalized.length === 0) {
    localStorage.removeItem(STORAGE_KEYS.comprehensionApiKey);
    return;
  }
  localStorage.setItem(STORAGE_KEYS.comprehensionApiKey, normalized);
}

const COMPREHENSION_API_KEY_ID = 'comprehension-gemini' as const;

export type ComprehensionApiKeyStorageMode = 'secure' | 'local' | 'unavailable';

function getSecureKeyBridge() {
  if (typeof window === 'undefined') return null;
  return window.secureKeys ?? null;
}

export async function getComprehensionApiKeyStorageMode(): Promise<ComprehensionApiKeyStorageMode> {
  const bridge = getSecureKeyBridge();
  if (!bridge) return 'local';

  try {
    return (await bridge.isAvailable()) ? 'secure' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export async function loadPreferredComprehensionApiKey(): Promise<string | null> {
  const bridge = getSecureKeyBridge();
  if (!bridge) {
    return loadComprehensionApiKey();
  }

  let available = false;
  try {
    available = await bridge.isAvailable();
  } catch {
    return loadComprehensionApiKey();
  }
  if (!available) {
    return loadComprehensionApiKey();
  }

  const secureValue = await bridge.get(COMPREHENSION_API_KEY_ID);
  if (secureValue && secureValue.trim().length > 0) {
    // Clear legacy local key when secure key is present.
    saveComprehensionApiKey(null);
    return secureValue.trim();
  }

  // One-time migration from legacy localStorage key to secure storage.
  const legacyValue = loadComprehensionApiKey();
  if (legacyValue) {
    await bridge.set(COMPREHENSION_API_KEY_ID, legacyValue);
    saveComprehensionApiKey(null);
    return legacyValue;
  }

  return null;
}

export async function savePreferredComprehensionApiKey(apiKey: string | null): Promise<void> {
  const normalized = typeof apiKey === 'string' ? apiKey.trim() : '';
  const bridge = getSecureKeyBridge();
  if (!bridge) {
    saveComprehensionApiKey(normalized || null);
    return;
  }

  let available = false;
  try {
    available = await bridge.isAvailable();
  } catch {
    saveComprehensionApiKey(normalized || null);
    return;
  }
  if (!available) {
    // Fallback for Linux sessions where safeStorage/keyring is unavailable.
    saveComprehensionApiKey(normalized || null);
    return;
  }

  await bridge.set(COMPREHENSION_API_KEY_ID, normalized || null);
  // Ensure no stale insecure value remains.
  saveComprehensionApiKey(null);
}
