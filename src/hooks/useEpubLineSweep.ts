import { useCallback, useEffect, useRef, useState } from 'react';

export interface LineInfo {
  charCount: number;
  offsetTop: number;
  offsetLeft: number;
  widthPx: number;
  heightPx: number;
}

export interface UseEpubLineSweepOptions {
  /** Ref to the .epub-content container */
  contentRef: React.RefObject<HTMLDivElement | null>;
  /** Change-detection signal (e.g. chapter index) — recompute lines when this changes */
  chapterKey: number;
  wpm: number;
  enabled: boolean;
  /** View mode — recompute lines when layout changes between paged/scroll */
  viewMode?: string;
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
 * Group text into visual lines using Range.getClientRects() on text nodes.
 * No word spans needed — walks text nodes via TreeWalker.
 */
function computeLinesFromTextNodes(container: HTMLElement): LineInfo[] {
  const containerRect = container.getBoundingClientRect();
  const TOLERANCE = 3;
  const range = document.createRange();
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);

  const rawRects: { top: number; left: number; width: number; height: number; charCount: number }[] = [];

  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const text = node.textContent || '';
    if (!text.trim()) continue;

    range.selectNodeContents(node);
    const rects = range.getClientRects();
    if (rects.length === 0) continue;

    // Distribute text length across rects proportional to width
    let totalWidth = 0;
    for (const rect of rects) totalWidth += rect.width;

    for (const rect of rects) {
      if (rect.width === 0 && rect.height === 0) continue;
      const charCount = totalWidth > 0
        ? Math.round((rect.width / totalWidth) * text.length)
        : text.length;
      rawRects.push({
        top: rect.top - containerRect.top + container.scrollTop,
        left: rect.left - containerRect.left + container.scrollLeft,
        width: rect.width,
        height: rect.height,
        charCount,
      });
    }
  }

  if (rawRects.length === 0) return [];

  // Group rects by offsetTop with tolerance, merge into LineInfo entries
  const lines: LineInfo[] = [];
  let current = {
    charCount: rawRects[0].charCount,
    offsetTop: rawRects[0].top,
    minLeft: rawRects[0].left,
    maxRight: rawRects[0].left + rawRects[0].width,
    height: rawRects[0].height,
  };

  for (let i = 1; i < rawRects.length; i++) {
    const r = rawRects[i];
    if (Math.abs(r.top - current.offsetTop) <= TOLERANCE) {
      // Same line
      current.charCount += r.charCount;
      current.minLeft = Math.min(current.minLeft, r.left);
      current.maxRight = Math.max(current.maxRight, r.left + r.width);
      current.height = Math.max(current.height, r.height);
    } else {
      // New line
      lines.push({
        charCount: current.charCount,
        offsetTop: current.offsetTop,
        offsetLeft: current.minLeft,
        widthPx: current.maxRight - current.minLeft,
        heightPx: current.height,
      });
      current = {
        charCount: r.charCount,
        offsetTop: r.top,
        minLeft: r.left,
        maxRight: r.left + r.width,
        height: r.height,
      };
    }
  }

  // Push final line
  lines.push({
    charCount: current.charCount,
    offsetTop: current.offsetTop,
    offsetLeft: current.minLeft,
    widthPx: current.maxRight - current.minLeft,
    heightPx: current.height,
  });

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
  chapterKey,
  wpm,
  enabled,
  viewMode,
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
    if (!enabled || !contentRef.current || !contentRef.current.textContent?.trim()) {
      linesRef.current = [];
      setTotalLines(0);
      return;
    }

    // Wait a frame for DOM to settle after dangerouslySetInnerHTML
    const frame = requestAnimationFrame(() => {
      if (!contentRef.current) return;
      const lines = computeLinesFromTextNodes(contentRef.current);
      linesRef.current = lines;
      setTotalLines(lines.length);
    });

    return () => cancelAnimationFrame(frame);
  }, [enabled, contentRef, chapterKey, viewMode]);

  // Reset when chapter or layout changes
  useEffect(() => {
    cleanup();
    setCurrentLineIndex(0);
    setIsPlaying(false);
    currentLineRef.current = 0;
    isPlayingRef.current = false;
  }, [chapterKey, viewMode, cleanup]);

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
        // Scroll mode: scroll the container to center the line
        container.scrollTop = nextLineInfo.offsetTop - container.clientHeight / 2;
      }

      // Render sweep for next line
      renderSweep(nextLine);
    });

    container.appendChild(sweep);
    sweepElRef.current = sweep;

    // Scroll to current line
    if (scrollToOffset) {
      scrollToOffset(line.offsetTop);
    } else if (container) {
      container.scrollTop = line.offsetTop - container.clientHeight / 2;
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
