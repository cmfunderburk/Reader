const MIN_CHAR_LIMIT = 50;
const CHAR_LIMIT_PHASE2_CAP = 200;
const WPM_PHASE1_CAP = 250;
const WPM_PHASE3_CAP = 400;
const WPM_STEP_UP = 15;
const WPM_STEP_DOWN = 25;
const CHAR_STEP_UP = 20;
const CHAR_STEP_DOWN = 20;

export { MIN_CHAR_LIMIT };

/**
 * Difficulty ladder: WPM first -> charLimit -> WPM again -> charLimit only.
 * Phase 1: WPM  [100..250], charLimit = MIN
 * Phase 2: WPM  = 250,      charLimit [MIN..200]
 * Phase 3: WPM  [250..400], charLimit = 200
 * Phase 4: WPM  = 400,      charLimit [200..inf)
 */
export function adjustDrillDifficulty(
  wpm: number,
  charLimit: number,
  success: boolean,
): { wpm: number; charLimit: number } {
  if (success) {
    if (wpm < WPM_PHASE1_CAP)
      return { wpm: Math.min(WPM_PHASE1_CAP, wpm + WPM_STEP_UP), charLimit };
    if (charLimit < CHAR_LIMIT_PHASE2_CAP)
      return { wpm, charLimit: Math.min(CHAR_LIMIT_PHASE2_CAP, charLimit + CHAR_STEP_UP) };
    if (wpm < WPM_PHASE3_CAP)
      return { wpm: Math.min(WPM_PHASE3_CAP, wpm + WPM_STEP_UP), charLimit };
    return { wpm, charLimit: charLimit + CHAR_STEP_UP };
  }

  // Reverse order: undo the most-recently-earned dial first.
  if (charLimit > CHAR_LIMIT_PHASE2_CAP)
    return { wpm, charLimit: Math.max(CHAR_LIMIT_PHASE2_CAP, charLimit - CHAR_STEP_DOWN) };
  if (wpm > WPM_PHASE1_CAP && charLimit >= CHAR_LIMIT_PHASE2_CAP)
    return { wpm: Math.max(WPM_PHASE1_CAP, wpm - WPM_STEP_DOWN), charLimit };
  if (charLimit > MIN_CHAR_LIMIT)
    return { wpm, charLimit: Math.max(MIN_CHAR_LIMIT, charLimit - CHAR_STEP_DOWN) };
  return { wpm: Math.max(100, wpm - WPM_STEP_DOWN), charLimit };
}

/**
 * Build the drill round text from the sentence list.
 * When auto-adjust is disabled, rounds are always exactly one sentence.
 */
export function getDrillRound(
  sentences: string[],
  startIndex: number,
  charLimit: number,
  autoAdjustDifficulty: boolean,
): { text: string; sentenceCount: number } {
  const first = sentences[startIndex];
  if (!first) return { text: '', sentenceCount: 0 };
  if (!autoAdjustDifficulty) return { text: first, sentenceCount: 1 };

  let text = first;
  let count = 1;
  for (let i = startIndex + 1; i < sentences.length; i++) {
    const next = sentences[i];
    if (text.length + 1 + next.length > charLimit) break;
    text += ' ' + next;
    count++;
  }
  return { text, sentenceCount: count };
}
