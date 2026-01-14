import * as fs from 'fs'
import * as path from 'path'

interface PdfExtractResult {
  title: string
  content: string
  pageCount: number
}

export async function extractPdfText(filePath: string): Promise<PdfExtractResult> {
  const { PDFParse } = require('pdf-parse')

  const buffer = fs.readFileSync(filePath)
  const uint8Array = new Uint8Array(buffer)
  const parser = new PDFParse(uint8Array)

  await parser.load()

  // Get text content
  const textResult = await parser.getText()
  let content = textResult.text || ''

  // Clean up the text
  content = content
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // Get info for title and page count
  const info = await parser.getInfo()
  const pageCount = info.total || textResult.total || 0

  // Try to get title from metadata, fall back to filename
  let title = info.info?.Title || path.basename(filePath, '.pdf')

  // Clean up title if it's just the filename
  if (title === path.basename(filePath, '.pdf')) {
    title = title
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c: string) => c.toUpperCase())
  }

  await parser.destroy()

  return {
    title,
    content,
    pageCount,
  }
}
