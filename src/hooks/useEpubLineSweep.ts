import { useCallback, useEffect, useRef, useState } from 'react';

export interface LineInfo {
  firstWordIdx: number;
  lastWordIdx: number;
  charCount: number;
  offsetTop: number;
  offsetLeft: number;
  widthPx: number;
  heightPx: number;
}

export interface UseEpubLineSweepOptions {
  /** Ref to the .epub-content container */
  contentRef: React.RefObject<HTMLDivElement | null>;
  wordCount: number;
  wpm: number;
  enabled: boolean;
  /** Callback to navigate paged view to show a given pixel offset */
  scrollToOffset?: (offsetTop: number) => void;
}

export interface UseEpubLineSweepResult {
  currentLineIndex: number;
  totalLines: number;
  isPlaying: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
}

/**
 * Group word spans by their vertical position (offsetTop) into lines.
 * Uses a 2px tolerance for sub-pixel rendering differences.
 */
function computeLines(container: HTMLElement): LineInfo[] {
  const spans = container.querySelectorAll<HTMLElement>('[data-word-idx]');
  if (spans.length === 0) return [];

  const TOLERANCE = 2;
  const lines: LineInfo[] = [];
  let currentLine: {
    firstWordIdx: number;
    lastWordIdx: number;
    chars: number;
    offsetTop: number;
    minLeft: number;
    maxRight: number;
    height: number;
  } | null = null;

  for (const span of spans) {
    const idx = parseInt(span.getAttribute('data-word-idx') || '0', 10);
    const top = span.offsetTop;
    const left = span.offsetLeft;
    const right = left + span.offsetWidth;
    const height = span.offsetHeight;
    const text = span.textContent || '';

    if (currentLine === null || Math.abs(top - currentLine.offsetTop) > TOLERANCE) {
      // New line
      if (currentLine !== null) {
        lines.push({
          firstWordIdx: currentLine.firstWordIdx,
          lastWordIdx: currentLine.lastWordIdx,
          charCount: currentLine.chars,
          offsetTop: currentLine.offsetTop,
          offsetLeft: currentLine.minLeft,
          widthPx: currentLine.maxRight - currentLine.minLeft,
          heightPx: currentLine.height,
        });
      }
      currentLine = {
        firstWordIdx: idx,
        lastWordIdx: idx,
        chars: text.length,
        offsetTop: top,
        minLeft: left,
        maxRight: right,
        height: height,
      };
    } else {
      // Same line — add inter-word space + word chars
      currentLine.lastWordIdx = idx;
      currentLine.chars += 1 + text.length; // +1 for the space between words
      currentLine.minLeft = Math.min(currentLine.minLeft, left);
      currentLine.maxRight = Math.max(currentLine.maxRight, right);
      currentLine.height = Math.max(currentLine.height, height);
    }
  }

  // Push final line
  if (currentLine !== null) {
    lines.push({
      firstWordIdx: currentLine.firstWordIdx,
      lastWordIdx: currentLine.lastWordIdx,
      charCount: currentLine.chars,
      offsetTop: currentLine.offsetTop,
      offsetLeft: currentLine.minLeft,
      widthPx: currentLine.maxRight - currentLine.minLeft,
      heightPx: currentLine.height,
    });
  }

  return lines;
}

/**
 * Sweep bar pacer for EPUB reading. Moves a colored sweep bar across each
 * line of text at the configured WPM, matching the GuidedReader's sweep pattern.
 *
 * Injects DOM elements directly into the content div (since content is rendered
 * via dangerouslySetInnerHTML). Cleans up on pause/unmount/mode change.
 */
