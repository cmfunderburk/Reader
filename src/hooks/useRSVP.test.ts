import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Article } from '../types';

// In-memory article store — avoids real IndexedDB which hangs under fake timers.
let memArticles: Article[] = [];
vi.mock('../lib/articleDb', () => ({
  loadArticlesFromDb: async () => [...memArticles],
  saveArticlesToDb: async (articles: Article[]) => { memArticles = [...articles]; },
  resetArticleDb: () => { memArticles = []; },
}));

import { useRSVP } from './useRSVP';
import {
  createTestArticle,
  resetIdCounter,
} from '../test/storage-helpers';

const TEST_CONTENT = 'one two three four five six seven eight nine ten';

function makeArticle(overrides: Partial<Article> = {}): Article {
  const article = createTestArticle({ content: TEST_CONTENT, ...overrides });
  memArticles = [article];
  return article;
}

async function getStoredPosition(articleId: string): Promise<number | undefined> {
  return memArticles.find(a => a.id === articleId)?.readPosition;
}

async function getStoredPredictionPosition(articleId: string): Promise<number | undefined> {
  return memArticles.find(a => a.id === articleId)?.predictionPosition;
}

beforeEach(() => {
  vi.useFakeTimers();
  memArticles = [];
  resetIdCounter();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useRSVP — load and reset', () => {
  it('loads article and produces chunks', async () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp' })
    );

    act(() => result.current.loadArticle(article));

    expect(result.current.chunks.length).toBe(10);
    expect(result.current.currentChunkIndex).toBe(0);
    expect(result.current.article).toBeTruthy();
  });

  it('defaults line-paced modes to 25 lines per page', () => {
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'guided' })
    );

    expect(result.current.linesPerPage).toBe(25);
  });

  it('resumes from saved readPosition', async () => {
    const article = makeArticle({ readPosition: 5 });

    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp' })
    );

    act(() => result.current.loadArticle(article));

    expect(result.current.currentChunkIndex).toBe(5);
  });

  it('clamps saved readPosition to last chunk', async () => {
    const article = makeArticle({ readPosition: 999 });

    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp' })
    );

    act(() => result.current.loadArticle(article));

    expect(result.current.currentChunkIndex).toBe(9); // 10 chunks, max index 9
  });

  it('reset sets index back to 0', async () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp' })
    );

    act(() => result.current.loadArticle(article));
    act(() => result.current.goToIndex(5));
    expect(result.current.currentChunkIndex).toBe(5);

    act(() => result.current.reset());
    expect(result.current.currentChunkIndex).toBe(0);
  });

  it('loadArticle options apply mode and display mode atomically', async () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'prediction' })
    );

    act(() => result.current.loadArticle(article, { mode: 'custom', displayMode: 'rsvp' }));

    expect(result.current.displayMode).toBe('rsvp');
    expect(result.current.mode).toBe('custom');
    expect(result.current.chunks.length).toBeLessThan(10);
  });

  it('prediction mode loads predictionPosition instead of readPosition', async () => {
    const article = makeArticle({ readPosition: 7, predictionPosition: 2 });
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp' })
    );

    act(() => result.current.loadArticle(article, { displayMode: 'prediction' }));

    expect(result.current.displayMode).toBe('prediction');
    expect(result.current.currentChunkIndex).toBe(2);
  });

  it('keeps index at 0 (never -1) when content tokenizes to zero chunks', async () => {
    const article = makeArticle({ content: '' });
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp' })
    );

    act(() => result.current.loadArticle(article, { displayMode: 'rsvp' }));

    expect(result.current.chunks.length).toBe(0);
    expect(result.current.currentChunkIndex).toBe(0);
  });
});

