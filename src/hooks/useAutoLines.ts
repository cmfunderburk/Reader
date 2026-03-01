import { useEffect, useRef } from 'react';

const GUIDED_LINE_HEIGHT = 1.7;

export function useAutoLines(
  guidedFontSizeRem: number,
  onLinesChange: (lines: number) => void,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const prevLinesRef = useRef<number>(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const compute = () => {
      const heightPx = el.clientHeight;
      const fontSizePx = guidedFontSizeRem * 16;
      const lineHeightPx = fontSizePx * GUIDED_LINE_HEIGHT;
      const lines = Math.max(3, Math.floor(heightPx / lineHeightPx));
      if (lines !== prevLinesRef.current) {
        prevLinesRef.current = lines;
        onLinesChange(lines);
      }
    };

    compute();

    const observer = new ResizeObserver(compute);
    observer.observe(el);

    return () => observer.disconnect();
  }, [guidedFontSizeRem, onLinesChange]);

  return containerRef;
}
