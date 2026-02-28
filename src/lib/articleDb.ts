import type { Article } from '../types';

const DB_NAME = 'reader';
const STORE_NAME = 'articles';
const DB_VERSION = 1;
const LS_KEY = 'speedread_articles';

let dbPromise: Promise<IDBDatabase> | null = null;
let cachedDb: IDBDatabase | null = null;

function getDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      cachedDb = request.result;
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

export async function loadArticlesFromDb(): Promise<Article[]> {
  const db = await getDb();
  const articles = await getAllArticles(db);

  // Migrate from localStorage on first load (store empty, localStorage has data)
  if (articles.length === 0) {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const legacy: Article[] = JSON.parse(raw);
        if (legacy.length > 0) {
          await putAllArticles(db, legacy);
          localStorage.removeItem(LS_KEY);
          return legacy;
        }
      }
    } catch {
      // Ignore corrupt localStorage data
    }
  }

  return articles;
}

export async function saveArticlesToDb(articles: Article[]): Promise<void> {
  const db = await getDb();
  await putAllArticles(db, articles);
}

function getAllArticles(db: IDBDatabase): Promise<Article[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as Article[]);
    request.onerror = () => reject(request.error);
  });
}

function putAllArticles(db: IDBDatabase, articles: Article[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    for (const article of articles) {
      store.put(article);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Reset cached DB connection — used in tests. */
export function resetArticleDb(): void {
  if (cachedDb) {
    cachedDb.close();
    cachedDb = null;
  }
  dbPromise = null;
}
