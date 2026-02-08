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
// Corpus cache — loaded lazily per tier, held in memory for sampling
// ---------------------------------------------------------------------------
interface CorpusArticle {
  title: string
  text: string
  domain: string
  fk_grade: number
  words: number
  sentences: number
}

type CorpusTier = 'easy' | 'medium' | 'hard'
const CORPUS_TIERS: CorpusTier[] = ['easy', 'medium', 'hard']

interface TierData {
  articles: CorpusArticle[]
}

const corpusCache = new Map<CorpusTier, TierData>()

function getResourcePath(...segments: string[]): string {
  const base = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, '..')
  return path.join(base, ...segments)
}

function getCorpusDir(): string {
  if (app.isPackaged) {
    return getResourcePath('corpus')
  }
  // Dev: corpus lives in userData (copied there by prepare-corpus scripts)
  return path.join(app.getPath('userData'), 'corpus')
}

function getCorpusPath(tier: CorpusTier): string {
  return path.join(getCorpusDir(), `corpus-${tier}.jsonl`)
}

function ensureCorpusLoaded(tier: CorpusTier): boolean {
  if (corpusCache.has(tier)) return true

  const corpusPath = getCorpusPath(tier)
  if (!fs.existsSync(corpusPath)) return false

  console.log(`Loading ${tier} corpus from ${corpusPath} ...`)
  const start = Date.now()
  const content = fs.readFileSync(corpusPath, 'utf-8')
  const lines = content.trim().split('\n')
  const articles: CorpusArticle[] = []

  for (const line of lines) {
    try {
      const article = JSON.parse(line) as CorpusArticle
      articles.push(article)
    } catch {
      // skip malformed lines
    }
  }

  corpusCache.set(tier, { articles })
  console.log(`Corpus ${tier} loaded: ${articles.length} articles (${Date.now() - start}ms)`)
  return true
}

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

  if (!app.isPackaged) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.control && input.shift && input.key.toLowerCase() === 'i') {
        mainWindow?.webContents.toggleDevTools()
        event.preventDefault()
      }
    })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  // Initialize default library sources on first run, or reset if all paths are stale
  const sources = loadSources()
  const libraryRoot = getResourcePath('library')
  const needsReset = sources.length === 0 ||
    sources.every(s => !fs.existsSync(s.path))
  if (needsReset) {
    const defaultSources: LibrarySource[] = [
      { name: 'Classics', path: path.join(libraryRoot, 'classics') },
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
  const info: Record<string, { available: boolean; totalArticles: number }> = {}
  for (const tier of CORPUS_TIERS) {
    const loaded = ensureCorpusLoaded(tier)
    const data = corpusCache.get(tier)
    info[tier] = {
      available: loaded,
      totalArticles: data?.articles.length ?? 0,
    }
  }
  return info
})

ipcMain.handle('corpus:sampleArticle', (_, tier: CorpusTier) => {
  if (!ensureCorpusLoaded(tier)) return null
  const data = corpusCache.get(tier)
  if (!data || data.articles.length === 0) return null
  return data.articles[Math.floor(Math.random() * data.articles.length)]
})