describe('useRSVP — play and pause', () => {
  it('play starts playback', async () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp', initialWpm: 600 })
    );

    act(() => result.current.loadArticle(article));
    act(() => result.current.play());

    expect(result.current.isPlaying).toBe(true);
  });

  it('pause stops playback and persists position', async () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp', initialWpm: 600 })
    );

    act(() => result.current.loadArticle(article));
    act(() => result.current.goToIndex(3));
    act(() => result.current.play());
    act(() => result.current.pause());

    expect(result.current.isPlaying).toBe(false);
    await vi.runAllTimersAsync();
    expect(await getStoredPosition(article.id)).toBe(3);
  });

  it('pause persists prediction position even when self-paced is not playing', async () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'prediction' })
    );

    act(() => result.current.loadArticle(article, { displayMode: 'prediction' }));
    act(() => result.current.advanceSelfPaced());
    act(() => result.current.advanceSelfPaced());

    act(() => result.current.pause());

    await vi.runAllTimersAsync();
    expect(await getStoredPredictionPosition(article.id)).toBe(2);
  });

  it('auto-advance moves through chunks over time', async () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp', initialWpm: 600 })
    );

    act(() => result.current.loadArticle(article));
    expect(result.current.currentChunkIndex).toBe(0);

    act(() => result.current.play());

    // At 600 WPM, each word takes ~100ms. Advance enough for a few ticks.
    act(() => vi.advanceTimersByTime(100));
    const indexAfterOneTick = result.current.currentChunkIndex;
    expect(indexAfterOneTick).toBeGreaterThanOrEqual(1);
  });

  it('toggle switches between play and pause', async () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp' })
    );

    act(() => result.current.loadArticle(article));

    act(() => result.current.toggle());
    expect(result.current.isPlaying).toBe(true);

    act(() => result.current.toggle());
    expect(result.current.isPlaying).toBe(false);
  });

  it('persists final RSVP position when playback completes', async () => {
    const article = makeArticle({ content: 'alpha beta' });
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp', initialWpm: 800 })
    );

    act(() => result.current.loadArticle(article));
    act(() => result.current.play());
    act(() => vi.advanceTimersByTime(500));

    expect(result.current.currentChunkIndex).toBe(1);
    await vi.runAllTimersAsync();
    expect(await getStoredPosition(article.id)).toBe(1);
  });

  it('does not auto-advance after switching to self-paced prediction mode', async () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp', initialWpm: 600 })
    );

    act(() => result.current.loadArticle(article));
    act(() => result.current.play());
    act(() => vi.advanceTimersByTime(100));

    act(() => result.current.setDisplayMode('prediction'));
    const indexAfterSwitch = result.current.currentChunkIndex;

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.currentChunkIndex).toBe(indexAfterSwitch);
  });
});

describe('useRSVP — goToIndex', () => {
  it('sets exact index within bounds', async () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp' })
    );

    act(() => result.current.loadArticle(article));
    act(() => result.current.goToIndex(7));

    expect(result.current.currentChunkIndex).toBe(7);
  });

  it('clamps negative index to 0', async () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp' })
    );

    act(() => result.current.loadArticle(article));
    act(() => result.current.goToIndex(-5));

    expect(result.current.currentChunkIndex).toBe(0);
  });

  it('clamps index above chunks.length - 1', async () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp' })
    );

    act(() => result.current.loadArticle(article));
    act(() => result.current.goToIndex(100));

    expect(result.current.currentChunkIndex).toBe(9); // 10 chunks
  });

  it('next/prev step by one within bounds', async () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp' })
    );

    act(() => result.current.loadArticle(article));

    act(() => result.current.next());
    expect(result.current.currentChunkIndex).toBe(1);

    act(() => result.current.next());
    expect(result.current.currentChunkIndex).toBe(2);

    act(() => result.current.prev());
    expect(result.current.currentChunkIndex).toBe(1);
  });

  it('prev does not go below 0', async () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp' })
    );

    act(() => result.current.loadArticle(article));
    act(() => result.current.prev());

    expect(result.current.currentChunkIndex).toBe(0);
  });

  it('next does not go above chunks.length - 1', async () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp' })
    );

    act(() => result.current.loadArticle(article));
    act(() => result.current.goToIndex(9));
    act(() => result.current.next());

    expect(result.current.currentChunkIndex).toBe(9);
  });
});

