import type { Article } from '../types';
import { loadArticles, saveArticles, resetArticleDb } from '../lib/storage';

let idCounter = 0;

/**
 * Create a test article with sensible defaults. Override any field.
 */
export function createTestArticle(overrides: Partial<Article> = {}): Article {
  idCounter++;
  return {
    id: `test-${idCounter}`,
    title: `Test Article ${idCounter}`,
    content: 'The quick brown fox jumps over the lazy dog',
    source: 'test',
    addedAt: Date.now(),
    readPosition: 0,
    isRead: false,
    ...overrides,
  };
}

/**
 * Seed articles into IndexedDB (replaces any existing).
 */
export async function seedArticles(articles: Article[]): Promise<void> {
  await saveArticles(articles);
}

/**
 * Read articles currently in IndexedDB.
 */
export async function getStoredArticles(): Promise<Article[]> {
  return loadArticles();
}

/**
 * Read a single article's readPosition from IndexedDB.
 * Returns undefined if article not found.
 */
export async function getStoredPosition(articleId: string): Promise<number | undefined> {
  const articles = await loadArticles();
  return articles.find(a => a.id === articleId)?.readPosition;
}

/**
 * Read a single article's predictionPosition from IndexedDB.
 * Returns undefined if article not found or field not set.
 */
export async function getStoredPredictionPosition(articleId: string): Promise<number | undefined> {
  const articles = await loadArticles();
  return articles.find(a => a.id === articleId)?.predictionPosition;
}

/**
 * Clear all app storage keys. Call in beforeEach for isolation.
 */
export function clearStorage(): void {
  resetArticleDb();
  indexedDB.deleteDatabase('reader');
  localStorage.removeItem('speedread_schema_version');
  localStorage.removeItem('speedread_articles');
  localStorage.removeItem('speedread_feeds');
  localStorage.removeItem('speedread_settings');
  localStorage.removeItem('speedread_passages');
  localStorage.removeItem('speedread_session_snapshot');
  localStorage.removeItem('speedread_drill_state');
  localStorage.removeItem('speedread_training_sentence');
  localStorage.removeItem('speedread_training_score_details');
  localStorage.removeItem('speedread_training_scaffold');
  localStorage.removeItem('speedread_daily_date');
  localStorage.removeItem('speedread_daily_article_id');
  localStorage.removeItem('speedread_comprehension_attempts');
  localStorage.removeItem('speedread_comprehension_api_key');
  delete window.secureKeys;
}

/**
 * Reset the ID counter. Call in beforeEach for deterministic IDs.
 */
export function resetIdCounter(): void {
  idCounter = 0;
}
