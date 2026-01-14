import type { Chunk, TokenMode } from '../types';

// Major punctuation that always ends a chunk
const MAJOR_PUNCTUATION = /[.!?;]/;
// Minor punctuation that ends a chunk in phrase/clause mode
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
 * Tokenize text into words, splitting on whitespace.
 */
function tokenizeWords(text: string): string[] {
  return text.split(/\s+/).filter(w => w.length > 0);
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
 * Tokenize text in Phrase mode - 2-4 words per chunk, respecting punctuation.
 * Target: 3 words
 * Rule: Chunk ends at any punctuation, never crosses major punctuation.
 */
function tokenizePhraseMode(text: string): Chunk[] {
  const words = tokenizeWords(text);
  const chunks: Chunk[] = [];
  const TARGET = 3;
  const MAX = 4;

  let currentWords: string[] = [];

  for (const word of words) {
    currentWords.push(word);

    const shouldBreak =
      currentWords.length >= MAX ||
      endsWithMajorPunctuation(word) ||
      endsWithMinorPunctuation(word) ||
      (currentWords.length >= TARGET - 1 && endsWithMinorPunctuation(word));

    // Also break if we've hit target and next word would be a "short" function word
    // But we don't know the next word yet, so we break at target if current ends with punctuation
    // or if we've hit the target
    const atTarget = currentWords.length >= TARGET;

    if (shouldBreak || (atTarget && (endsWithMajorPunctuation(word) || endsWithMinorPunctuation(word)))) {
      const chunkText = currentWords.join(' ');
      chunks.push({
        text: chunkText,
        wordCount: currentWords.length,
        orpIndex: calculateORP(chunkText),
      });
      currentWords = [];
    } else if (currentWords.length >= TARGET) {
      // Hit target without punctuation - still break to maintain rhythm
      const chunkText = currentWords.join(' ');
      chunks.push({
        text: chunkText,
        wordCount: currentWords.length,
        orpIndex: calculateORP(chunkText),
      });
      currentWords = [];
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
 * Tokenize text in Clause mode - 5-8 words per chunk, respecting sentence punctuation.
 * Target: 6 words
 * Rule: Chunk ends at major punctuation only, can cross minor punctuation.
 */
function tokenizeClauseMode(text: string): Chunk[] {
  const words = tokenizeWords(text);
  const chunks: Chunk[] = [];
  const TARGET = 6;
  const MAX = 8;

  let currentWords: string[] = [];

  for (const word of words) {
    currentWords.push(word);

    const hitMax = currentWords.length >= MAX;
    const hitMajorPunctuation = endsWithMajorPunctuation(word);
    const atTargetWithMinorPunct = currentWords.length >= TARGET && endsWithMinorPunctuation(word);

    if (hitMax || hitMajorPunctuation || atTargetWithMinorPunct) {
      const chunkText = currentWords.join(' ');
      chunks.push({
        text: chunkText,
        wordCount: currentWords.length,
        orpIndex: calculateORP(chunkText),
      });
      currentWords = [];
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
 * Tokenize text into chunks based on the selected mode.
 */
export function tokenize(text: string, mode: TokenMode): Chunk[] {
  switch (mode) {
    case 'word':
      return tokenizeWordMode(text);
    case 'phrase':
      return tokenizePhraseMode(text);
    case 'clause':
      return tokenizeClauseMode(text);
  }
}

/**
 * Calculate estimated reading time in seconds for given chunks at WPM.
 */
export function estimateReadingTime(chunks: Chunk[], wpm: number): number {
  const totalWords = chunks.reduce((sum, chunk) => sum + chunk.wordCount, 0);
  return (totalWords / wpm) * 60;
}
