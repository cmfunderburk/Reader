import type { Chunk, SaccadePage, SaccadeLine } from '../types';
import { computeLineFixations } from '../lib/saccade';

interface SaccadeReaderProps {
  page: SaccadePage | null;
  chunk: Chunk | null;
  showPacer: boolean;
  wpm: number;
  saccadeShowOVP?: boolean;
  saccadeShowSweep?: boolean;
  saccadeShowNextORP?: boolean;
  saccadeLength?: number;
}

export function SaccadeReader({ page, chunk, showPacer, wpm, saccadeShowOVP, saccadeShowSweep, saccadeShowNextORP, saccadeLength }: SaccadeReaderProps) {
  if (!page) {
    return (
      <div className="reader saccade-reader">
        <div className="reader-display">
          <span className="reader-placeholder">No article loaded</span>
        </div>
      </div>
    );
  }

  const currentLineIndex = chunk?.saccade?.lineIndex ?? -1;

  return (
    <div className="reader saccade-reader">
      <div className="saccade-page">
        {page.lines.map((line, lineIndex) => (
          <SaccadeLineComponent
            key={lineIndex}
            line={line}
            lineIndex={lineIndex}
            isActiveLine={lineIndex === currentLineIndex}
            isFutureLine={showPacer && lineIndex > currentLineIndex}
            showPacer={showPacer}
            wpm={wpm}
            saccadeShowOVP={saccadeShowOVP}
            saccadeShowSweep={saccadeShowSweep}
            saccadeShowNextORP={saccadeShowNextORP}
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
  isActiveLine: boolean;
  isFutureLine: boolean;
  showPacer: boolean;
  wpm: number;
  saccadeShowOVP?: boolean;
  saccadeShowSweep?: boolean;
  saccadeShowNextORP?: boolean;
  saccadeLength?: number;
}

function SaccadeLineComponent({ line, lineIndex, isActiveLine, isFutureLine, showPacer, wpm, saccadeShowOVP, saccadeShowSweep, saccadeShowNextORP, saccadeLength }: SaccadeLineProps) {
  if (line.type === 'blank') {
    return (
      <div className="saccade-line">
        <span>{'\u00A0'}</span>
      </div>
    );
  }

  const isHeading = line.type === 'heading';

  // Compute fixations and timing
  const fixations = (saccadeLength && line.text)
    ? computeLineFixations(line.text, saccadeLength)
    : [];
  const timePerSaccade = (wpm && saccadeLength)
    ? (saccadeLength / 5) * (60000 / wpm)
    : 0;
  const lineDuration = fixations.length * timePerSaccade;

  const useSweepBar = showPacer && saccadeShowSweep !== false && isActiveLine && lineDuration > 0 && fixations.length > 0;
  const animateFlow = showPacer && isActiveLine && saccadeShowOVP && timePerSaccade > 0;

  // Generate keyframes for sweep bar and per-fixation visibility
  const keyframeBlocks: string[] = [];

  if (useSweepBar) {
    const sweepName = `sweep-${lineIndex}`;
    const steps = fixations.map((charIdx, i) => {
      const timePct = ((i / fixations.length) * 100).toFixed(2);
      return `${timePct}% { width: ${(charIdx + 0.5).toFixed(1)}ch; }`;
    });
    steps.push(`100% { width: ${(fixations[fixations.length - 1] + 0.5).toFixed(1)}ch; }`);
    keyframeBlocks.push(`@keyframes ${sweepName} { ${steps.join(' ')} }`);
  }

  if (animateFlow && fixations.length > 0) {
    keyframeBlocks.push(generateFixationKeyframes(lineIndex, fixations.length, saccadeShowNextORP !== false));
  }

  // Static amber ORPs: all lines when pacer off, next line when lookahead on,
  // or active line when not animating
  const showStaticOVP = saccadeShowOVP && !animateFlow && (
    !showPacer
    || isActiveLine
    || (isFutureLine && saccadeShowNextORP !== false)
  );
  const animConfig = animateFlow ? { lineIndex, lineDuration } : undefined;

  const lineClasses = [
    'saccade-line',
    isHeading && 'saccade-line-heading',
    useSweepBar && 'saccade-line-sweep',
  ].filter(Boolean).join(' ');

  return (
    <div className={lineClasses} key={isActiveLine ? lineIndex : undefined}>
      {keyframeBlocks.length > 0 && <style>{keyframeBlocks.join(' ')}</style>}
      {useSweepBar && (
        <span
          className="saccade-sweep"
          style={{ animation: `sweep-${lineIndex} ${lineDuration}ms step-end both` }}
        />
      )}
      {renderLineText(line.text, isHeading, showStaticOVP || animateFlow, fixations, animConfig)}
    </div>
  );
}

/**
 * Generate per-fixation @keyframes rules. When showNext is true, all future
 * fixations start amber, turn red when current, then revert to plain text.
 * When showNext is false, only the red "current" phase is visible; all other
 * fixations remain plain text.
 *
 * Uses paired keyframes with linear timing to create sharp transitions.
 * Each phase holds a value over a percentage range (e.g., "20%, 39.99%"),
 * with a tiny 0.01% gap between ranges for effectively instant switches.
 */
function generateFixationKeyframes(lineIndex: number, N: number, showNext: boolean): string {
  const plain = 'color: var(--text-primary); font-weight: normal';
  const amber = 'color: rgba(224, 176, 56, 0.85); font-weight: 600';
  const red = 'color: var(--accent); font-weight: 600';
  const eps = 0.01;

  const boundary = (step: number) => step / N * 100;
  const fmt = (v: number) => v.toFixed(2);
  const rangeEnd = (step: number) => step >= N ? '100' : fmt(boundary(step) - eps);

  const rules: string[] = [];

  for (let i = 0; i < N; i++) {
    const kf: string[] = [];

    // Before-current phase: amber (lookahead) or plain
    if (i > 0) {
      kf.push(`0%, ${rangeEnd(i)}% { ${showNext ? amber : plain} }`);
    }

    // Red "current" phase
    kf.push(`${fmt(boundary(i))}%, ${rangeEnd(i + 1)}% { ${red} }`);

    // Plain text after current phase
    if (i + 1 < N) {
      kf.push(`${fmt(boundary(i + 1))}%, 100% { ${plain} }`);
    }

    rules.push(`@keyframes fix-${lineIndex}-${i} { ${kf.join(' ')} }`);
  }

  return rules.join(' ');
}

function renderLineText(
  text: string,
  isHeading: boolean,
  showOVP?: boolean,
  fixations?: number[],
  animConfig?: { lineIndex: number; lineDuration: number },
): JSX.Element {
  const className = isHeading ? 'saccade-heading' : 'saccade-body';

  if (!showOVP || !fixations || fixations.length === 0 || !text) {
    return <span className={className}>{text || '\u00A0'}</span>;
  }

  const segments: JSX.Element[] = [];
  let cursor = 0;

  for (let i = 0; i < fixations.length; i++) {
    const idx = fixations[i];
    if (idx > cursor) {
      segments.push(<span key={`t${i}`}>{text.slice(cursor, idx)}</span>);
    }
    if (animConfig) {
      const style = {
        animation: `fix-${animConfig.lineIndex}-${i} ${animConfig.lineDuration}ms linear both`,
      };
      segments.push(
        <span key={`f${i}`} className="saccade-fixation" style={style}>
          {text[idx]}
        </span>
      );
    } else {
      segments.push(<span key={`f${i}`} className="saccade-fixation">{text[idx]}</span>);
    }
    cursor = idx + 1;
  }

  if (cursor < text.length) {
    segments.push(<span key="tail">{text.slice(cursor)}</span>);
  }

  return <span className={className}>{segments}</span>;
}
