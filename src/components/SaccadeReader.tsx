import type { Chunk, SaccadePage, SaccadeLine, SaccadePacerStyle, SaccadeFocusTarget } from '../types';
import { computeLineFixations, calculateSaccadeLineDuration, computeFocusTargets, computeFocusTargetTimings, computeWordFixations, computeWordTargets } from '../lib/saccade';

interface SaccadeReaderProps {
  page: SaccadePage | null;
  chunk: Chunk | null;
  isPlaying: boolean;
  showPacer: boolean;
  wpm: number;
  saccadeShowOVP?: boolean;
  saccadeShowSweep?: boolean;
  saccadePacerStyle?: SaccadePacerStyle;
  saccadeFocusTarget?: SaccadeFocusTarget;
  saccadeLength?: number;
}

export function SaccadeReader({ page, chunk, isPlaying, showPacer, wpm, saccadeShowOVP, saccadeShowSweep, saccadePacerStyle, saccadeFocusTarget, saccadeLength }: SaccadeReaderProps) {
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
            isPlaying={isPlaying}
            isFutureLine={showPacer && lineIndex > currentLineIndex}
            showPacer={showPacer}
            wpm={wpm}
            saccadeShowOVP={saccadeShowOVP}
            saccadeShowSweep={saccadeShowSweep}
            saccadePacerStyle={saccadePacerStyle}
            saccadeFocusTarget={saccadeFocusTarget}
            saccadeLength={saccadeLength}
          />
        ))}
      </div>
    </div>
  );
}

export interface SaccadeLineProps {
  line: SaccadeLine;
  lineIndex: number;
  isActiveLine: boolean;
  isPlaying: boolean;
  isFutureLine: boolean;
  showPacer: boolean;
  wpm: number;
  saccadeShowOVP?: boolean;
  saccadeShowSweep?: boolean;
  saccadePacerStyle?: SaccadePacerStyle;
  saccadeFocusTarget?: SaccadeFocusTarget;
  saccadeLength?: number;
}

export function SaccadeLineComponent({ line, lineIndex, isActiveLine, isPlaying, isFutureLine, showPacer, wpm, saccadeShowOVP, saccadeShowSweep, saccadePacerStyle, saccadeFocusTarget, saccadeLength }: SaccadeLineProps) {
  if (line.type === 'blank') {
    return (
      <div className="saccade-line">
        <span>{'\u00A0'}</span>
      </div>
    );
  }

  const isHeading = line.type === 'heading';
  const textLength = line.text.length;

  // Character-based line duration: 5 chars = 1 word at configured WPM
  const lineDuration = calculateSaccadeLineDuration(textLength, wpm);
  const pacerStyle = saccadePacerStyle ?? (saccadeShowSweep === false ? 'focus' : 'sweep');
  const focusTarget = saccadeFocusTarget ?? 'fixation';

  const fixationBasedFixations = (saccadeLength && line.text)
    ? computeLineFixations(line.text, saccadeLength)
    : [];
  const wordBasedFixations = computeWordFixations(line.text);
  const fixations = pacerStyle === 'focus' && focusTarget === 'word'
    ? wordBasedFixations
    : fixationBasedFixations;

  const focusTargets = pacerStyle !== 'focus'
    ? []
    : focusTarget === 'word'
      ? computeWordTargets(line.text)
      : computeFocusTargets(line.text, fixations);
  const useSweepBar = showPacer && pacerStyle === 'sweep' && isActiveLine && lineDuration > 0;
  const useFocusTargets = showPacer && pacerStyle === 'focus' && isActiveLine && lineDuration > 0 && focusTargets.length > 0;
  const focusTimings = useFocusTargets
    ? computeFocusTargetTimings(line.text, focusTargets, focusTarget === 'word' ? 'word' : 'char')
    : [];

  // Sweep-synced ORP decoloring: ORPs start amber, turn plain as sweep passes
  const sweepDecolors = useSweepBar && saccadeShowOVP && fixations.length > 0;
  const focusDecolors = useFocusTargets && saccadeShowOVP && fixations.length > 0;

  // Static amber ORPs: all lines when pacer off, or current + future lines when pacer on
  const showStaticOVP = saccadeShowOVP && !sweepDecolors && !focusDecolors && (
    !showPacer || isActiveLine || isFutureLine
  );

  // Generate keyframes
  const keyframeBlocks: string[] = [];

  if (useSweepBar) {
    keyframeBlocks.push(
      `@keyframes sweep-${lineIndex} { from { width: 0ch; } to { width: ${textLength}ch; } }`
    );
  }

  if (sweepDecolors) {
    keyframeBlocks.push(generateDecolorKeyframes(lineIndex, fixations, textLength));
  }
  if (focusDecolors) {
    keyframeBlocks.push(generateFocusDecolorKeyframes(lineIndex, fixations, focusTargets, focusTimings));
  }
  if (useFocusTargets) {
    keyframeBlocks.push(generateFocusKeyframes(lineIndex, focusTimings));
  }

  const decolorConfig = (sweepDecolors || focusDecolors) ? { lineIndex, lineDuration, isPlaying } : undefined;
  const focusConfig = useFocusTargets ? { lineIndex, lineDuration, isPlaying, focusTargets } : undefined;

  const lineClasses = [
    'saccade-line',
    isHeading && 'saccade-line-heading',
    useSweepBar && 'saccade-line-sweep',
    useFocusTargets && 'saccade-line-focus',
  ].filter(Boolean).join(' ');

  return (
    <div className={lineClasses} key={isActiveLine ? lineIndex : undefined}>
      {keyframeBlocks.length > 0 && <style>{keyframeBlocks.join(' ')}</style>}
      {useSweepBar && (
        <span
          className="saccade-sweep"
          style={{
            animation: `sweep-${lineIndex} ${lineDuration}ms linear both`,
            animationPlayState: isPlaying ? 'running' : 'paused',
          }}
        />
      )}
      {focusConfig
        ? renderLineTextWithFocus(line.text, isHeading, showStaticOVP || focusDecolors, fixations, focusConfig, decolorConfig)
        : renderLineText(line.text, isHeading, showStaticOVP || sweepDecolors, fixations, decolorConfig)}
    </div>
  );
}