export function useEpubLineSweep({
  contentRef,
  wordCount,
  wpm,
  enabled,
  scrollToOffset,
}: UseEpubLineSweepOptions): UseEpubLineSweepResult {
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [totalLines, setTotalLines] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Refs for DOM elements we inject
  const sweepElRef = useRef<HTMLSpanElement | null>(null);
  const styleElRef = useRef<HTMLStyleElement | null>(null);
  const linesRef = useRef<LineInfo[]>([]);
  const currentLineRef = useRef(0);
  const isPlayingRef = useRef(false);
  const wpmRef = useRef(wpm);

  // Keep refs in sync
  useEffect(() => { wpmRef.current = wpm; }, [wpm]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { currentLineRef.current = currentLineIndex; }, [currentLineIndex]);

  // Clean up injected DOM elements
  const cleanup = useCallback(() => {
    if (sweepElRef.current) {
      sweepElRef.current.remove();
      sweepElRef.current = null;
    }
    if (styleElRef.current) {
      styleElRef.current.remove();
      styleElRef.current = null;
    }
  }, []);

  // Compute lines when content changes
  useEffect(() => {
    if (!enabled || !contentRef.current || wordCount === 0) {
      linesRef.current = [];
      setTotalLines(0);
      return;
    }

    // Wait a frame for DOM to settle after dangerouslySetInnerHTML
    const frame = requestAnimationFrame(() => {
      if (!contentRef.current) return;
      const lines = computeLines(contentRef.current);
      linesRef.current = lines;
      setTotalLines(lines.length);
    });

    return () => cancelAnimationFrame(frame);
  }, [enabled, contentRef, wordCount]);

  // Reset when chapter changes (wordCount changes)
  useEffect(() => {
    cleanup();
    setCurrentLineIndex(0);
    setIsPlaying(false);
    currentLineRef.current = 0;
    isPlayingRef.current = false;
  }, [wordCount, cleanup]);

  // Render the sweep bar for the current line
  const renderSweep = useCallback((lineIdx: number) => {
    const container = contentRef.current;
    if (!container) return;

    const lines = linesRef.current;
    if (lineIdx < 0 || lineIdx >= lines.length) return;

    // Clean up previous sweep
    cleanup();

    const line = lines[lineIdx];
    const currentWpm = wpmRef.current;
    const duration = (line.charCount / 5) * (60000 / currentWpm);

    // Create style element with keyframe
    const styleEl = document.createElement('style');
    styleEl.textContent = `@keyframes epub-sweep-${lineIdx} { from { width: 0px; } to { width: ${line.widthPx}px; } }`;
    container.appendChild(styleEl);
    styleElRef.current = styleEl;

    // Create sweep element
    const sweep = document.createElement('span');
    sweep.className = 'epub-sweep';
    sweep.style.position = 'absolute';
    sweep.style.top = `${line.offsetTop}px`;
    sweep.style.left = `${line.offsetLeft}px`;
    sweep.style.height = `${line.heightPx}px`;
    sweep.style.width = '0';
    sweep.style.background = 'var(--guided-sweep-color)';
    sweep.style.pointerEvents = 'none';
    sweep.style.animation = `epub-sweep-${lineIdx} ${duration}ms linear both`;

    // Listen for animation end to advance to next line
    sweep.addEventListener('animationend', () => {
      if (!isPlayingRef.current) return;

      const nextLine = currentLineRef.current + 1;
      if (nextLine >= linesRef.current.length) {
        // Reached the end
        cleanup();
        setIsPlaying(false);
        isPlayingRef.current = false;
        return;
      }

      setCurrentLineIndex(nextLine);
      currentLineRef.current = nextLine;

      // Scroll to keep the next line visible
      const nextLineInfo = linesRef.current[nextLine];
      if (nextLineInfo && scrollToOffset) {
        scrollToOffset(nextLineInfo.offsetTop);
      } else if (nextLineInfo && container) {
        // Scroll mode: scroll the container to keep the line visible
        const firstSpan = container.querySelector(`[data-word-idx="${nextLineInfo.firstWordIdx}"]`);
        if (firstSpan) {
          firstSpan.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }

      // Render sweep for next line
      renderSweep(nextLine);
    });

    container.appendChild(sweep);
    sweepElRef.current = sweep;

    // Scroll to current line
    if (scrollToOffset) {
      scrollToOffset(line.offsetTop);
    } else {
      const firstSpan = container.querySelector(`[data-word-idx="${line.firstWordIdx}"]`);
      if (firstSpan) {
        firstSpan.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
  }, [contentRef, cleanup, scrollToOffset]);

  // Start/stop sweep rendering based on play state
  useEffect(() => {
    if (!enabled) {
      cleanup();
      return;
    }

    if (isPlaying && linesRef.current.length > 0) {
      renderSweep(currentLineRef.current);
    } else {
      cleanup();
    }

    return cleanup;
  }, [isPlaying, enabled, cleanup, renderSweep]);

  // Handle WPM changes while playing — restart current line animation
  useEffect(() => {
    if (!isPlaying || !enabled) return;
    // Re-render sweep with new WPM timing
    renderSweep(currentLineRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-render on wpm change while playing
  }, [wpm]);

  const play = useCallback(() => {
    if (!enabled || linesRef.current.length === 0) return;
    // If at end, restart from beginning
    if (currentLineRef.current >= linesRef.current.length) {
      setCurrentLineIndex(0);
      currentLineRef.current = 0;
    }
    setIsPlaying(true);
    isPlayingRef.current = true;
  }, [enabled]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    cleanup();
  }, [cleanup]);

  const toggle = useCallback(() => {
    if (isPlayingRef.current) {
      pause();
    } else {
      play();
    }
  }, [pause, play]);

  // Clean up on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    currentLineIndex,
    totalLines,
    isPlaying,
    play,
    pause,
    toggle,
  };
}
