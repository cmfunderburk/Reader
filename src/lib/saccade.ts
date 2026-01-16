import type { Chunk, SaccadePage, SaccadeLine, TokenMode } from '../types';
import { MODE_CHAR_WIDTHS } from '../types';
import { calculateORP } from './tokenizer';

export const SACCADE_LINE_WIDTH = 80;
export const SACCADE_LINES_PER_PAGE = 10;

// Major punctuation that always ends a chunk
const MAJOR_PUNCTUATION = /[.!?;]/;
// Minor punctuation that can end a chunk
const MINOR_PUNCTUATION = /[,:\-—–]/;

// Markdown heading pattern: # Heading, ## Heading, etc.
const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/;

/**
 * Normalize text by ensuring spaces after sentence-ending punctuation.
 */
function normalizeText(text: string): string {
  return text.replace(/([a-z])([.!?])([A-Z])/g, '$1$2 $3');
}

/**
 * Detect if a line is a markdown heading.
 */
function detectHeading(line: string): { isHeading: boolean; level: number; text: string } {
  const match = line.match(HEADING_PATTERN);
  if (match) {
    return { isHeading: true, level: match[1].length, text: match[2] };
  }
  return { isHeading: false, level: 0, text: line };
}

/**
 * Word-wrap a paragraph into lines of specified width.
 */
function wrapParagraph(text: string, lineWidth: number): SaccadeLine[] {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const lines: SaccadeLine[] = [];
  let currentLine = '';

  for (const word of words) {
    const wouldBe = currentLine.length === 0 ? word : currentLine + ' ' + word;

    if (wouldBe.length <= lineWidth) {
      currentLine = wouldBe;
    } else {
      if (currentLine.length > 0) {
        lines.push({ text: currentLine, type: 'body' });
      }
      if (word.length > lineWidth) {
        lines.push({ text: word, type: 'body' });
        currentLine = '';
      } else {
        currentLine = word;
      }
    }
  }

  if (currentLine.length > 0) {
    lines.push({ text: currentLine, type: 'body' });
  }

  return lines;
}

/**
 * Flow text into fixed-width lines using word wrapping.
 * Respects paragraph breaks (double newlines) and markdown headings.
 * Collapses single newlines into spaces to reflow ragged PDF extractions.
 */
export function flowTextIntoLines(text: string, lineWidth: number): SaccadeLine[] {
  const normalized = normalizeText(text);

  // Split into blocks (paragraphs/headings separated by blank lines)
  const blocks = normalized
    .split(/\n\s*\n/)
    .map(b => b.trim())
    .filter(b => b.length > 0);

  const lines: SaccadeLine[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    // Check if first line is a heading
    const firstLine = block.split('\n')[0].trim();
    const heading = detectHeading(firstLine);

    if (heading.isHeading) {
      // Add blank line before heading (if not first)
      if (lines.length > 0 && lines[lines.length - 1].type !== 'blank') {
        lines.push({ text: '', type: 'blank' });
      }
      // Add the heading
      lines.push({ text: heading.text, type: 'heading', level: heading.level });
      // Add blank line after heading
      lines.push({ text: '', type: 'blank' });

      // If there's more content after the heading line, process it as a paragraph
      const restOfBlock = block.split('\n').slice(1).join(' ').trim();
      if (restOfBlock.length > 0) {
        const wrappedLines = wrapParagraph(restOfBlock, lineWidth);
        lines.push(...wrappedLines);
      }
    } else {
      // Regular paragraph - collapse newlines into spaces and word wrap
      const paragraph = block.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      const wrappedLines = wrapParagraph(paragraph, lineWidth);
      lines.push(...wrappedLines);
    }

    // Add blank line between blocks (not after last)
    if (i < blocks.length - 1) {
      // Only add if last line isn't already blank
      if (lines.length > 0 && lines[lines.length - 1].type !== 'blank') {
        lines.push({ text: '', type: 'blank' });
      }
    }
  }

  return lines;
}

/**
 * Group lines into pages.
 */
export function groupIntoPages(lines: SaccadeLine[], linesPerPage: number): SaccadePage[] {
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
      const lineChunks = tokenizeLine(line.text, lineIndex, pageIndex, chunkMode, customCharWidth);
      allChunks.push(...lineChunks);
    }
  }

  return { pages, chunks: allChunks };
}
