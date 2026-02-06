import type { Chunk, SaccadePage, SaccadeLine } from '../types';
import { calculateDisplayTime } from '../lib/rsvp';
import { computeLineFixations } from '../lib/saccade';

interface SaccadeReaderProps {
  page: SaccadePage | null;
  chunk: Chunk | null;
  showPacer: boolean;
  wpm: number;
  saccadeShowOVP?: boolean;
  saccadeLength?: number;
}

export function SaccadeReader({ page, chunk, showPacer, wpm, saccadeShowOVP, saccadeLength }: SaccadeReaderProps) {
  if (!page) {
    return (
      <div className="reader saccade-reader">
        <div className="reader-display">
          <span className="reader-placeholder">No article loaded</span>
        </div>
      </div>
    );
  }

  // Determine current chunk position for pacer highlighting
  const currentLineIndex = chunk?.saccade?.lineIndex ?? -1;

  return (
    <div className="reader saccade-reader">
      <div className="saccade-page">
        {page.lines.map((line, lineIndex) => (
          <SaccadeLineComponent
            key={lineIndex}
            line={line}
            lineIndex={lineIndex}
            lineChunks={page.lineChunks[lineIndex] || []}
            isCurrentLine={showPacer && lineIndex === currentLineIndex}
            wpm={wpm}
            saccadeShowOVP={saccadeShowOVP}
            saccadeLength={saccadeLength}
          />
        ))}
      </div>
    </div>
  );
}

interface SaccadeLineProps {
  line: SaccadeLine;
  lineIndex: number;
  lineChunks: Chunk[];
  isCurrentLine: boolean;
  wpm: number;
  saccadeShowOVP?: boolean;
  saccadeLength?: number;
}

function SaccadeLineComponent({ line, lineIndex, lineChunks, isCurrentLine, wpm, saccadeShowOVP, saccadeLength }: SaccadeLineProps) {
  // Blank line - render non-breaking space to maintain height
  if (line.type === 'blank') {
    return (
      <div className="saccade-line">
        <span>{'\u00A0'}</span>
      </div>
    );
  }

  const isHeading = line.type === 'heading';

  // Sweep duration = exact sum of chunk display times for this line,
  // matching the actual timer that drives line advancement
  const sweepDuration = lineChunks.reduce(
    (sum, c) => sum + calculateDisplayTime(c, wpm), 0
  );

  const lineClasses = [
    'saccade-line',
    isHeading && 'saccade-line-heading',
    isCurrentLine && 'saccade-line-sweep',
  ].filter(Boolean).join(' ');

  const sweepStyle = isCurrentLine
    ? { '--sweep-duration': `${sweepDuration}ms` } as React.CSSProperties
    : undefined;

  return (
    <div className={lineClasses} style={sweepStyle} key={isCurrentLine ? lineIndex : undefined}>
      {renderLineText(line.text, isHeading, saccadeShowOVP, saccadeLength)}
    </div>
  );
}

function renderLineText(text: string, isHeading: boolean, showOVP?: boolean, saccadeLength?: number): JSX.Element {
  const className = isHeading ? 'saccade-heading' : 'saccade-body';

  if (!showOVP || !saccadeLength || !text) {
    return <span className={className}>{text || '\u00A0'}</span>;
  }

  const fixations = computeLineFixations(text, saccadeLength);
  if (fixations.length === 0) {
    return <span className={className}>{text}</span>;
  }

  // Build segments: split text around each fixation character index
  const segments: JSX.Element[] = [];
  let cursor = 0;

  for (let i = 0; i < fixations.length; i++) {
    const idx = fixations[i];
    // Text before this fixation
    if (idx > cursor) {
      segments.push(<span key={`t${i}`}>{text.slice(cursor, idx)}</span>);
    }
    // The fixation character
    segments.push(<span key={`f${i}`} className="saccade-fixation">{text[idx]}</span>);
    cursor = idx + 1;
  }

  // Remaining text after last fixation
  if (cursor < text.length) {
    segments.push(<span key="tail">{text.slice(cursor)}</span>);
  }

  return <span className={className}>{segments}</span>;
}
