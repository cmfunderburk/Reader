import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Activity, Article, SRSCard, TokenMode } from '../types';
import { App } from './App';
import { getTodayUTC } from '../lib/wikipedia';
import { resetArticleDb } from '../lib/storage';

const mockUseRSVP = vi.fn();
const mockUseKeyboard = vi.fn();
const { mockFetchDailyArticle, mockComprehensionCheck } = vi.hoisted(() => ({
  mockFetchDailyArticle: vi.fn(),
  mockComprehensionCheck: vi.fn(),
}));

vi.mock('../hooks/useRSVP', () => ({
  useRSVP: (...args: unknown[]) => mockUseRSVP(...args),
}));

vi.mock('../hooks/useKeyboard', () => ({
  useKeyboard: (...args: unknown[]) => mockUseKeyboard(...args),
}));

vi.mock('../lib/wikipedia', async () => {
  const actual = await vi.importActual<typeof import('../lib/wikipedia')>('../lib/wikipedia');
  return {
    ...actual,
    fetchDailyArticle: (...args: unknown[]) => mockFetchDailyArticle(...args),
  };
});

vi.mock('./HomeScreen', () => ({
  HomeScreen: (props: {
    onSelectActivity: (activity: Activity) => void;
    onStartComprehensionBuilder: () => void;
    onStartDaily: () => void;
    onStartSRSReview: () => void;
    onContinue?: (info: { article: Article; activity: Activity; displayMode: string }) => void;
    continueInfo?: { article: Article; activity: Activity; displayMode: string } | null;
  }) => (
    <div data-testid="home-screen">
      <button onClick={() => props.onSelectActivity('paced-reading')}>open-paced</button>
      <button onClick={() => props.onSelectActivity('active-recall')}>open-recall</button>
      <button onClick={() => props.onSelectActivity('comprehension-check')}>open-comprehension</button>
      <button onClick={props.onStartComprehensionBuilder}>build-exam</button>
      <button onClick={props.onStartDaily}>start-daily</button>
      <button onClick={props.onStartSRSReview}>start-srs-review</button>
      {props.continueInfo && props.onContinue && (
        <button onClick={() => props.onContinue!(props.continueInfo!)}>continue-session</button>
      )}
    </div>
  ),
}));

vi.mock('./ContentBrowser', () => ({
  ContentBrowser: (props: { onSelectArticle: (article: Article) => void; articles: Article[] }) => (
    <div data-testid="content-browser">
      <button onClick={() => props.onSelectArticle(props.articles[0])}>select-first</button>
    </div>
  ),
}));

vi.mock('./ArticlePreview', () => ({
  ArticlePreview: (props: { article: Article; onStart: (article: Article, wpm: number, mode: TokenMode) => void }) => (
    <div data-testid="preview-screen">
      <button onClick={() => props.onStart(props.article, 300, 'word')}>start-reading</button>
    </div>
  ),
}));

vi.mock('./Reader', () => ({
  Reader: () => <div data-testid="active-reader">reader</div>,
}));

vi.mock('./ReaderControls', () => ({
  ReaderControls: () => <div data-testid="reader-controls">controls</div>,
}));

vi.mock('./PredictionReader', () => ({
  PredictionReader: () => <div data-testid="prediction-reader">prediction</div>,
}));

vi.mock('./RecallReader', () => ({
  RecallReader: () => <div data-testid="recall-reader">recall</div>,
}));

vi.mock('./ProgressBar', () => ({
  ProgressBar: () => <div data-testid="progress-bar">progress</div>,
}));

vi.mock('./TrainingReader', () => ({
  TrainingReader: () => <div data-testid="training-reader">training</div>,
}));

vi.mock('./ComprehensionCheck', () => ({
  ComprehensionCheck: (props: { onClose: () => void }) => {
    mockComprehensionCheck(props);
    return (
      <div data-testid="comprehension-check">
        <button onClick={props.onClose}>close-comprehension</button>
      </div>
    );
  },
}));

function makeSrsCard(overrides: Partial<SRSCard> = {}): SRSCard {
  return {
    key: 'a1::what is x?',
    box: 1,
    nextDueAt: 0,
    lastReviewedAt: 0,
    createdAt: 0,
    reviewCount: 0,
    lapseCount: 0,
    status: 'active',
    prompt: 'What is X?',
    modelAnswer: 'X is Y.',
    format: 'short-answer',
    dimension: 'factual',
    articleId: 'a1',
    articleTitle: 'Article 1',
    sourceAttemptId: 'att-1',
    ...overrides,
  };
}