/**
 * Generate per-ORP @keyframes that transition from amber to plain text
 * when the continuous sweep bar reaches each ORP's character position.
 * Uses paired keyframes with a 0.01% gap for sharp transitions.
 */
function generateDecolorKeyframes(lineIndex: number, fixations: number[], textLength: number): string {
  const amber = 'color: rgba(224, 176, 56, 0.85); font-weight: 600';
  const plain = 'color: var(--text-primary); font-weight: normal';
  const eps = 0.01;
  const fmt = (v: number) => v.toFixed(2);

  return fixations.map((charIdx, i) => {
    const pct = (charIdx / textLength) * 100;
    const kf = `0%, ${fmt(pct)}% { ${amber} } ${fmt(pct + eps)}%, 100% { ${plain} }`;
    return `@keyframes orp-${lineIndex}-${i} { ${kf} }`;
  }).join(' ');
}

function generateFocusDecolorKeyframes(
  lineIndex: number,
  fixations: number[],
  focusTargets: Array<{ startChar: number; endChar: number }>,
  focusTimings: Array<{ startPct: number; endPct: number }>,
): string {
  const amber = 'color: rgba(224, 176, 56, 0.85); font-weight: 600';
  const plain = 'color: var(--text-primary); font-weight: normal';
  const eps = 0.01;
  const fmt = (v: number) => v.toFixed(2);

  return fixations.map((charIdx, i) => {
    let targetIndex = focusTargets.findIndex(t => charIdx >= t.startChar && charIdx < t.endChar);
    if (targetIndex === -1 && focusTargets.length > 0) {
      targetIndex = focusTargets.findIndex(t => charIdx < t.endChar);
      if (targetIndex === -1) targetIndex = focusTargets.length - 1;
    }
    const pct = targetIndex >= 0
      ? focusTimings[Math.min(targetIndex, focusTimings.length - 1)].endPct
      : 100;
    const kf = `0%, ${fmt(pct)}% { ${amber} } ${fmt(pct + eps)}%, 100% { ${plain} }`;
    return `@keyframes orp-${lineIndex}-${i} { ${kf} }`;
  }).join(' ');
}

function generateFocusKeyframes(
  lineIndex: number,
  focusTimings: Array<{ startPct: number; endPct: number }>
): string {
  const active = 'background: rgba(224, 176, 56, 0.16)';
  const inactive = 'background: transparent';
  const eps = 0.01;
  const fmt = (v: number) => v.toFixed(2);

  return focusTimings.map((timing, i) => {
    const startPct = timing.startPct;
    const endPct = timing.endPct;
    const startOn = Math.min(100, startPct + eps);
    const endOff = Math.min(100, endPct + eps);
    const kf = [
      `0%, ${fmt(startPct)}% { ${inactive} }`,
      `${fmt(startOn)}%, ${fmt(endPct)}% { ${active} }`,
      `${fmt(endOff)}%, 100% { ${inactive} }`,
    ].join(' ');
    return `@keyframes focus-${lineIndex}-${i} { ${kf} }`;
  }).join(' ');
}

