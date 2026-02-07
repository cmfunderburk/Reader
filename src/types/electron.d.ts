export interface LibrarySource {
  name: string
  path: string
}

export interface LibraryItem {
  name: string
  path: string
  type: 'pdf' | 'epub' | 'txt'
  size: number
  modifiedAt: number
  parentDir?: string       // Immediate parent directory name (for grouping)
  isFrontmatter?: boolean  // Detected as frontmatter file
}

export interface ExtractedContent {
  title: string
  content: string
  pageCount?: number
  chapters?: Array<{ title: string; content: string }>
}

export interface LibraryAPI {
  getSources(): Promise<LibrarySource[]>
  listBooks(dirPath: string): Promise<LibraryItem[]>
  openBook(filePath: string): Promise<ExtractedContent>
  addSource(source: LibrarySource): Promise<void>
  removeSource(sourcePath: string): Promise<void>
  selectDirectory(): Promise<string | null>
}

export interface CorpusChunk {
  text: string
  source: string      // article title
  domain: string
  difficulty: number   // 0–1
  words: number
  sentences: number
}

export interface CorpusInfo {
  available: boolean
  totalChunks: number
  totalArticles: number
}

export interface CorpusAPI {
  getInfo(): Promise<CorpusInfo>
  sample(count: number, minDifficulty?: number): Promise<CorpusChunk[]>
}

declare global {
  interface Window {
    library?: LibraryAPI
    corpus?: CorpusAPI
  }
}
