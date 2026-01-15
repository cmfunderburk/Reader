import type { Chunk, SaccadePage, SaccadeLine } from '../types';

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
          <div key={lineIndex} className={getLineClassName(line)}>
            {renderLine(line, lineIndex, chunk)}
          </div>
        ))}
      </div>
    </div>
  );
}

function getLineClassName(line: SaccadeLine): string {
  if (line.type === 'heading') {
    return 'saccade-line saccade-line-heading';
  }
  return 'saccade-line';
}

function renderLine(line: SaccadeLine, lineIndex: number, chunk: Chunk): JSX.Element {
  const isCurrentLine = chunk.saccade?.lineIndex === lineIndex;

  // Blank line - render non-breaking space to maintain height
  if (line.type === 'blank') {
    return <span className="saccade-dimmed">{'\u00A0'}</span>;
  }

  // Heading line
  if (line.type === 'heading') {
    return renderHeadingLine(line, isCurrentLine, chunk);
  }

  // Body line
  return renderBodyLine(line.text, isCurrentLine, chunk);
}

function renderHeadingLine(line: SaccadeLine, isCurrentLine: boolean, chunk: Chunk): JSX.Element {
  if (!isCurrentLine || !chunk.saccade) {
    return <span className="saccade-heading-dimmed">{line.text}</span>;
  }

  // Current heading - split by ORP like body text
  const { startChar, endChar } = chunk.saccade;
  const beforeChunk = line.text.slice(0, startChar);
  const chunkText = line.text.slice(startChar, endChar);
  const afterChunk = line.text.slice(endChar);

  const orpInChunk = chunk.orpIndex;
  const beforeOrp = chunkText.slice(0, orpInChunk);
  const orpChar = chunkText[orpInChunk] || '';
  const afterOrp = chunkText.slice(orpInChunk + 1);

  return (
    <>
      <span className="saccade-heading-dimmed">{beforeChunk}</span>
      <span className="saccade-heading-chunk">{beforeOrp}</span>
      <span className="saccade-heading-orp">{orpChar}</span>
      <span className="saccade-heading-chunk">{afterOrp}</span>
      <span className="saccade-heading-dimmed">{afterChunk}</span>
    </>
  );
}

function renderBodyLine(text: string, isCurrentLine: boolean, chunk: Chunk): JSX.Element {
  // Empty body line
  if (text.length === 0) {
    return <span className="saccade-dimmed">{'\u00A0'}</span>;
  }

  // Not the current line - render fully dimmed
  if (!isCurrentLine || !chunk.saccade) {
    return <span className="saccade-dimmed">{text}</span>;
  }

  // Current line - split into before-chunk, chunk with ORP, after-chunk
  const { startChar, endChar } = chunk.saccade;
  const beforeChunk = text.slice(0, startChar);
  const chunkText = text.slice(startChar, endChar);
  const afterChunk = text.slice(endChar);

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
