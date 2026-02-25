import { STORAGE_KEYS } from './storageKeys';
import { runStorageMigrations, normalizeDrillState } from './storageMigrations';

/**
 * Per-paragraph training history, keyed by article ID.
 * Each entry stores the most recent score for a paragraph index.
 */
export interface TrainingHistoryEntry {
  score: number;    // 0-1
  wpm: number;
  timestamp: number;
}

export type TrainingHistory = Record<number, TrainingHistoryEntry>;

function trainingKey(articleId: string): string {
  return `speedread_training_${articleId}`;
}

export function loadTrainingHistory(articleId: string): TrainingHistory {
  runStorageMigrations();
  try {
    const data = localStorage.getItem(trainingKey(articleId));
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

export function saveTrainingHistory(articleId: string, history: TrainingHistory): void {
  runStorageMigrations();
  localStorage.setItem(trainingKey(articleId), JSON.stringify(history));
}

function loadStoredBoolean(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return raw === 'true';
  } catch {
    return fallback;
  }
}

function saveStoredBoolean(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Ignore storage failures (private mode, quota).
  }
}

export function loadTrainingSentenceMode(): boolean {
  return loadStoredBoolean(STORAGE_KEYS.trainingSentenceMode, false);
}

export function saveTrainingSentenceMode(enabled: boolean): void {
  saveStoredBoolean(STORAGE_KEYS.trainingSentenceMode, enabled);
}

export function loadTrainingScoreDetails(): boolean {
  return loadStoredBoolean(STORAGE_KEYS.trainingScoreDetails, false);
}

export function saveTrainingScoreDetails(enabled: boolean): void {
  saveStoredBoolean(STORAGE_KEYS.trainingScoreDetails, enabled);
}

export function loadTrainingScaffold(): boolean {
  return loadStoredBoolean(STORAGE_KEYS.trainingScaffold, true);
}

export function saveTrainingScaffold(enabled: boolean): void {
  saveStoredBoolean(STORAGE_KEYS.trainingScaffold, enabled);
}

// --- Random drill persistence ---

export interface DrillState {
  wpm: number;
  rollingScores: number[];
  corpusFamily?: 'wiki' | 'prose';
  tier?: 'easy' | 'medium' | 'hard';
  minWpm?: number;
  maxWpm?: number;
  autoAdjustDifficulty?: boolean;
  // Legacy field kept for backward compatibility with old saved state.
  charLimit?: number;
}

export function loadDrillState(): DrillState | null {
  runStorageMigrations();
  try {
    const data = localStorage.getItem(STORAGE_KEYS.drillState);
    if (!data) return null;
    const parsed = JSON.parse(data) as Partial<DrillState>;
    return normalizeDrillState(parsed);
  } catch {
    return null;
  }
}

export function saveDrillState(state: DrillState): void {
  runStorageMigrations();
  localStorage.setItem(STORAGE_KEYS.drillState, JSON.stringify(state));
}
