import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { getConfiguredSources, scanDirectory, addSource, removeSource, loadSources, saveSources, LibrarySource } from './lib/library'
import { extractPdfText } from './lib/pdf'
import { extractEpubText } from './lib/epub'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null

// ---------------------------------------------------------------------------
// Corpus cache — loaded lazily on first request, held in memory for sampling
// ---------------------------------------------------------------------------
interface CorpusChunk {
  text: string
  source: string
  domain: string
  difficulty: number
  words: number
  sentences: number
}

let corpusChunks: CorpusChunk[] | null = null
let corpusArticleCount = 0

function getCorpusPath(): string {
  return path.join(app.getPath('userData'), 'corpus', 'wikipedia-ga.jsonl')
}

function ensureCorpusLoaded(): boolean {
  if (corpusChunks !== null) return true

  const corpusPath = getCorpusPath()
  if (!fs.existsSync(corpusPath)) return false

  console.log(`Loading corpus from ${corpusPath} ...`)
  const start = Date.now()
  const content = fs.readFileSync(corpusPath, 'utf-8')
  const lines = content.trim().split('\n')
  const sources = new Set<string>()

  corpusChunks = []
  for (const line of lines) {
    try {
      const chunk = JSON.parse(line) as CorpusChunk
      corpusChunks.push(chunk)
      sources.add(chunk.source)
    } catch {
      // skip malformed lines
    }
  }
  corpusArticleCount = sources.size
  console.log(`Corpus loaded: ${corpusChunks.length} chunks from ${corpusArticleCount} articles (${Date.now() - start}ms)`)
  return true
}

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Register Ctrl+Shift+I to toggle dev tools (works in production too)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow?.webContents.toggleDevTools()
      event.preventDefault()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  // Initialize default library sources on first run, or reset if all paths are stale
  const sources = loadSources()
  const libraryRoot = path.join(__dirname, '..', 'library')
  const needsReset = sources.length === 0 ||
    sources.every(s => !fs.existsSync(s.path))
  if (needsReset) {
    const defaultSources: LibrarySource[] = [
      { name: 'Classics', path: path.join(libraryRoot, 'classics') },
      { name: 'Articles', path: path.join(libraryRoot, 'articles') },
      { name: 'References', path: path.join(libraryRoot, 'references') },
    ]
    saveSources(defaultSources)
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// IPC Handlers
ipcMain.handle('library:getSources', () => {
  return getConfiguredSources()
})

ipcMain.handle('library:listBooks', async (_, dirPath: string) => {
  return scanDirectory(dirPath)
})

ipcMain.handle('library:openBook', async (_, filePath: string) => {
  try {
    const ext = path.extname(filePath).toLowerCase()
    console.log(`Opening book: ${filePath} (${ext})`)
    if (ext === '.pdf') {
      const result = await extractPdfText(filePath)
      console.log(`PDF extracted: ${result.title}, ${result.content.length} chars`)
      return result
    } else if (ext === '.epub') {
      const result = await extractEpubText(filePath)
      console.log(`EPUB extracted: ${result.title}, ${result.content.length} chars`)
      return result
    } else if (ext === '.txt') {
      // Pre-processed text files - read directly
      const content = fs.readFileSync(filePath, 'utf-8')
      const title = path.basename(filePath, '.txt').replace(/-/g, ' ')
      console.log(`TXT loaded: ${title}, ${content.length} chars`)
      return { title, content }
    }
    throw new Error(`Unsupported file type: ${ext}`)
  } catch (err) {
    console.error('Error opening book:', err)
    throw err
  }
})

ipcMain.handle('library:addSource', async (_, source: LibrarySource) => {
  addSource(source)
})

ipcMain.handle('library:removeSource', async (_, sourcePath: string) => {
  removeSource(sourcePath)
})

ipcMain.handle('library:selectDirectory', async () => {
  if (!mainWindow) return null

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Library Directory',
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
})

// Corpus IPC handlers
ipcMain.handle('corpus:getInfo', () => {
  const loaded = ensureCorpusLoaded()
  return {
    available: loaded,
    totalChunks: corpusChunks?.length ?? 0,
    totalArticles: corpusArticleCount,
  }
})

ipcMain.handle('corpus:sample', (_, count: number, minDifficulty?: number) => {
  if (!ensureCorpusLoaded() || !corpusChunks || corpusChunks.length === 0) {
    return []
  }

  // Filter by difficulty floor if specified
  const pool = minDifficulty != null && minDifficulty > 0
    ? corpusChunks.filter(c => c.difficulty >= minDifficulty)
    : corpusChunks

  if (pool.length === 0) return []

  // Fisher-Yates sample without replacement (up to count)
  const n = Math.min(count, pool.length)
  const indices = new Set<number>()
  while (indices.size < n) {
    indices.add(Math.floor(Math.random() * pool.length))
  }

  return Array.from(indices).map(i => pool[i])
})
