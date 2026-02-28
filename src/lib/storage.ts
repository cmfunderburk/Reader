import type {
  Article,
  Feed,
  Passage,
  PassageReviewMode,
  PassageReviewState,
  SessionSnapshot,
} from '../types';
import { STORAGE_KEYS } from './storageKeys';
import { runStorageMigrations } from './storageMigrations';
export { runStorageMigrations } from './storageMigrations';
import { loadArticlesFromDb, saveArticlesToDb } from './articleDb';
export { resetArticleDb } from './articleDb';

export { type Settings, DEFAULT_SETTINGS, loadSettings, saveSettings } from './storageSettings';

export {
  type TrainingHistoryEntry, type TrainingHistory, type DrillState,
  loadTrainingHistory, saveTrainingHistory,
  loadTrainingSentenceMode, saveTrainingSentenceMode,
  loadTrainingScoreDetails, saveTrainingScoreDetails,
  loadTrainingScaffold, saveTrainingScaffold,
  loadDrillState, saveDrillState,
} from './storageTraining';

export {
  type ComprehensionApiKeyStorageMode,
  loadComprehensionAttempts, saveComprehensionAttempts, appendComprehensionAttempt,
  loadComprehensionApiKey, saveComprehensionApiKey,
  getComprehensionApiKeyStorageMode, loadPreferredComprehensionApiKey, savePreferredComprehensionApiKey,
} from './storageComprehension';

/**
 * Load articles from IndexedDB (migrates from localStorage on first load).
 */
export async function loadArticles(): Promise<Article[]> {
  runStorageMigrations();
  return loadArticlesFromDb();
}

/**
 * Save articles to IndexedDB.
 */
export async function saveArticles(articles: Article[]): Promise<void> {
  return saveArticlesToDb(articles);
}

/**
 * Load feeds from localStorage.
 */
export function loadFeeds(): Feed[] {
  runStorageMigrations();
  try {
    const data = localStorage.getItem(STORAGE_KEYS.feeds);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Save feeds to localStorage.
 */
export function saveFeeds(feeds: Feed[]): void {
  runStorageMigrations();
  localStorage.setItem(STORAGE_KEYS.feeds, JSON.stringify(feeds));
}

/**
 * Load saved passages from localStorage.
 */
export function loadPassages(): Passage[] {
  runStorageMigrations();
  try {
    const data = localStorage.getItem(STORAGE_KEYS.passages);
    const parsed = data ? JSON.parse(data) as Passage[] : [];
    return parsed
      .map((passage) => ({
        ...passage,
        reviewState: normalizePassageReviewState(passage.reviewState),
        reviewCount: Math.max(0, passage.reviewCount ?? 0),
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

/**
 * Save passages to localStorage.
 */
export function savePassages(passages: Passage[]): void {
  runStorageMigrations();
  localStorage.setItem(STORAGE_KEYS.passages, JSON.stringify(passages));
}

/**
 * Insert or update a single passage.
 */
export function upsertPassage(passage: Passage): void {
  const existing = loadPassages();
  const idx = existing.findIndex((p) => p.id === passage.id);
  if (idx === -1) {
    existing.unshift(passage);
  } else {
    existing[idx] = passage;
  }
  savePassages(existing);
}

/**
 * Update a passage review state.
 */
export function updatePassageReviewState(passageId: string, reviewState: PassageReviewState): void {
  const passages = loadPassages();
  const idx = passages.findIndex((p) => p.id === passageId);
  if (idx === -1) return;
  passages[idx] = {
    ...passages[idx],
    reviewState: normalizePassageReviewState(reviewState),
    updatedAt: Date.now(),
  };
  savePassages(passages);
}

/**
 * Mark a passage review attempt for queue prioritization/analytics.
 */
export function touchPassageReview(passageId: string, mode: PassageReviewMode): void {
  const passages = loadPassages();
  const idx = passages.findIndex((p) => p.id === passageId);
  if (idx === -1) return;
  passages[idx] = {
    ...passages[idx],
    reviewCount: passages[idx].reviewCount + 1,
    lastReviewedAt: Date.now(),
    lastReviewMode: mode,
    updatedAt: Date.now(),
  };
  savePassages(passages);
}

/**
 * Load session continuity snapshot.
 */
export function loadSessionSnapshot(): SessionSnapshot | null {
  runStorageMigrations();
  try {
    const data = localStorage.getItem(STORAGE_KEYS.sessionSnapshot);
    return data ? JSON.parse(data) as SessionSnapshot : null;
  } catch {
    return null;
  }
}

/**
 * Save session continuity snapshot.
 */
export function saveSessionSnapshot(snapshot: SessionSnapshot): void {
  runStorageMigrations();
  localStorage.setItem(STORAGE_KEYS.sessionSnapshot, JSON.stringify(snapshot));
}

/**
 * Clear saved session continuity snapshot.
 */
export function clearSessionSnapshot(): void {
  runStorageMigrations();
  localStorage.removeItem(STORAGE_KEYS.sessionSnapshot);
}

/**
 * Update reading position for an article.
 */
export async function updateArticlePosition(articleId: string, position: number): Promise<void> {
  await updateArticleInStorage(articleId, (article) => (
    article.readPosition === position
      ? article
      : { ...article, readPosition: position }
  ));
}

/**
 * Update prediction position for an article (separate from RSVP/guided position).
 */
export async function updateArticlePredictionPosition(articleId: string, position: number): Promise<void> {
  await updateArticleInStorage(articleId, (article) => (
    article.predictionPosition === position
      ? article
      : { ...article, predictionPosition: position }
  ));
}

/**
 * Mark an article as read.
 */
export async function markArticleAsRead(articleId: string): Promise<void> {
  await updateArticleInStorage(articleId, (article) => (
    article.isRead
      ? article
      : { ...article, isRead: true }
  ));
}

async function updateArticleInStorage(articleId: string, updater: (article: Article) => Article): Promise<void> {
  const articles = await loadArticles();
  const index = articles.findIndex((article) => article.id === articleId);
  if (index === -1) return;

  const current = articles[index];
  const updated = updater(current);
  if (updated === current) return;

  articles[index] = updated;
  await saveArticles(articles);
}

// --- Daily article persistence ---

export function loadDailyInfo(): { date: string; articleId: string } | null {
  runStorageMigrations();
  try {
    const date = localStorage.getItem(STORAGE_KEYS.dailyDate);
    const articleId = localStorage.getItem(STORAGE_KEYS.dailyArticleId);
    return date && articleId ? { date, articleId } : null;
  } catch {
    return null;
  }
}

export function saveDailyInfo(date: string, articleId: string): void {
  runStorageMigrations();
  localStorage.setItem(STORAGE_KEYS.dailyDate, date);
  localStorage.setItem(STORAGE_KEYS.dailyArticleId, articleId);
}

/**
 * Generate a unique ID.
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function normalizePassageReviewState(state: PassageReviewState | string | undefined): PassageReviewState {
  switch (state) {
    case 'hard':
    case 'easy':
    case 'done':
      return state;
    default:
      return 'new';
  }
}
