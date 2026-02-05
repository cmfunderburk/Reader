/**
 * Calculate Levenshtein edit distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[a.length][b.length];
}

/**
 * Strip punctuation from word for comparison.
 * "dog." -> "dog", "it's" -> "its"
 */
export function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Calculate normalized loss (0-1) between predicted and actual words.
 * 0 = perfect match, 1 = completely different
 * Uses normalizeWord() for comparison (case-insensitive, punctuation-stripped).
 */
export function normalizedLoss(predicted: string, actual: string): number {
  const pred = normalizeWord(predicted);
  const act = normalizeWord(actual);

  if (pred === act) return 0;
  if (pred.length === 0 || act.length === 0) return 1;

  const distance = levenshteinDistance(pred, act);
  const maxLen = Math.max(pred.length, act.length);

  return distance / maxLen;
}

/**
 * Check if prediction is "correct" (exact match after normalization).
 * Used for flow control: correct = instant advance, incorrect = pause for feedback.
 */
export function isExactMatch(predicted: string, actual: string): boolean {
  return normalizeWord(predicted) === normalizeWord(actual);
}

/**
 * Derive display percentages from prediction stats.
 */
export function predictionScorePercents(stats: { totalWords: number; exactMatches: number; averageLoss: number }): {
  exactPercent: number;
  avgScore: number;
} {
  const exactPercent = stats.totalWords > 0
    ? Math.round((stats.exactMatches / stats.totalWords) * 100)
    : 0;
  const avgScore = stats.totalWords > 0
    ? Math.round((1 - stats.averageLoss) * 100)
    : 100;
  return { exactPercent, avgScore };
}
