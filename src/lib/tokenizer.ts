import type { Chunk, TokenMode } from '../types';
import { MODE_CHAR_WIDTHS } from '../types';

// Major punctuation that always ends a chunk
const MAJOR_PUNCTUATION = /[.!?;]/;
// Minor punctuation that can end a chunk
const MINOR_PUNCTUATION = /[,:\-—–]/;

/**
 * Calculate the Optimal Reading Point (ORP) index within a chunk.
 * ORP is approximately 35% into the chunk, biased toward the start of longer words.
 */
function calculateORP(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  if (trimmed.length <= 1) return 0;
  if (trimmed.length <= 3) return 1;

  // For multi-word chunks, find the ORP at ~35% of total length
  const orpPosition = Math.floor(trimmed.length * 0.35);

  // Adjust to avoid landing on whitespace
  let adjusted = orpPosition;
  while (adjusted > 0 && trimmed[adjusted] === ' ') {
    adjusted--;
  }

  return adjusted;
}

/**
 * Normalize text by ensuring spaces after sentence-ending punctuation.
 * Handles cases like "word.Next" -> "word. Next"
 * But preserves abbreviations like "U.S.A." (uppercase before period)
 */
function normalizeText(text: string): string {
  // Only add space when a lowercase letter precedes the punctuation
  // This catches real sentence endings but not abbreviations like U.S.A.
  return text.replace(/([a-z])([.!?])([A-Z])/g, '$1$2 $3');
}

/**
 * Tokenize text into words, splitting on whitespace.
 */
function tokenizeWords(text: string): string[] {
  const normalized = normalizeText(text);
  return normalized.split(/\s+/).filter(w => w.length > 0);
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
 * Tokenize text in Word mode - one word per chunk.
 */
function tokenizeWordMode(text: string): Chunk[] {
  const words = tokenizeWords(text);
  return words.map(word => ({
    text: word,
    wordCount: 1,
    orpIndex: calculateORP(word),
  }));
}

/**
 * Tokenize text by character width - accumulate words until max chars reached.
 * Respects punctuation as natural break points.
 *
 * @param text - Text to tokenize
 * @param maxChars - Target maximum character width
 */
function tokenizeByCharWidth(text: string, maxChars: number): Chunk[] {
  const words = tokenizeWords(text);
  const chunks: Chunk[] = [];

  let currentWords: string[] = [];
  let currentLength = 0;

  for (const word of words) {
    const wouldBeLength = currentLength + (currentWords.length > 0 ? 1 : 0) + word.length;

    // If adding this word exceeds max and we have content, flush first
    if (wouldBeLength > maxChars && currentWords.length > 0) {
      const chunkText = currentWords.join(' ');
      chunks.push({
        text: chunkText,
        wordCount: currentWords.length,
        orpIndex: calculateORP(chunkText),
      });
      currentWords = [];
      currentLength = 0;
    }

    // Add word to current chunk
    currentWords.push(word);
    currentLength = currentWords.join(' ').length;

    // Check for punctuation-based breaks
    const hitMajorPunct = endsWithMajorPunctuation(word);
    const hitMinorPunct = endsWithMinorPunctuation(word);
    const atGoodBreakPoint = currentLength >= maxChars * 0.6; // 60% of target

    // Break on major punctuation, or minor punctuation if we're past 60% of target
    if (hitMajorPunct || (hitMinorPunct && atGoodBreakPoint)) {
      const chunkText = currentWords.join(' ');
      chunks.push({
        text: chunkText,
        wordCount: currentWords.length,
        orpIndex: calculateORP(chunkText),
      });
      currentWords = [];
      currentLength = 0;
    }
  }

  // Flush remaining words
  if (currentWords.length > 0) {
    const chunkText = currentWords.join(' ');
    chunks.push({
      text: chunkText,
      wordCount: currentWords.length,
      orpIndex: calculateORP(chunkText),
    });
  }

  return chunks;
}

/**
 * Create a paragraph break marker chunk.
 */
function createBreakChunk(): Chunk {
  return {
    text: '· · ·',
    wordCount: 0, // Zero words = longer pause ratio
    orpIndex: 2,  // Center dot
  };
}

/**
 * Tokenize a single paragraph based on mode.
 */
function tokenizeParagraph(text: string, mode: TokenMode, customCharWidth?: number): Chunk[] {
  switch (mode) {
    case 'word':
      return tokenizeWordMode(text);
    case 'phrase':
      return tokenizeByCharWidth(text, MODE_CHAR_WIDTHS.phrase);
    case 'clause':
      return tokenizeByCharWidth(text, MODE_CHAR_WIDTHS.clause);
    case 'custom':
      return tokenizeByCharWidth(text, customCharWidth ?? MODE_CHAR_WIDTHS.custom);
  }
}

/**
 * Tokenize text into chunks based on the selected mode.
 * Respects paragraph breaks and inserts visual markers between them.
 *
 * @param text - Text to tokenize
 * @param mode - Tokenization mode
 * @param customCharWidth - Custom character width (only used in 'custom' mode)
 */
export function tokenize(text: string, mode: TokenMode, customCharWidth?: number): Chunk[] {
  // Split into paragraphs (double newline or more)
  const paragraphs = text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // If no clear paragraph structure, treat as single block
  if (paragraphs.length <= 1) {
    return tokenizeParagraph(text, mode, customCharWidth);
  }

  // Tokenize each paragraph and join with break markers
  const allChunks: Chunk[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraphChunks = tokenizeParagraph(paragraphs[i], mode, customCharWidth);
    allChunks.push(...paragraphChunks);

    // Add break marker between paragraphs (not after last)
    if (i < paragraphs.length - 1) {
      allChunks.push(createBreakChunk());
    }
  }

  return allChunks;
}

/**
 * Calculate estimated reading time in seconds for given chunks at WPM.
 */
export function estimateReadingTime(chunks: Chunk[], wpm: number): number {
  const totalWords = chunks.reduce((sum, chunk) => sum + chunk.wordCount, 0);
  return (totalWords / wpm) * 60;
}