describe('useRSVP — guided paging', () => {
  it('nextPage/prevPage move by page with bounds', async () => {
    const longContent = Array.from({ length: 700 }, (_, i) => `word${i}`).join(' ');
    const article = makeArticle({ content: longContent });
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'guided' })
    );

    act(() => result.current.loadArticle(article, { displayMode: 'guided' }));
    act(() => result.current.setLinesPerPage(5));

    expect(result.current.guidedPages.length).toBeGreaterThan(1);
    expect(result.current.currentGuidedPageIndex).toBe(0);

    act(() => result.current.prevPage());
    expect(result.current.currentGuidedPageIndex).toBe(0);

    act(() => result.current.nextPage());
    expect(result.current.currentGuidedPageIndex).toBe(1);

    const lastPageIndex = result.current.guidedPages.length - 1;
    for (let i = 0; i < result.current.guidedPages.length + 3; i++) {
      act(() => result.current.nextPage());
    }
    expect(result.current.currentGuidedPageIndex).toBe(lastPageIndex);

    act(() => result.current.nextPage());
    expect(result.current.currentGuidedPageIndex).toBe(lastPageIndex);
  });

  it('re-paginates when linesPerPage changes and page jumps follow the new layout', async () => {
    const longContent = Array.from({ length: 700 }, (_, i) => `word${i}`).join(' ');
    const article = makeArticle({ content: longContent });
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'guided' })
    );

    act(() => result.current.loadArticle(article, { displayMode: 'guided' }));
    act(() => result.current.setLinesPerPage(5));

    const pagesAt5 = result.current.guidedPages.length;
    expect(pagesAt5).toBeGreaterThan(1);
    expect(result.current.guidedPages.every(page => page.lines.length <= 5)).toBe(true);

    act(() => result.current.setLinesPerPage(25));

    expect(result.current.guidedPages.length).toBeLessThan(pagesAt5);
    expect(result.current.guidedPages.every(page => page.lines.length <= 25)).toBe(true);

    if (result.current.guidedPages.length > 1) {
      const pageBefore = result.current.currentGuidedPageIndex;
      act(() => result.current.nextPage());
      expect(result.current.currentGuidedPageIndex).toBe(
        Math.min(pageBefore + 1, result.current.guidedPages.length - 1)
      );
    }
  });

  it('generation mode uses line pages and page navigation like guided', async () => {
    const longContent = Array.from({ length: 700 }, (_, i) => `word${i}`).join(' ');
    const article = makeArticle({ content: longContent });
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'generation' })
    );

    act(() => result.current.loadArticle(article, { displayMode: 'generation' }));
    act(() => result.current.setLinesPerPage(6));

    expect(result.current.displayMode).toBe('generation');
    expect(result.current.guidedPages.length).toBeGreaterThan(1);
    expect(result.current.currentGuidedPage).not.toBeNull();

    const firstPage = result.current.currentGuidedPageIndex;
    act(() => result.current.nextPage());
    expect(result.current.currentGuidedPageIndex).toBe(Math.min(firstPage + 1, result.current.guidedPages.length - 1));
  });
});

describe('useRSVP — advanceSelfPaced', () => {
  it('advances index by 1', async () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'prediction' })
    );

    act(() => result.current.loadArticle(article));
    act(() => result.current.advanceSelfPaced());

    expect(result.current.currentChunkIndex).toBe(1);
  });

  it('allows index to reach chunks.length (completion)', async () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'prediction' })
    );

    act(() => result.current.loadArticle(article));

    // Advance all the way through
    const total = result.current.chunks.length;
    for (let i = 0; i < total; i++) {
      act(() => result.current.advanceSelfPaced());
    }

    expect(result.current.currentChunkIndex).toBe(total); // one past end
  });

  it('does not go beyond chunks.length', async () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'prediction' })
    );

    act(() => result.current.loadArticle(article));

    const total = result.current.chunks.length;
    // Advance well past the end
    for (let i = 0; i < total + 5; i++) {
      act(() => result.current.advanceSelfPaced());
    }

    expect(result.current.currentChunkIndex).toBe(total); // capped at length
  });

  it('persists completion index clamped to chunks.length in prediction mode', async () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'prediction' })
    );

    act(() => result.current.loadArticle(article, { displayMode: 'prediction' }));

    const total = result.current.chunks.length;
    for (let i = 0; i < total + 3; i++) {
      act(() => result.current.advanceSelfPaced());
    }
    act(() => result.current.pause());

    await vi.runAllTimersAsync();
    expect(await getStoredPredictionPosition(article.id)).toBe(total);
  });
});