describe('App integration smoke', () => {
  let mockRsvp: Record<string, unknown>;

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    resetArticleDb();
    indexedDB.deleteDatabase('reader');
    localStorage.clear();
    mockFetchDailyArticle.mockReset();
    mockComprehensionCheck.mockReset();

    const article: Article = {
      id: 'a1',
      title: 'Article 1',
      content: 'Alpha beta gamma.',
      source: 'Test',
      addedAt: 1,
      readPosition: 0,
      isRead: false,
    };
    localStorage.setItem('speedread_articles', JSON.stringify([article]));

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }),
    });

    mockRsvp = {
      article: null,
      chunks: [],
      currentChunk: null,
      currentChunkIndex: 0,
      currentGuidedPage: null,
      currentGuidedPageIndex: 0,
      displayMode: 'rsvp' as const,
      effectiveWpm: 300,
      goToIndex: vi.fn(),
      handlePredictionResult: vi.fn(),
      isPlaying: false,
      linesPerPage: 12,
      loadArticle: vi.fn(),
      mode: 'word' as const,
      next: vi.fn(),
      nextPage: vi.fn(),
      pause: vi.fn(),
      play: vi.fn(),
      predictionStats: { totalWords: 0, exactMatches: 0, knownWords: 0 },
      prev: vi.fn(),
      prevPage: vi.fn(),
      rampEnabled: false,
      reset: vi.fn(),
      resetPredictionStats: vi.fn(),
      guidedPages: [],
      setDisplayMode: vi.fn(),
      setLinesPerPage: vi.fn(),
      setMode: vi.fn(),
      setRampEnabled: vi.fn(),
      setShowPacer: vi.fn(),
      setWpm: vi.fn(),
      showPacer: true,
      toggle: vi.fn(),
      wpm: 300,
      advanceSelfPaced: vi.fn(),
    };

    mockUseRSVP.mockReturnValue(mockRsvp);
    mockUseKeyboard.mockImplementation(() => {});
  });

  it('navigates home -> content-browser -> preview -> active-reader -> home', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.queryByTestId('home-screen')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'open-paced' }));
    await waitFor(() => {
      expect(screen.queryByTestId('content-browser')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'select-first' }));
    await waitFor(() => {
      expect(screen.queryByTestId('preview-screen')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'start-reading' }));
    await waitFor(() => {
      expect(screen.queryByTestId('active-reader')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    await waitFor(() => {
      expect(screen.queryByTestId('home-screen')).not.toBeNull();
    });
  });

  it('uses cached daily featured article without refetching', async () => {
    localStorage.setItem('speedread_daily_date', getTodayUTC());
    localStorage.setItem('speedread_daily_article_id', 'a1');

    render(<App />);
    await waitFor(() => {
      expect(screen.queryByTestId('home-screen')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'start-daily' }));
    await waitFor(() => {
      expect(screen.queryByTestId('active-reader')).not.toBeNull();
    });

    expect(mockFetchDailyArticle).not.toHaveBeenCalled();
    expect(mockRsvp.loadArticle).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a1' }),
      { displayMode: 'guided' }
    );
  });

  it('navigates into active recall exercise and returns home via header action', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.queryByTestId('home-screen')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'open-recall' }));
    await waitFor(() => {
      expect(screen.queryByTestId('content-browser')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'select-first' }));
    await waitFor(() => {
      expect(screen.queryByTestId('preview-screen')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'start-reading' }));
    await waitFor(() => {
      expect(screen.queryByTestId('prediction-reader')).not.toBeNull();
    });

    expect(mockRsvp.loadArticle).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a1' }),
      { displayMode: 'prediction' }
    );

    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    await waitFor(() => {
      expect(screen.queryByTestId('home-screen')).not.toBeNull();
    });
  });

  it('opens comprehension check from launcher flow and closes back home', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.queryByTestId('home-screen')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'open-comprehension' }));
    await waitFor(() => {
      expect(screen.queryByTestId('content-browser')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'select-first' }));
    await waitFor(() => {
      expect(screen.queryByTestId('comprehension-check')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'close-comprehension' }));
    await waitFor(() => {
      expect(screen.queryByTestId('home-screen')).not.toBeNull();
    });
  });

  it('keeps a fixed SRS queue for the current review session', async () => {
    localStorage.setItem('speedread_srs_pool', JSON.stringify([
      makeSrsCard({
        key: 'a1::question one?',
        prompt: 'Question One?',
      }),
      makeSrsCard({
        key: 'a1::question two?',
        prompt: 'Question Two?',
      }),
    ]));

    render(<App />);
    await waitFor(() => {
      expect(screen.queryByTestId('home-screen')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'start-srs-review' }));
    await waitFor(() => {
      expect(screen.queryByText('Question One?')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Show Answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Got It' }));

    await waitFor(() => {
      expect(screen.queryByText('Question Two?')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Show Answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Got It' }));

    await waitFor(() => {
      expect(screen.queryByText(/Reviewed: 2 cards/i)).not.toBeNull();
    });
  });

  it('records box-5 success only after graduation choice is made', async () => {
    localStorage.setItem('speedread_srs_pool', JSON.stringify([
      makeSrsCard({
        key: 'a1::box five?',
        prompt: 'Box Five?',
        box: 5,
        reviewCount: 0,
      }),
    ]));

    render(<App />);
    await waitFor(() => {
      expect(screen.queryByTestId('home-screen')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'start-srs-review' }));
    await waitFor(() => {
      expect(screen.queryByText('Box Five?')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Show Answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Got It' }));

    await waitFor(() => {
      expect(screen.queryByText(/reached Box 5/i)).not.toBeNull();
    });

    const preChoicePool = JSON.parse(localStorage.getItem('speedread_srs_pool') || '[]') as SRSCard[];
    expect(preChoicePool[0].reviewCount).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Keep Reviewing' }));

    await waitFor(() => {
      expect(screen.queryByText(/Reviewed: 1 card/i)).not.toBeNull();
    });

    const postChoicePool = JSON.parse(localStorage.getItem('speedread_srs_pool') || '[]') as SRSCard[];
    expect(postChoicePool[0].reviewCount).toBe(1);
  });

  it('resumes reading from snapshot when closing active exercise', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.queryByTestId('home-screen')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'open-recall' }));
    await waitFor(() => {
      expect(screen.queryByTestId('content-browser')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'select-first' }));
    await waitFor(() => {
      expect(screen.queryByTestId('preview-screen')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'start-reading' }));
    await waitFor(() => {
      expect(screen.queryByTestId('prediction-reader')).not.toBeNull();
    });

    localStorage.setItem('speedread_session_snapshot', JSON.stringify({
      reading: {
        articleId: 'a1',
        chunkIndex: 5,
        displayMode: 'rsvp',
      },
      training: {
        passageId: 'p1',
        mode: 'recall',
        startedAt: 1,
      },
      lastTransition: 'read-to-recall',
      updatedAt: 1,
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    await waitFor(() => {
      expect(screen.queryByTestId('active-reader')).not.toBeNull();
    });

    expect(mockRsvp.loadArticle).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'a1' }),
      { displayMode: 'rsvp' }
    );
    await waitFor(() => {
      expect(mockRsvp.goToIndex).toHaveBeenCalledWith(5);
    });

    const snapshot = JSON.parse(localStorage.getItem('speedread_session_snapshot') || '{}');
    expect(snapshot.reading).toEqual({
      articleId: 'a1',
      chunkIndex: 5,
      displayMode: 'rsvp',
    });
    expect(snapshot.lastTransition).toBe('return-to-reading');
    expect(typeof snapshot.updatedAt).toBe('number');
  });

  it('continues last training session from home', async () => {
    localStorage.setItem('speedread_settings', JSON.stringify({
      lastSession: {
        articleId: 'a1',
        activity: 'training',
        displayMode: 'training',
      },
    }));

    render(<App />);
    await waitFor(() => {
      expect(screen.queryByTestId('home-screen')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'continue-session' }));
    await waitFor(() => {
      expect(screen.queryByTestId('training-reader')).not.toBeNull();
    });

    expect(mockRsvp.loadArticle).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a1' }),
      { displayMode: 'training' }
    );
  });

  it('opens and closes the comprehension exam builder', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.queryByTestId('home-screen')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'build-exam' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Build Exam', level: 1 })).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByTestId('home-screen')).not.toBeNull();
    });
  });

  it('uses selected source order when launching exam mode', async () => {
    const articleZ: Article = {
      id: 'z',
      title: 'Zeta Source',
      content: 'Zeta content.',
      source: 'Test',
      addedAt: 1,
      readPosition: 0,
      isRead: false,
    };
    const articleA: Article = {
      id: 'a',
      title: 'Alpha Source',
      content: 'Alpha content.',
      source: 'Test',
      addedAt: 2,
      readPosition: 0,
      isRead: false,
    };
    // Intentionally persist in non-selected order to guard against array-order regressions.
    localStorage.setItem('speedread_articles', JSON.stringify([articleZ, articleA]));

    render(<App />);
    await waitFor(() => {
      expect(screen.queryByTestId('home-screen')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'build-exam' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.click(screen.getByRole('checkbox', { name: /Alpha Source/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Zeta Source/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.click(screen.getByRole('button', { name: 'Start Exam' }));
    await waitFor(() => {
      expect(screen.queryByTestId('comprehension-check')).not.toBeNull();
    });

    const lastComprehensionProps = mockComprehensionCheck.mock.calls.at(-1)?.[0] as {
      article: Article;
      sourceArticles: Article[];
      comprehension: { sourceArticleIds: string[] };
    } | undefined;
    expect(lastComprehensionProps).toBeDefined();
    expect(lastComprehensionProps?.article.id).toBe('a');
    expect(lastComprehensionProps?.sourceArticles.map((article) => article.id)).toEqual(['a', 'z']);
    expect(lastComprehensionProps?.comprehension.sourceArticleIds).toEqual(['a', 'z']);
  });

});