function renderLineTextWithFocus(
  text: string,
  isHeading: boolean,
  showOVP: boolean | undefined,
  fixations: number[] | undefined,
  focusConfig: {
    lineIndex: number;
    lineDuration: number;
    isPlaying: boolean;
    focusTargets: Array<{ startChar: number; endChar: number }>;
  },
  decolorConfig?: { lineIndex: number; lineDuration: number; isPlaying: boolean },
): JSX.Element {
  const className = isHeading ? 'saccade-heading' : 'saccade-body';

  if (!text || focusConfig.focusTargets.length === 0) {
    return renderLineText(text, isHeading, showOVP, fixations, decolorConfig);
  }

  const segments: JSX.Element[] = [];
  let cursor = 0;

  for (let i = 0; i < focusConfig.focusTargets.length; i++) {
    const target = focusConfig.focusTargets[i];
    const start = Math.max(0, Math.min(text.length, target.startChar));
    const end = Math.max(start, Math.min(text.length, target.endChar));

    if (start > cursor) {
      segments.push(
        ...renderTextSliceWithFixations(
          text.slice(cursor, start),
          cursor,
          showOVP,
          fixations,
          `pre-${i}`,
          decolorConfig
        )
      );
    }

    if (end > start) {
      const targetNodes = renderTextSliceWithFixations(
        text.slice(start, end),
        start,
        showOVP,
        fixations,
        `focus-${i}`,
        decolorConfig
      );
      segments.push(
        <span
          key={`focus-wrap-${i}`}
          className="saccade-focus-target"
          style={{
            animation: `focus-${focusConfig.lineIndex}-${i} ${focusConfig.lineDuration}ms linear both`,
            animationPlayState: focusConfig.isPlaying ? 'running' : 'paused',
          }}
        >
          {targetNodes.length > 0 ? targetNodes : text.slice(start, end)}
        </span>
      );
    }

    cursor = Math.max(cursor, end);
  }

  if (cursor < text.length) {
    segments.push(
      ...renderTextSliceWithFixations(
        text.slice(cursor),
        cursor,
        showOVP,
        fixations,
        'tail',
        decolorConfig
      )
    );
  }

  return <span className={className}>{segments}</span>;
}

function renderLineText(
  text: string,
  isHeading: boolean,
  showOVP?: boolean,
  fixations?: number[],
  decolorConfig?: { lineIndex: number; lineDuration: number; isPlaying: boolean },
): JSX.Element {
  const className = isHeading ? 'saccade-heading' : 'saccade-body';

  if (!showOVP || !fixations || fixations.length === 0 || !text) {
    return <span className={className}>{text || '\u00A0'}</span>;
  }

  return (
    <span className={className}>
      {renderTextSliceWithFixations(text, 0, showOVP, fixations, 'line', decolorConfig)}
    </span>
  );
}

function renderTextSliceWithFixations(
  textSlice: string,
  offset: number,
  showOVP: boolean | undefined,
  fixations: number[] | undefined,
  keyPrefix: string,
  decolorConfig?: { lineIndex: number; lineDuration: number; isPlaying: boolean },
): JSX.Element[] {
  if (!textSlice) return [];
  if (!showOVP || !fixations || fixations.length === 0) {
    return [<span key={`${keyPrefix}-text`}>{textSlice}</span>];
  }

  const segments: JSX.Element[] = [];
  let cursor = 0;
  const sliceEnd = offset + textSlice.length;

  for (let i = 0; i < fixations.length; i++) {
    const globalIdx = fixations[i];
    if (globalIdx < offset || globalIdx >= sliceEnd) continue;

    const localIdx = globalIdx - offset;
    if (localIdx > cursor) {
      segments.push(
        <span key={`${keyPrefix}-t-${i}`}>{textSlice.slice(cursor, localIdx)}</span>
      );
    }

    if (decolorConfig) {
      const style = {
        animation: `orp-${decolorConfig.lineIndex}-${i} ${decolorConfig.lineDuration}ms linear both`,
        animationPlayState: decolorConfig.isPlaying ? 'running' as const : 'paused' as const,
      };
      segments.push(
        <span key={`${keyPrefix}-f-${i}`} className="saccade-fixation" style={style}>
          {textSlice[localIdx]}
        </span>
      );
    } else {
      segments.push(
        <span key={`${keyPrefix}-f-${i}`} className="saccade-fixation">{textSlice[localIdx]}</span>
      );
    }
    cursor = localIdx + 1;
  }

  if (cursor < textSlice.length) {
    segments.push(<span key={`${keyPrefix}-tail`}>{textSlice.slice(cursor)}</span>);
  }

  return segments;
}
