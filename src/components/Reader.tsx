import type { Chunk } from '../types';
import { isBreakChunk } from '../lib/rsvp';

interface ReaderProps {
  chunk: Chunk | null;
  isPlaying: boolean;
}

export function Reader({ chunk }: ReaderProps) {
  if (!chunk) {
    return (
      <div className="reader">
        <div className="reader-display">
          <span className="reader-placeholder">No article loaded</span>
        </div>
      </div>
    );
  }

  // Paragraph break marker - render differently
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

  // Split text around ORP for highlighting
  const before = text.slice(0, orpIndex);
  const orpChar = text[orpIndex] || '';
  const after = text.slice(orpIndex + 1);

  return (
    <div className="reader">
      <div className="reader-display">
        <span className="reader-text">
          <span className="reader-before">{before}</span>
          <span className="reader-orp">{orpChar}</span>
          <span className="reader-after">{after}</span>
        </span>
        <div className="reader-marker">▲</div>
      </div>
    </div>
  );
}
