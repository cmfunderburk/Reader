// Display mode: how text is presented
export type DisplayMode = 'rsvp' | 'saccade';

// Token/chunk mode: how text is chunked
export type TokenMode = 'word' | 'phrase' | 'clause' | 'custom';

// Character width targets for each mode (excludes word which shows one word at a time)
export const MODE_CHAR_WIDTHS: Record<Exclude<TokenMode, 'word'>, number> = {
  phrase: 10,
  clause: 40,
  custom: 30, // default for custom, overridden by user setting
};

export type SaccadeLineType = 'body' | 'heading' | 'blank';

export interface SaccadeLine {
  text: string;
  type: SaccadeLineType;
  level?: number;  // 1-6 for headings
}

export interface SaccadePage {
  lines: SaccadeLine[];
}

export interface SaccadePosition {
  pageIndex: number;
  lineIndex: number;
  startChar: number;
  endChar: number;
}

export interface Chunk {
  text: string;
  wordCount: number;
  orpIndex: number; // character index of the ORP within the chunk
  saccade?: SaccadePosition; // present only in saccade mode
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
  customCharWidth: number;
}

export interface AppState {
  articles: Article[];
  feeds: Feed[];
  settings: {
    defaultWpm: number;
    defaultMode: TokenMode;
    customCharWidth: number;
  };
}
