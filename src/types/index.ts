export type TokenMode = 'word' | 'phrase' | 'clause';

export interface Chunk {
  text: string;
  wordCount: number;
  orpIndex: number; // character index of the ORP within the chunk
}

export interface Article {
  id: string;
  title: string;
  content: string;
  source: string;
  url?: string;
  addedAt: number;
  readPosition: number; // chunk index
  isRead: boolean;
}

export interface Feed {
  id: string;
  url: string;
  title: string;
  lastFetched: number;
}

export interface ReaderState {
  currentArticle: Article | null;
  chunks: Chunk[];
  currentChunkIndex: number;
  isPlaying: boolean;
  wpm: number;
  mode: TokenMode;
}

export interface AppState {
  articles: Article[];
  feeds: Feed[];
  settings: {
    defaultWpm: number;
    defaultMode: TokenMode;
  };
}
