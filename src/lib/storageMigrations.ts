import type { Activity } from '../types';
import type { DrillState } from './storage';
import { MIN_WPM, MAX_WPM, clampWpmFromStorage as clampWpm } from './wpm';
import { STORAGE_KEYS, CURRENT_STORAGE_SCHEMA_VERSION } from './storageKeys';

let lastKnownStorageSchemaVersion: number | null = null;

// --- V3 migration callback (registered by storage.ts to avoid circular imports) ---

let migrateToV3: (() => void) | null = null;

export function registerV3Migration(fn: () => void): void {
  migrateToV3 = fn;
}

// --- Schema version helpers ---

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

// --- V1 migrations ---

function migrateSettingsToV1(): void {
  const raw = localStorage.getItem(STORAGE_KEYS.settings);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown> & {
      defaultWpm?: unknown;
      wpmByActivity?: Partial<Record<Activity, unknown>>;
      lastSession?: { articleId?: string; activity?: string; displayMode?: unknown };
    };

    const legacyDefaultWpm = clampWpm(parsed.defaultWpm, 300 /* DEFAULT_SETTINGS.defaultWpm */);
    const nextWpmByActivity = {
      'paced-reading': clampWpm(parsed.wpmByActivity?.['paced-reading'], legacyDefaultWpm),
      'active-recall': clampWpm(parsed.wpmByActivity?.['active-recall'], legacyDefaultWpm),
      training: clampWpm(parsed.wpmByActivity?.training, legacyDefaultWpm),
      'comprehension-check': clampWpm(parsed.wpmByActivity?.['comprehension-check'], legacyDefaultWpm),
    } satisfies Record<Activity, number>;

    const nextLastSession = parsed.lastSession?.activity
      ? {
          ...parsed.lastSession,
          activity:
            parsed.lastSession.activity === 'speed-reading'
              ? 'paced-reading'
              : parsed.lastSession.activity === 'comprehension'
                ? 'active-recall'
                : parsed.lastSession.activity,
        }
      : undefined;

    const migrated = {
      ...parsed,
      wpmByActivity: nextWpmByActivity,
      defaultWpm: nextWpmByActivity['paced-reading'],
      ...(nextLastSession ? { lastSession: nextLastSession } : {}),
    };

    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(migrated));
  } catch {
    // Keep existing data untouched when migration cannot parse settings.
  }
}

export function normalizeDrillState(parsed: Partial<DrillState>): DrillState {
  const wpm = clampWpm(parsed.wpm, 300 /* DEFAULT_SETTINGS.defaultWpm */);
  const minWpmRaw = parsed.minWpm ?? Math.max(MIN_WPM, wpm - 50);
  const maxWpmRaw = parsed.maxWpm ?? Math.min(MAX_WPM, wpm + 50);
  let minWpm = clampWpm(minWpmRaw, Math.max(MIN_WPM, wpm - 50));
  let maxWpm = clampWpm(maxWpmRaw, Math.min(MAX_WPM, wpm + 50));
  if (minWpm > maxWpm) [minWpm, maxWpm] = [maxWpm, minWpm];
  const rollingScores = Array.isArray(parsed.rollingScores)
    ? parsed.rollingScores.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
    : [];

  return {
    ...parsed,
    wpm,
    minWpm,
    maxWpm,
    rollingScores,
  };
}

function migrateDrillStateToV1(): void {
  const raw = localStorage.getItem(STORAGE_KEYS.drillState);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw) as Partial<DrillState>;
    localStorage.setItem(STORAGE_KEYS.drillState, JSON.stringify(normalizeDrillState(parsed)));
  } catch {
    // Keep existing data untouched when migration cannot parse drill state.
  }
}

// --- Migration runner ---

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

  if (currentVersion < 2) {
    // No-op: comprehension_attempts key didn't exist before V2.
    // New installs and upgrades both start with empty attempts.
  }

  if (currentVersion < 3) {
    migrateToV3?.();
  }

  saveStorageSchemaVersion(CURRENT_STORAGE_SCHEMA_VERSION);
  lastKnownStorageSchemaVersion = CURRENT_STORAGE_SCHEMA_VERSION;
}
