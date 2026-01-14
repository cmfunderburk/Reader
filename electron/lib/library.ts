import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

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

const SOURCES_FILE = 'library-sources.json'

function getSourcesPath(): string {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, SOURCES_FILE)
}

export function loadSources(): LibrarySource[] {
  try {
    const sourcesPath = getSourcesPath()
    if (fs.existsSync(sourcesPath)) {
      const data = fs.readFileSync(sourcesPath, 'utf-8')
      return JSON.parse(data)
    }
  } catch (err) {
    console.error('Failed to load library sources:', err)
  }
  return []
}

export function saveSources(sources: LibrarySource[]): void {
  try {
    const sourcesPath = getSourcesPath()
    fs.writeFileSync(sourcesPath, JSON.stringify(sources, null, 2))
  } catch (err) {
    console.error('Failed to save library sources:', err)
  }
}

export function getConfiguredSources(): LibrarySource[] {
  return loadSources()
}

export function addSource(source: LibrarySource): void {
  const sources = loadSources()
  // Don't add duplicates
  if (!sources.some((s) => s.path === source.path)) {
    sources.push(source)
    saveSources(sources)
  }
}

export function removeSource(sourcePath: string): void {
  const sources = loadSources()
  const filtered = sources.filter((s) => s.path !== sourcePath)
  saveSources(filtered)
}

export async function scanDirectory(dirPath: string): Promise<LibraryItem[]> {
  const items: LibraryItem[] = []

  async function scanRecursive(currentPath: string): Promise<void> {
    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name)

        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          await scanRecursive(fullPath)
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase()
          if (ext === '.pdf' || ext === '.epub') {
            try {
              const stats = fs.statSync(fullPath)
              items.push({
                name: entry.name,
                path: fullPath,
                type: ext === '.pdf' ? 'pdf' : 'epub',
                size: stats.size,
                modifiedAt: stats.mtimeMs,
              })
            } catch (err) {
              // Skip files we can't stat
              console.warn(`Failed to stat ${fullPath}:`, err)
            }
          }
        }
      }
    } catch (err) {
      console.error(`Failed to scan directory ${currentPath}:`, err)
    }
  }

  await scanRecursive(dirPath)

  // Sort by name
  items.sort((a, b) => a.name.localeCompare(b.name))

  return items
}
