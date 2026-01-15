import type { Chunk, DisplayMode, SaccadePage } from '../types';
import { isBreakChunk } from '../lib/rsvp';
import { SaccadeReader } from './SaccadeReader';

interface ReaderProps {
  chunk: Chunk | null;
  isPlaying: boolean;
  displayMode: DisplayMode;
  saccadePage?: SaccadePage | null;
}

export function Reader({ chunk, displayMode, saccadePage }: ReaderProps) {
  // Saccade mode uses its own reader component
  if (displayMode === 'saccade') {
    return <SaccadeReader page={saccadePage ?? null} chunk={chunk} />;
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
  const beforeOrp = text.slice(0, orpIndex);
  const orpChar = text[orpIndex] || '';
  const afterOrp = text.slice(orpIndex + 1);

  return (
    <div className="reader">
      <div className="reader-display">
        <div className="reader-text">
          <span className="reader-before">{beforeOrp}</span>
          <span className="reader-orp">{orpChar}</span>
          <span className="reader-after">{afterOrp}</span>
        </div>
        <div className="reader-marker">▲</div>
      </div>
    </div>
  );
}
