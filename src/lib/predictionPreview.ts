import type { Chunk } from '../types';

const SENTENCE_END_RE = /([.!?])["')\]]*$/;
const ELLIPSIS_END_RE = /\.{3,}["')\]]*$/;

const COMMON_PERIOD_ABBREVIATIONS = new Set([
  'mr.', 'mrs.', 'ms.', 'dr.', 'prof.', 'sr.', 'jr.', 'st.', 'mt.',
  'vs.', 'etc.', 'e.g.', 'i.e.', 'cf.', 'fig.', 'eq.', 'no.',
]);

function stripEdgePunctuation(token: string): string {
  return token
    .replace(/^[("'[{]+/, '')
    .replace(/[,"')\]};:]+$/, '');
}

function getAdjacentWordText(chunks: Chunk[], index: number, direction: -1 | 1): string | null {
  for (let i = index + direction; i >= 0 && i < chunks.length; i += direction) {
    if (chunks[i].wordCount > 0) {
      return chunks[i].text;
    }
  }
  return null;
}

function periodGapWithinTwoChars(currentToken: string, prevToken: string | null, nextToken: string | null): boolean {
  const before = prevToken ? `${prevToken} ` : '';
  const after = nextToken ? ` ${nextToken}` : '';
  const context = `${before}${currentToken}${after}`;

  const targetInCurrent = currentToken.lastIndexOf('.');
  if (targetInCurrent === -1) return false;
  const targetIndex = before.length + targetInCurrent;

  const periodPositions: number[] = [];
  for (let i = 0; i < context.length; i++) {
    if (context[i] === '.') periodPositions.push(i);
  }

  for (const position of periodPositions) {
    if (position === targetIndex) continue;
    const charsBetween = Math.abs(position - targetIndex) - 1;
    if (charsBetween <= 2) return true;
  }
  return false;
}

function isLikelyPeriodAbbreviation(chunks: Chunk[], index: number): boolean {
  const token = chunks[index]?.text ?? '';
  const cleaned = stripEdgePunctuation(token).toLowerCase();
  if (!cleaned.endsWith('.')) return false;
  if (COMMON_PERIOD_ABBREVIATIONS.has(cleaned)) return true;
  if (/^(?:[a-z]\.){2,}$/i.test(cleaned)) return true;

  const prevToken = getAdjacentWordText(chunks, index, -1);
  const nextToken = getAdjacentWordText(chunks, index, 1);
  if (periodGapWithinTwoChars(token, prevToken, nextToken)) return true;

  return /^[a-z]\.$/i.test(cleaned);
}

export function isSentenceBoundaryChunk(chunks: Chunk[], index: number): boolean {
  const chunk = chunks[index];
  if (!chunk || chunk.wordCount === 0) return false;

  const token = chunk.text.trim();
  const match = token.match(SENTENCE_END_RE);
  if (!match) return false;

  const punctuation = match[1];
  if (punctuation === '!' || punctuation === '?') return true;
  if (ELLIPSIS_END_RE.test(token)) return true;
  return !isLikelyPeriodAbbreviation(chunks, index);
}

export function findPreviewSentenceTargetIndex(
  chunks: Chunk[],
  startIndex: number,
  sentenceCount: number
): number {
  if (chunks.length === 0) return 0;

  const clampedStart = Math.max(0, Math.min(startIndex, chunks.length - 1));
  const requiredSentences = Math.max(1, Math.floor(sentenceCount) || 1);

  let boundariesSeen = 0;
  let lastWordIndex = clampedStart;

  for (let i = clampedStart; i < chunks.length; i++) {
    if (chunks[i].wordCount === 0) continue;
    lastWordIndex = i;
    if (isSentenceBoundaryChunk(chunks, i)) {
      boundariesSeen += 1;
      if (boundariesSeen >= requiredSentences) {
        return i;
      }
    }
  }

  return lastWordIndex;
}
