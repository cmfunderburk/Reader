import type { Chunk, SaccadePage, TokenMode } from '../types';
import { MODE_CHAR_WIDTHS } from '../types';
import { calculateORP } from './tokenizer';

export const SACCADE_LINE_WIDTH = 95;
export const SACCADE_LINES_PER_PAGE = 10;

// Major punctuation that always ends a chunk
const MAJOR_PUNCTUATION = /[.!?;]/;
// Minor punctuation that can end a chunk
const MINOR_PUNCTUATION = /[,:\-—–]/;

/**
 * Normalize text by ensuring spaces after sentence-ending punctuation.
 */
function normalizeText(text: string): string {
  return text.replace(/([a-z])([.!?])([A-Z])/g, '$1$2 $3');
}

/**
 * Flow text into fixed-width lines using word wrapping.
 * Respects paragraph breaks (double newlines become blank lines).
 */
export function flowTextIntoLines(text: string, lineWidth: number): string[] {
  const normalized = normalizeText(text);

  // Split into paragraphs
  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map(p => p.replace(/\n/g, ' ').trim())
    .filter(p => p.length > 0);

  const lines: string[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i];
    const words = paragraph.split(/\s+/).filter(w => w.length > 0);

    let currentLine = '';

    for (const word of words) {
      const wouldBe = currentLine.length === 0
        ? word
        : currentLine + ' ' + word;

      if (wouldBe.length <= lineWidth) {
        currentLine = wouldBe;
      } else {
        // Line is full, push it and start new line
        if (currentLine.length > 0) {
          lines.push(currentLine);
        }
        // Handle words longer than line width
        if (word.length > lineWidth) {
          // Just put it on its own line (rare edge case)
          lines.push(word);
          currentLine = '';
        } else {
          currentLine = word;
        }
      }
    }

    // Push remaining content
    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    // Add blank line between paragraphs (not after last)
    if (i < paragraphs.length - 1) {
      lines.push('');
    }
  }

  return lines;
}

/**
 * Group lines into pages.
 */
export function groupIntoPages(lines: string[], linesPerPage: number): SaccadePage[] {
  const pages: SaccadePage[] = [];

  for (let i = 0; i < lines.length; i += linesPerPage) {
    pages.push({
      lines: lines.slice(i, i + linesPerPage),
    });
  }

  return pages;
}

/**
 * Check if a word ends with major punctuation.
 */
function endsWithMajorPunctuation(word: string): boolean {
  return MAJOR_PUNCTUATION.test(word[word.length - 1]);
}

/**
 * Check if a word ends with minor punctuation.
 */
function endsWithMinorPunctuation(word: string): boolean {
  return MINOR_PUNCTUATION.test(word[word.length - 1]);
}

/**
 * Tokenize a single line into word-by-word chunks.
 */
function tokenizeLineWordMode(
  line: string,
  lineIndex: number,
  pageIndex: number
): Chunk[] {
  if (line.trim().length === 0) {
    return [];
  }

  const chunks: Chunk[] = [];

  // Match words with their positions
  const wordRegex = /\S+/g;
  let match;

  while ((match = wordRegex.exec(line)) !== null) {
    const word = match[0];
    const startChar = match.index;
    const endChar = startChar + word.length;

    chunks.push({
      text: word,
      wordCount: 1,
      orpIndex: calculateORP(word),
      saccade: {
        pageIndex,
        lineIndex,
        startChar,
        endChar,
      },
    });
  }

  return chunks;
}

/**
 * Tokenize a single line into chunks with position metadata.
 */