describe('useRSVP — mode switch retokenization', () => {
  it('switching token mode retokenizes and preserves approximate position', async () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp' })
    );

    act(() => result.current.loadArticle(article));
    const wordChunkCount = result.current.chunks.length;
    expect(wordChunkCount).toBe(10);

    // Move to middle
    act(() => result.current.goToIndex(5));

    // Switch to custom mode — fewer chunks, position should map proportionally
    act(() => result.current.setMode('custom'));

    const customChunkCount = result.current.chunks.length;
    expect(customChunkCount).toBeLessThan(wordChunkCount);
    expect(result.current.currentChunkIndex).toBeGreaterThanOrEqual(0);
    expect(result.current.currentChunkIndex).toBeLessThan(customChunkCount);
  });

  it('switching display mode to prediction uses word tokenization', async () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'custom', initialDisplayMode: 'rsvp' })
    );

    act(() => result.current.loadArticle(article));
    act(() => result.current.setDisplayMode('prediction'));

    // Prediction forces word tokenization regardless of token mode setting
    expect(result.current.chunks.length).toBe(10);
    expect(result.current.displayMode).toBe('prediction');
  });

  it('entering prediction restores saved prediction position', async () => {
    const article = makeArticle({ predictionPosition: 4 });
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp' })
    );

    act(() => result.current.loadArticle(article));
    act(() => result.current.setDisplayMode('prediction'));

    expect(result.current.currentChunkIndex).toBe(4);
  });

  it('leaving prediction saves position, re-entering restores it', async () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'prediction' })
    );

    act(() => result.current.loadArticle(article));

    // Advance in prediction mode
    act(() => result.current.advanceSelfPaced());
    act(() => result.current.advanceSelfPaced());
    act(() => result.current.advanceSelfPaced());
    expect(result.current.currentChunkIndex).toBe(3);

    // Switch to RSVP
    act(() => result.current.setDisplayMode('rsvp'));

    // Prediction position should have been saved to storage
    await vi.runAllTimersAsync();
    expect(await getStoredPredictionPosition(article.id)).toBe(3);

    // Switch back to prediction — should restore position
    act(() => result.current.setDisplayMode('prediction'));
    expect(result.current.currentChunkIndex).toBe(3);
  });

  it('entering recall mode resets to beginning', async () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp' })
    );

    act(() => result.current.loadArticle(article));
    act(() => result.current.goToIndex(5));
    act(() => result.current.setDisplayMode('recall'));

    expect(result.current.currentChunkIndex).toBe(0);
  });

  it('survives rapid display-mode transitions without breaking index bounds', async () => {
    const article = makeArticle({ content: Array.from({ length: 220 }, (_, i) => `word${i}`).join(' ') });
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp', initialWpm: 700 })
    );

    act(() => result.current.loadArticle(article));
    act(() => result.current.play());
    act(() => vi.advanceTimersByTime(150));

    act(() => {
      result.current.setDisplayMode('guided');
      result.current.setDisplayMode('prediction');
      result.current.setDisplayMode('rsvp');
      result.current.setDisplayMode('prediction');
      result.current.setDisplayMode('guided');
    });

    expect(result.current.currentChunkIndex).toBeGreaterThanOrEqual(0);
    expect(result.current.currentChunkIndex).toBeLessThanOrEqual(result.current.chunks.length);
    expect(result.current.chunks.length).toBeGreaterThan(0);
  });
});
