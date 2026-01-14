import type { Article, Feed, TokenMode } from '../types';

const STORAGE_KEYS = {
  articles: 'speedread_articles',
  feeds: 'speedread_feeds',
  settings: 'speedread_settings',
} as const;

interface Settings {
  defaultWpm: number;
  defaultMode: TokenMode;
  customCharWidth: number;
}

const DEFAULT_SETTINGS: Settings = {
  defaultWpm: 400,
  defaultMode: 'phrase',
  customCharWidth: 30,
};

/**
 * Load articles from localStorage.
 */
export function loadArticles(): Article[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.articles);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Save articles to localStorage.
 */
export function saveArticles(articles: Article[]): void {
  localStorage.setItem(STORAGE_KEYS.articles, JSON.stringify(articles));
}

/**
 * Load feeds from localStorage.
 */
export function loadFeeds(): Feed[] {
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
  localStorage.setItem(STORAGE_KEYS.feeds, JSON.stringify(feeds));
}

/**
 * Load settings from localStorage.
 */
export function loadSettings(): Settings {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.settings);
    return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save settings to localStorage.
 */
export function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
}

/**
 * Update reading position for an article.
 */
export function updateArticlePosition(articleId: string, position: number): void {
  const articles = loadArticles();
  const index = articles.findIndex(a => a.id === articleId);
  if (index !== -1) {
    articles[index].readPosition = position;
    saveArticles(articles);
  }
}

/**
 * Mark an article as read.
 */
export function markArticleAsRead(articleId: string): void {
  const articles = loadArticles();
  const index = articles.findIndex(a => a.id === articleId);
  if (index !== -1) {
    articles[index].isRead = true;
    saveArticles(articles);
  }
}

/**
 * Generate a unique ID.
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