function tokenizeLineByCharWidth(
  line: string,
  lineIndex: number,
  pageIndex: number,
  charWidth: number
): Chunk[] {
  // Skip empty lines (paragraph breaks)
  if (line.trim().length === 0) {
    return [];
  }

  const words = line.split(/\s+/).filter(w => w.length > 0);
  const chunks: Chunk[] = [];

  let currentWords: string[] = [];
  let currentStartChar = 0;
  let currentLength = 0;

  // Track position within the original line
  let linePos = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];

    // Find where this word starts in the original line
    const wordStart = line.indexOf(word, linePos);
    if (i === 0) {
      currentStartChar = wordStart;
    }

    const wouldBeLength = currentLength + (currentWords.length > 0 ? 1 : 0) + word.length;

    // If adding this word exceeds max and we have content, flush first
    if (wouldBeLength > charWidth && currentWords.length > 0) {
      const chunkText = currentWords.join(' ');
      const endChar = currentStartChar + chunkText.length;

      chunks.push({
        text: chunkText,
        wordCount: currentWords.length,
        orpIndex: calculateORP(chunkText),
        saccade: {
          pageIndex,
          lineIndex,
          startChar: currentStartChar,
          endChar,
        },
      });

      currentWords = [];
      currentLength = 0;
      currentStartChar = wordStart;
    }

    // Add word to current chunk
    currentWords.push(word);
    currentLength = currentWords.join(' ').length;
    linePos = wordStart + word.length;

    // Check for punctuation-based breaks
    const hitMajorPunct = endsWithMajorPunctuation(word);
    const hitMinorPunct = endsWithMinorPunctuation(word);
    const atGoodBreakPoint = currentLength >= charWidth * 0.6;

    // Break on major punctuation, or minor punctuation if past 60% of target
    if (hitMajorPunct || (hitMinorPunct && atGoodBreakPoint)) {
      const chunkText = currentWords.join(' ');
      const endChar = currentStartChar + chunkText.length;

      chunks.push({
        text: chunkText,
        wordCount: currentWords.length,
        orpIndex: calculateORP(chunkText),
        saccade: {
          pageIndex,
          lineIndex,
          startChar: currentStartChar,
          endChar,
        },
      });

      currentWords = [];
      currentLength = 0;
      // Next chunk starts after the space following this word
      currentStartChar = linePos + 1;
    }
  }

  // Flush remaining words
  if (currentWords.length > 0) {
    const chunkText = currentWords.join(' ');
    const endChar = currentStartChar + chunkText.length;

    chunks.push({
      text: chunkText,
      wordCount: currentWords.length,
      orpIndex: calculateORP(chunkText),
      saccade: {
        pageIndex,
        lineIndex,
        startChar: currentStartChar,
        endChar,
      },
    });
  }

  return chunks;
}

/**
 * Tokenize a line based on mode.
 */
function tokenizeLine(
  line: string,
  lineIndex: number,
  pageIndex: number,
  mode: TokenMode,
  customCharWidth?: number
): Chunk[] {
  if (mode === 'word') {
    return tokenizeLineWordMode(line, lineIndex, pageIndex);
  }

  const charWidth = mode === 'custom'
    ? (customCharWidth ?? MODE_CHAR_WIDTHS.custom)
    : MODE_CHAR_WIDTHS[mode];

  return tokenizeLineByCharWidth(line, lineIndex, pageIndex, charWidth);
}

/**
 * Tokenize text for saccade mode.
 * Returns both the pages (for display) and a flat array of chunks (for playback).
 *
 * @param text - The article content
 * @param chunkMode - Token mode for chunking (word/phrase/clause/custom)
 * @param customCharWidth - Custom character width (only used when chunkMode is 'custom')
 */
export function tokenizeSaccade(
  text: string,
  chunkMode: TokenMode = 'phrase',
  customCharWidth?: number
): { pages: SaccadePage[]; chunks: Chunk[] } {
  const lines = flowTextIntoLines(text, SACCADE_LINE_WIDTH);
  const pages = groupIntoPages(lines, SACCADE_LINES_PER_PAGE);

  const allChunks: Chunk[] = [];

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex];

    for (let lineIndex = 0; lineIndex < page.lines.length; lineIndex++) {
      const line = page.lines[lineIndex];
      const lineChunks = tokenizeLine(line, lineIndex, pageIndex, chunkMode, customCharWidth);
      allChunks.push(...lineChunks);
    }
  }

  return { pages, chunks: allChunks };
}
