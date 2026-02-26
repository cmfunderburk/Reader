import type {
  TokenMode, PredictionLineWidth, PredictionPreviewMode, ThemePreference,
  RampCurve, Activity, DisplayMode, GuidedPacerStyle, GuidedFocusTarget,
  GenerationDifficulty, ComprehensionGeminiModel,
} from '../types';
import { COMPREHENSION_GEMINI_MODELS } from '../types';
import { STORAGE_KEYS } from './storageKeys';
import { clampWpmFromStorage as clampWpm } from './wpm';
import { runStorageMigrations } from './storageMigrations';

export interface Settings {
  defaultWpm: number;
  wpmByActivity: Record<Activity, number>;
  defaultMode: TokenMode;
  rsvpFontSize: number;
  guidedFontSize: number;
  predictionFontSize: number;
  predictionLineWidth: PredictionLineWidth;
  predictionPreviewMode: PredictionPreviewMode;
  predictionPreviewSentenceCount: number;
  comprehensionGeminiModel: ComprehensionGeminiModel;
  themePreference: ThemePreference;
  rampEnabled: boolean;
  rampCurve: RampCurve;
  rampStartPercent: number;
  rampRate: number;
  rampInterval: number;
  rsvpAlternateColors: boolean;
  rsvpShowORP: boolean;
  guidedShowOVP: boolean;
  guidedShowSweep: boolean;
  guidedPacerStyle: GuidedPacerStyle;
  guidedFocusTarget: GuidedFocusTarget;
  guidedMergeShortFunctionWords: boolean;
  guidedLength: number;
  generationDifficulty: GenerationDifficulty;
  generationSweepReveal: boolean;
  lastSession?: { articleId: string; activity: Activity; displayMode: DisplayMode };
}

export const DEFAULT_SETTINGS: Settings = {
  defaultWpm: 300,
  wpmByActivity: {
    'paced-reading': 300,
    'active-recall': 300,
    training: 300,
    'comprehension-check': 300,
  },
  defaultMode: 'word',
  rsvpFontSize: 2.5,
  guidedFontSize: 1.0,
  predictionFontSize: 1.25,
  predictionLineWidth: 'medium',
  predictionPreviewMode: 'sentences',
  predictionPreviewSentenceCount: 2,
  comprehensionGeminiModel: 'gemini-3-flash-preview',
  themePreference: 'dark',
  rampEnabled: false,
  rampCurve: 'linear',
  rampStartPercent: 50,
  rampRate: 25,
  rampInterval: 30,
  rsvpAlternateColors: false,
  rsvpShowORP: true,
  guidedShowOVP: true,
  guidedShowSweep: true,
  guidedPacerStyle: 'sweep',
  guidedFocusTarget: 'fixation',
  guidedMergeShortFunctionWords: false,
  guidedLength: 10,
  generationDifficulty: 'normal',
  generationSweepReveal: true,
};


function parseComprehensionGeminiModel(value: unknown): ComprehensionGeminiModel {
  if (
    typeof value === 'string' &&
    COMPREHENSION_GEMINI_MODELS.includes(value as ComprehensionGeminiModel)
  ) {
    return value as ComprehensionGeminiModel;
  }
  return DEFAULT_SETTINGS.comprehensionGeminiModel;
}

function parseGenerationDifficulty(value: unknown): GenerationDifficulty {
  if (value === 'hard' || value === 'recall') return value;
  return 'normal';
}

function parseGenerationSweepReveal(value: unknown): boolean {
  return typeof value === 'boolean' ? value : DEFAULT_SETTINGS.generationSweepReveal;
}


/**
 * Load settings from localStorage.
 */
export function loadSettings(): Settings {
  runStorageMigrations();
  try {
    const data = localStorage.getItem(STORAGE_KEYS.settings);
    const parsed = data ? JSON.parse(data) : null;
    const settings = parsed ? { ...DEFAULT_SETTINGS, ...parsed } : { ...DEFAULT_SETTINGS };
    const legacyDefaultWpm = clampWpm(settings.defaultWpm, DEFAULT_SETTINGS.defaultWpm);
    const parsedWpmByActivity = parsed?.wpmByActivity as Partial<Record<Activity, number>> | undefined;
    settings.wpmByActivity = {
      'paced-reading': clampWpm(parsedWpmByActivity?.['paced-reading'], legacyDefaultWpm),
      'active-recall': clampWpm(parsedWpmByActivity?.['active-recall'], legacyDefaultWpm),
      training: clampWpm(parsedWpmByActivity?.training, legacyDefaultWpm),
      'comprehension-check': clampWpm(parsedWpmByActivity?.['comprehension-check'], legacyDefaultWpm),
    };
    // Keep legacy field aligned with paced reading for older code paths/migrations.
    settings.defaultWpm = settings.wpmByActivity['paced-reading'];
    // Backfill pacer style from legacy sweep toggle.
    if (!parsed || !('guidedPacerStyle' in parsed)) {
      settings.guidedPacerStyle = settings.guidedShowSweep === false ? 'focus' : 'sweep';
    }
    // Clamp values that may have been saved under old wider ranges
    settings.guidedLength = Math.max(7, Math.min(15, settings.guidedLength));
    settings.predictionPreviewMode = settings.predictionPreviewMode === 'unlimited' ? 'unlimited' : 'sentences';
    settings.predictionPreviewSentenceCount = Math.max(
      1,
      Math.min(10, Math.round(settings.predictionPreviewSentenceCount || 2))
    );
    settings.comprehensionGeminiModel = parseComprehensionGeminiModel(settings.comprehensionGeminiModel);
    settings.generationDifficulty = parseGenerationDifficulty(settings.generationDifficulty);
    settings.generationSweepReveal = parseGenerationSweepReveal(settings.generationSweepReveal);
    settings.themePreference = settings.themePreference === 'light' || settings.themePreference === 'system'
      ? settings.themePreference
      : 'dark';
    // Migrate renamed activity types
    if (settings.lastSession) {
      const act = settings.lastSession.activity as string;
      if (act === 'speed-reading') settings.lastSession.activity = 'paced-reading';
      if (act === 'comprehension') settings.lastSession.activity = 'active-recall';
    }
    return settings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save settings to localStorage.
 */
export function saveSettings(settings: Settings): void {
  runStorageMigrations();
  const normalized: Settings = {
    ...settings,
    wpmByActivity: {
      'paced-reading': clampWpm(settings.wpmByActivity?.['paced-reading'], settings.defaultWpm),
      'active-recall': clampWpm(settings.wpmByActivity?.['active-recall'], settings.defaultWpm),
      training: clampWpm(settings.wpmByActivity?.training, settings.defaultWpm),
      'comprehension-check': clampWpm(settings.wpmByActivity?.['comprehension-check'], settings.defaultWpm),
    },
    defaultWpm: clampWpm(
      settings.wpmByActivity?.['paced-reading'],
      clampWpm(settings.defaultWpm, DEFAULT_SETTINGS.defaultWpm)
    ),
    comprehensionGeminiModel: parseComprehensionGeminiModel(settings.comprehensionGeminiModel),
    generationDifficulty: parseGenerationDifficulty(settings.generationDifficulty),
    generationSweepReveal: parseGenerationSweepReveal(settings.generationSweepReveal),
  };
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(normalized));
}
