const DRILL_WPM_STEP = 10;
export { DRILL_WPM_STEP };

export function adjustDrillDifficulty(
  wpm: number,
  minWpm: number,
  maxWpm: number,
  success: boolean,
): { wpm: number } {
  const lo = Math.max(100, Math.min(minWpm, maxWpm));
  const hi = Math.min(800, Math.max(minWpm, maxWpm));
  const clamped = Math.max(lo, Math.min(hi, wpm));
  if (success) {
    return { wpm: Math.min(hi, clamped + DRILL_WPM_STEP) };
  }
  return { wpm: Math.max(lo, clamped - DRILL_WPM_STEP) };
}

/**
 * Build the drill round text from the sentence list.
 * When auto-adjust is disabled, rounds are always exactly one sentence.
 */
export function getDrillRound(
  sentences: string[],
  startIndex: number,
): { text: string; sentenceCount: number } {
  const first = sentences[startIndex];
  if (!first) return { text: '', sentenceCount: 0 };
  return { text: first, sentenceCount: 1 };
}
