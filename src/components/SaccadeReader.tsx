import type { Chunk, SaccadePage } from '../types';

interface SaccadeReaderProps {
  page: SaccadePage | null;
  chunk: Chunk | null;
}

export function SaccadeReader({ page, chunk }: SaccadeReaderProps) {
  if (!page || !chunk?.saccade) {
    return (
      <div className="reader saccade-reader">
        <div className="reader-display">
          <span className="reader-placeholder">No article loaded</span>
        </div>
      </div>
    );
  }

  return (
    <div className="reader saccade-reader">
      <div className="saccade-page">
        {page.lines.map((line, lineIndex) => (
          <div key={lineIndex} className="saccade-line">
            {renderLine(line, lineIndex, chunk)}
          </div>
        ))}
      </div>
    </div>
  );
}

function renderLine(line: string, lineIndex: number, chunk: Chunk): JSX.Element {
  const isCurrentLine = chunk.saccade?.lineIndex === lineIndex;

  // Empty line (paragraph break) - render non-breaking space to maintain height
  if (line.length === 0) {
    return <span className="saccade-dimmed">{'\u00A0'}</span>;
  }

  // Not the current line - render fully dimmed
  if (!isCurrentLine || !chunk.saccade) {
    return <span className="saccade-dimmed">{line}</span>;
  }

  // Current line - split into before-chunk, chunk with ORP, after-chunk
  const { startChar, endChar } = chunk.saccade;
  const beforeChunk = line.slice(0, startChar);
  const chunkText = line.slice(startChar, endChar);
  const afterChunk = line.slice(endChar);

  // Within chunk, split by ORP
  const orpInChunk = chunk.orpIndex;
  const beforeOrp = chunkText.slice(0, orpInChunk);
  const orpChar = chunkText[orpInChunk] || '';
  const afterOrp = chunkText.slice(orpInChunk + 1);

  return (
    <>
      <span className="saccade-dimmed">{beforeChunk}</span>
      <span className="saccade-chunk">{beforeOrp}</span>
      <span className="saccade-orp">{orpChar}</span>
      <span className="saccade-chunk">{afterOrp}</span>
      <span className="saccade-dimmed">{afterChunk}</span>
    </>
  );
}
