import { contextBridge, ipcRenderer } from 'electron'

export interface LibrarySource {
  name: string
  path: string
}

export interface LibraryItem {
  name: string
  path: string
  type: 'pdf' | 'epub'
  size: number
  modifiedAt: number
}

export interface ExtractedContent {
  title: string
  content: string
  pageCount?: number
  chapters?: Array<{ title: string; content: string }>
}

contextBridge.exposeInMainWorld('corpus', {
  getInfo: (): Promise<{ available: boolean; totalChunks: number; totalArticles: number }> =>
    ipcRenderer.invoke('corpus:getInfo'),

  sample: (count: number, minDifficulty?: number): Promise<Array<{ text: string; source: string; domain: string; difficulty: number; words: number; sentences: number }>> =>
    ipcRenderer.invoke('corpus:sample', count, minDifficulty),
})

contextBridge.exposeInMainWorld('library', {
  getSources: (): Promise<LibrarySource[]> =>
    ipcRenderer.invoke('library:getSources'),

  listBooks: (dirPath: string): Promise<LibraryItem[]> =>
    ipcRenderer.invoke('library:listBooks', dirPath),

  openBook: (filePath: string): Promise<ExtractedContent> =>
    ipcRenderer.invoke('library:openBook', filePath),

  addSource: (source: LibrarySource): Promise<void> =>
    ipcRenderer.invoke('library:addSource', source),

  removeSource: (sourcePath: string): Promise<void> =>
    ipcRenderer.invoke('library:removeSource', sourcePath),

  selectDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('library:selectDirectory'),
})
