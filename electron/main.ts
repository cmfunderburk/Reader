import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { getConfiguredSources, scanDirectory, addSource, removeSource, loadSources, saveSources, LibrarySource } from './lib/library'
import { extractPdfText } from './lib/pdf'
import { extractEpubText } from './lib/epub'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null

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

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  // Initialize default library sources on first run
  const sources = loadSources()
  if (sources.length === 0) {
    const defaultSources: LibrarySource[] = [
      { name: 'Classics', path: '/home/cmf/Dropbox/Apps/KnOS/knos/reader/classics' },
      { name: 'Articles', path: '/home/cmf/Dropbox/Apps/KnOS/knos/reader/articles' },
      { name: 'References', path: '/home/cmf/Dropbox/Apps/deep-study/WORKING/references' },
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
