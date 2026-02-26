import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEpubPacer } from './useEpubPacer';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('useEpubPacer', () => {
  it('starts at word index 0', () => {
    const { result } = renderHook(() =>
      useEpubPacer({ wordCount: 100, wpm: 300, enabled: true })
    );
    expect(result.current.currentWordIndex).toBe(0);
    expect(result.current.isPlaying).toBe(false);
  });

  it('advances word index at WPM rate', () => {
    const { result } = renderHook(() =>
      useEpubPacer({ wordCount: 100, wpm: 300, enabled: true })
    );
    act(() => result.current.play());
    // At 300 WPM = 200ms per word. After 200ms, should be at index 1
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.currentWordIndex).toBe(1);
  });

  it('stops at end of content', () => {
    const { result } = renderHook(() =>
      useEpubPacer({ wordCount: 3, wpm: 300, enabled: true })
    );
    act(() => result.current.play());
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.currentWordIndex).toBe(2); // last word
    expect(result.current.isPlaying).toBe(false);
  });

  it('pause and resume work', () => {
    const { result } = renderHook(() =>
      useEpubPacer({ wordCount: 100, wpm: 300, enabled: true })
    );
    act(() => result.current.play());
    act(() => { vi.advanceTimersByTime(400); }); // 2 words
    act(() => result.current.pause());
    const paused = result.current.currentWordIndex;
    act(() => { vi.advanceTimersByTime(1000); }); // no change
    expect(result.current.currentWordIndex).toBe(paused);
  });

  it('seek sets word index', () => {
    const { result } = renderHook(() =>
      useEpubPacer({ wordCount: 100, wpm: 300, enabled: true })
    );
    act(() => result.current.seek(50));
    expect(result.current.currentWordIndex).toBe(50);
  });

  it('resets when wordCount changes', () => {
    const { result, rerender } = renderHook(
      (props) => useEpubPacer(props),
      { initialProps: { wordCount: 100, wpm: 300, enabled: true } }
    );
    act(() => result.current.play());
    act(() => { vi.advanceTimersByTime(600); }); // 3 words
    expect(result.current.currentWordIndex).toBe(3);

    // Change wordCount (new chapter)
    rerender({ wordCount: 50, wpm: 300, enabled: true });
    expect(result.current.currentWordIndex).toBe(0);
    expect(result.current.isPlaying).toBe(false);
  });

  it('clamps seek to valid range', () => {
    const { result } = renderHook(() =>
      useEpubPacer({ wordCount: 10, wpm: 300, enabled: true })
    );
    act(() => result.current.seek(999));
    expect(result.current.currentWordIndex).toBe(9);
    act(() => result.current.seek(-5));
    expect(result.current.currentWordIndex).toBe(0);
  });

  it('does nothing when disabled', () => {
    const { result } = renderHook(() =>
      useEpubPacer({ wordCount: 100, wpm: 300, enabled: false })
    );
    act(() => result.current.play());
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.currentWordIndex).toBe(0);
    expect(result.current.isPlaying).toBe(false);
  });

  it('toggle toggles play state', () => {
    const { result } = renderHook(() =>
      useEpubPacer({ wordCount: 100, wpm: 300, enabled: true })
    );
    act(() => result.current.toggle());
    expect(result.current.isPlaying).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.isPlaying).toBe(false);
  });
});
