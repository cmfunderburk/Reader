import type { Chunk, DisplayMode, SaccadePage, TokenMode } from '../types';
import { isBreakChunk } from '../lib/rsvp';
import { calculateORP } from '../lib/tokenizer';
import { SaccadeReader } from './SaccadeReader';

interface ReaderProps {
  chunk: Chunk | null;
  isPlaying: boolean;
  displayMode: DisplayMode;
  mode: TokenMode;
  saccadePage?: SaccadePage | null;
  showPacer?: boolean;
  wpm: number;
  colorPhase?: 'a' | 'b';
  showORP?: boolean;
}

/**
 * Render a single word with its OVP highlighted.
 */
function WordWithOVP({ word, showORP = true }: { word: string; showORP?: boolean }) {
  const ovpIndex = calculateORP(word);
  const before = word.slice(0, ovpIndex);
  const ovpChar = word[ovpIndex] || '';
  const after = word.slice(ovpIndex + 1);

  return (
    <span className="reader-word">
      <span className="reader-word-before">{before}</span>
      <span className={showORP ? 'reader-orp' : 'reader-word-before'}>{ovpChar}</span>
      <span className="reader-word-after">{after}</span>
    </span>
  );
}

export function Reader({ chunk, displayMode, mode, saccadePage, showPacer = true, wpm, colorPhase, showORP = true }: ReaderProps) {
  // Saccade mode uses its own reader component
  if (displayMode === 'saccade') {
    return <SaccadeReader page={saccadePage ?? null} chunk={chunk} showPacer={showPacer} wpm={wpm} />;
  }
  // No article loaded
  if (!chunk) {
    return (
      <div className="reader">
        <div className="reader-display">
          <span className="reader-placeholder">No article loaded</span>
        </div>
      </div>
    );
  }

  // Paragraph break marker
  if (isBreakChunk(chunk)) {
    return (
      <div className="reader">
        <div className="reader-display">
          <span className="reader-break">{chunk.text}</span>
        </div>
      </div>
    );
  }

  const { text, orpIndex } = chunk;
  const isMultiWord = text.includes(' ') && text.length > 15;

  // Multi-word chunks over 15 chars: show per-word OVP (word mode only)
  if (isMultiWord) {
    const words = text.split(' ').filter(w => w.length > 0);
    const showOVP = mode === 'word';
    return (
      <div className="reader">
        <div className={`reader-display${colorPhase ? ` reader-color-${colorPhase}` : ''}`}>
          <div className="reader-text-multiword">
            {words.map((word, i) => (
              <span key={i}>
                {showOVP ? <WordWithOVP word={word} showORP={showORP} /> : <span className="reader-word">{word}</span>}
                {i < words.length - 1 && <span className="reader-word-space"> </span>}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Single word or short chunk: use single OVP with marker
  const beforeOrp = text.slice(0, orpIndex);
  const orpChar = text[orpIndex] || '';
  const afterOrp = text.slice(orpIndex + 1);
  const showOVP = mode === 'word';

  return (
    <div className="reader">
      <div className={`reader-display${colorPhase ? ` reader-color-${colorPhase}` : ''}`}>
        <div className="reader-text">
          <span className="reader-before">{beforeOrp}</span>
          <span className={showOVP && showORP ? 'reader-orp' : 'reader-before'}>{orpChar}</span>
          <span className="reader-after">{afterOrp}</span>
        </div>
        <div className="reader-marker">▲</div>
      </div>
    </div>
  );
}
