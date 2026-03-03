import { useState, useReducer, useCallback, useMemo, useEffect, useRef } from 'react';
import { Reader } from './Reader';
import { ReaderControls } from './ReaderControls';
import { ProgressBar } from './ProgressBar';
import { ArticlePreview } from './ArticlePreview';
import { AddContent } from './AddContent';
import { HomeScreen } from './HomeScreen';
import { ContentBrowser } from './ContentBrowser';
import { LibrarySettings } from './LibrarySettings';
import { SettingsPanel } from './SettingsPanel';
import { PredictionReader } from './PredictionReader';
import { PredictionStats } from './PredictionStats';
import { RecallReader } from './RecallReader';
import { TrainingReader } from './TrainingReader';
import { ComprehensionCheck } from './ComprehensionCheck';
import { ComprehensionCheckBoundary } from './ComprehensionCheckBoundary';
import { ComprehensionExamBuilder } from './ComprehensionExamBuilder';
import { SRSReviewSession } from './SRSReviewSession';
import { EpubReader } from './EpubReader';
import { useRSVP } from '../hooks/useRSVP';
import { useKeyboard } from '../hooks/useKeyboard';
import { useEpubReader } from '../hooks/useEpubReader';
import { useComprehensionState } from '../hooks/useComprehensionState';
import { useAutoLines } from '../hooks/useAutoLines';
import { calculateRemainingTime, formatTime, calculateProgress } from '../lib/rsvp';
import {
  loadArticles,
  saveArticles,
  loadFeeds,
  saveFeeds,
  generateId,
  loadSettings,
  saveSettings,
  loadDailyInfo,
  saveDailyInfo,
  loadSessionSnapshot,
  saveSessionSnapshot,
  clearSessionSnapshot,
} from '../lib/storage';
import type { Settings } from '../lib/storage';
import { fetchFeed } from '../lib/feeds';
import {
  fetchDailyArticle,
  fetchRandomFeaturedArticle,
  getTodayUTC,
  isWikipediaSource,
  normalizeWikipediaContentForReader,
} from '../lib/wikipedia';
import type {
  Article,
  Feed,
  TokenMode,
  Activity,
  DisplayMode,
  GenerationDifficulty,
  GuidedPacerStyle,
  GuidedFocusTarget,
} from '../types';
import { PREDICTION_LINE_WIDTHS } from '../types';
import { measureTextMetrics } from '../lib/textMetrics';
import { formatBookName } from '../lib/libraryFormatting';
import {
  appViewStateReducer,
  getInitialViewState,
  viewStateToAction,
  type ComprehensionBuilderState,
} from '../lib/appViewState';
import {
  planCloseActiveExercise,
  planContinueSession,
  planFeaturedArticleLaunch,
  planStartReadingFromPreview,
} from '../lib/sessionTransitions';
import {
  getHeaderBackAction,
  getActiveWpmActivity,
  getHeaderTitle,
  isActiveView,
  planContentBrowserArticleSelection,
  resolveContinueSessionInfo,
  shouldShowBackButton,
} from '../lib/appViewSelectors';
import type { ViewState } from '../lib/appViewState';
import { planEscapeAction } from '../lib/appKeyboard';
import {
  getFeaturedFetchErrorMessage,
  planFeaturedFetchResult,
  resolveDailyFeaturedArticle,
} from '../lib/featuredArticleLaunch';
import {
  appendFeed,
  mergeFeedArticles,
  updateFeedLastFetched,
} from '../lib/appFeedTransitions';
import { getDueCards } from '../lib/srsScheduling';
import { clampWpm } from '../lib/wpm';
import { resolveThemePreference } from '../lib/theme';

export function App() {
  const [displaySettings, setDisplaySettings] = useState<Settings>(() => loadSettings());
  const settings = displaySettings;
  const [systemTheme, setSystemTheme] = useState<'dark' | 'light'>(() => {
    if (!window.matchMedia) return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [articles, setArticles] = useState<Article[]>([]);
  const [articlesLoaded, setArticlesLoaded] = useState(false);

  // Async article init: load from IndexedDB, run migrations, gate rendering
  useEffect(() => {
    loadArticles().then(loaded => {
      let needsUpdate = false;
      const migrated = loaded.map(article => {
        let updated = article;
        if (isWikipediaSource(updated.source)) {
          const normalized = normalizeWikipediaContentForReader(updated.content);
          if (normalized && normalized !== updated.content) {
            needsUpdate = true;
            const metrics = measureTextMetrics(normalized);
            updated = { ...updated, content: normalized, ...metrics };
          }
        }
        if (updated.charCount == null || updated.wordCount == null) {
          needsUpdate = true;
          const metrics = measureTextMetrics(updated.content);
          updated = { ...updated, ...metrics };
        }
        if (!updated.group && (updated.source === 'Wikipedia Daily' || updated.source === 'Wikipedia Featured')) {
          needsUpdate = true;
          updated = { ...updated, group: 'Wikipedia' };
        }
        return updated;
      });
      if (needsUpdate) void saveArticles(migrated);
      setArticles(migrated);
      setArticlesLoaded(true);
    });
  }, []);

  // One-time backfill: assign groups to legacy Library articles using directory metadata
  useEffect(() => {
    if (!window.library) return;
    const PREFIX = 'Library: ';
    let cancelled = false;

    (async () => {
      const sources = await window.library!.getSources();
      const filenameToGroup = new Map<string, string>();
      const listResults = await Promise.allSettled(
        sources.map((source) => window.library!.listBooks(source.path))
      );

      if (cancelled) return;

      listResults.forEach((result, index) => {
        if (result.status !== 'fulfilled') {
          const source = sources[index];
          console.warn(`Failed to backfill Library groups for source: ${source?.name ?? source?.path ?? 'unknown'}`, result.reason);
          return;
        }

        for (const item of result.value) {
          if (!item.parentDir) continue;
          filenameToGroup.set(item.name, formatBookName(item.parentDir));
        }
      });

      setArticles(prev => {
        let changed = false;
        const updated = prev.map(article => {
          if (article.group || !article.source.startsWith(PREFIX)) return article;
          changed = true;
          const filename = article.source.slice(PREFIX.length);
          const group = filenameToGroup.get(filename);
          return { ...article, source: 'Library', ...(group ? { group } : {}) };
        });
        if (changed) {
          void saveArticles(updated);
          return updated;
        }
        return prev;
      });
    })().catch((err) => {
      if (cancelled) return;
      console.warn('Library group backfill failed', err);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const [feeds, setFeeds] = useState<Feed[]>(() => loadFeeds());
  const articlesRef = useRef<Article[]>(articles);
  const [viewState, dispatchViewState] = useReducer(
    appViewStateReducer,
    window.location.search,
    getInitialViewState
  );
  const setViewState = useCallback((next: ViewState) => {
    dispatchViewState(viewStateToAction(next));
  }, []);
  const [isLoadingFeed, setIsLoadingFeed] = useState(false);
  const [dailyStatus, setDailyStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [dailyError, setDailyError] = useState<string | null>(null);
  const [randomStatus, setRandomStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [randomError, setRandomError] = useState<string | null>(null);
  const [generationMaskSeed, setGenerationMaskSeed] = useState<number>(() => Date.now());
  const [generationRevealHeld, setGenerationRevealHeld] = useState(false);
  const comp = useComprehensionState({
    comprehensionGeminiModel: settings.comprehensionGeminiModel,
  });
  const { srsCards, setSrsSessionCards } = comp;
  const epub = useEpubReader();

  const resolvedTheme = useMemo(
    () => resolveThemePreference(displaySettings.themePreference, systemTheme),
    [displaySettings.themePreference, systemTheme]
  );

  useEffect(() => {
    if (!window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light');
    };
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleChange);
      return () => media.removeEventListener('change', handleChange);
    }
    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    articlesRef.current = articles;
  }, [articles]);

  const rsvp = useRSVP({
    initialWpm: settings.wpmByActivity['paced-reading'],
    initialMode: settings.defaultMode,
    initialRampEnabled: settings.rampEnabled,
    rampCurve: settings.rampCurve,
    rampStartPercent: settings.rampStartPercent,
    rampRate: settings.rampRate,
    rampInterval: settings.rampInterval,
    guidedLength: settings.guidedLength,
    onComplete: () => {},
  });
  const readerContainerRef = useAutoLines(
    displaySettings.guidedFontSize,
    rsvp.setLinesPerPage,
  );

  const previousReadingModeRef = useRef<DisplayMode>(rsvp.displayMode);
  const previousReadingArticleIdRef = useRef<string | null>(rsvp.article?.id ?? null);

  const getActivityWpm = useCallback((activity: Activity): number => {
    return settings.wpmByActivity[activity] ?? settings.defaultWpm;
  }, [settings.defaultWpm, settings.wpmByActivity]);

  const updateDisplaySettings = useCallback((updater: (prev: Settings) => Settings) => {
    setDisplaySettings((prev) => {
      const next = updater(prev);
      if (next === prev) return prev;
      saveSettings(next);
      return next;
    });
  }, []);

  const patchDisplaySettings = useCallback((patch: Partial<Settings>) => {
    updateDisplaySettings((prev) => ({ ...prev, ...patch }));
  }, [updateDisplaySettings]);

  const setActivityWpm = useCallback((activity: Activity, nextWpm: number) => {
    const clamped = clampWpm(nextWpm);
    rsvp.setWpm(clamped);
    updateDisplaySettings((prev) => {
      const next: Settings = {
        ...prev,
        wpmByActivity: {
          ...prev.wpmByActivity,
          [activity]: clamped,
        },
      };
      if (activity === 'paced-reading') {
        next.defaultWpm = clamped;
      }
      return next;
    });
  }, [rsvp, updateDisplaySettings]);

  const syncWpmForActivity = useCallback((activity: Activity) => {
    rsvp.setWpm(getActivityWpm(activity));
  }, [getActivityWpm, rsvp]);

  const navigate = useCallback((next: ViewState) => {
    rsvp.pause();
    setViewState(next);
  }, [rsvp, setViewState]);

  const goHome = useCallback(() => {
    rsvp.pause();
    setViewState({ screen: 'home' });
  }, [rsvp, setViewState]);

  const closeActiveExercise = useCallback(() => {
    const snapshot = loadSessionSnapshot();
    const closePlan = planCloseActiveExercise(snapshot, articles, Date.now());

    if (closePlan.type === 'resume-reading') {
      syncWpmForActivity('paced-reading');
      rsvp.loadArticle(closePlan.plan.article, { displayMode: closePlan.plan.displayMode });
      setViewState({ screen: 'active-reader' });
      window.setTimeout(() => {
        rsvp.goToIndex(closePlan.plan.chunkIndex);
      }, 0);
      saveSessionSnapshot(closePlan.plan.snapshot);
      return;
    }

    if (closePlan.clearSnapshot) {
      clearSessionSnapshot();
    }

    goHome();
  }, [articles, goHome, rsvp, setViewState, syncWpmForActivity]);

  const closeActiveComprehension = useCallback(() => {
    if (viewState.screen !== 'active-comprehension') {
      goHome();
      return;
    }

    if (viewState.entryPoint === 'post-reading') {
      setViewState({ screen: 'active-reader' });
      return;
    }

    goHome();
  }, [goHome, setViewState, viewState]);

  // Keyboard shortcuts
  const activeView = isActiveView(viewState);
  const activeWpmActivity: Activity | null = getActiveWpmActivity(viewState);

  useKeyboard({
    onSpace: activeView && rsvp.displayMode !== 'prediction' && rsvp.displayMode !== 'recall' && rsvp.displayMode !== 'training'
      ? rsvp.toggle : undefined,
    onLeft: activeView ? rsvp.prev : undefined,
    onRight: activeView ? rsvp.next : undefined,
    onBracketLeft: activeView && activeWpmActivity
      ? () => setActivityWpm(activeWpmActivity, rsvp.wpm - 10)
      : undefined,
    onBracketRight: activeView && activeWpmActivity
      ? () => setActivityWpm(activeWpmActivity, rsvp.wpm + 10)
      : undefined,
    onEscape: () => {
      const escapeAction = planEscapeAction(viewState);
      if (escapeAction === 'close-active-exercise') {
        closeActiveExercise();
      } else if (escapeAction === 'close-active-comprehension') {
        closeActiveComprehension();
      } else if (escapeAction === 'close-srs-review') {
        closeSRSReview();
      } else if (escapeAction === 'go-home') {
        goHome();
      }
    },
  });

  useEffect(() => {
    const previousMode = previousReadingModeRef.current;
    const previousArticleId = previousReadingArticleIdRef.current;
    const currentArticleId = rsvp.article?.id ?? null;
    const enteringGeneration = rsvp.displayMode === 'generation'
      && (previousMode !== 'generation' || previousArticleId !== currentArticleId);

    if (enteringGeneration) {
      setGenerationMaskSeed(Date.now());
    }

    if (rsvp.displayMode !== 'generation') {
      setGenerationRevealHeld(false);
    }

    previousReadingModeRef.current = rsvp.displayMode;
    previousReadingArticleIdRef.current = currentArticleId;
  }, [rsvp.article?.id, rsvp.displayMode]);

  const toggleGenerationReveal = useCallback(() => {
    setGenerationRevealHeld(prev => !prev);
  }, []);

  // --- Article / Feed handlers (unchanged) ---

  const handleAddArticle = useCallback((article: Omit<Article, 'id' | 'addedAt' | 'readPosition' | 'isRead'>) => {
    const metrics = measureTextMetrics(article.content);
    const newArticle: Article = {
      ...article,
      ...metrics,
      id: generateId(),
      addedAt: Date.now(),
      readPosition: 0,
      isRead: false,
    };
    const updated = [...articles, newArticle];
    setArticles(updated);
    void saveArticles(updated);
    // If in content-browser stay there; if launched from add screen go home
    if (viewState.screen === 'add') {
      setViewState({ screen: 'home' });
    }
  }, [articles, setViewState, viewState.screen]);

  const handleRemoveArticle = useCallback((id: string) => {
    const updated = articles.filter(a => a.id !== id);
    setArticles(updated);
    void saveArticles(updated);
  }, [articles]);

  const handleAddFeed = useCallback(async (url: string) => {
    setIsLoadingFeed(true);
    try {
      const { feed, articles: feedArticles } = await fetchFeed(url);
      setFeeds((prevFeeds) => {
        const nextFeeds = appendFeed(prevFeeds, feed);
        saveFeeds(nextFeeds);
        return nextFeeds;
      });
      setArticles((prevArticles) => {
        const articlePlan = mergeFeedArticles(prevArticles, feedArticles);
        if (articlePlan.addedArticleCount === 0) return prevArticles;
        void saveArticles(articlePlan.nextArticles);
        return articlePlan.nextArticles;
      });
    } finally {
      setIsLoadingFeed(false);
    }
  }, []);

  const handleRemoveFeed = useCallback((id: string) => {
    const updated = feeds.filter(f => f.id !== id);
    setFeeds(updated);
    saveFeeds(updated);
  }, [feeds]);

  const handleRefreshFeed = useCallback(async (feed: Feed) => {
    setIsLoadingFeed(true);
    try {
      const { articles: feedArticles } = await fetchFeed(feed.url);
      setArticles((prevArticles) => {
        const articlePlan = mergeFeedArticles(prevArticles, feedArticles);
        if (articlePlan.addedArticleCount === 0) return prevArticles;
        void saveArticles(articlePlan.nextArticles);
        return articlePlan.nextArticles;
      });
      setFeeds((prevFeeds) => {
        const feedPlan = updateFeedLastFetched(prevFeeds, feed.id, Date.now());
        if (!feedPlan.changed) return prevFeeds;
        saveFeeds(feedPlan.nextFeeds);
        return feedPlan.nextFeeds;
      });
    } finally {
      setIsLoadingFeed(false);
    }
  }, []);

  // --- Settings handlers (unchanged) ---

  const handleSettingsChange = useCallback((newSettings: Settings) => {
    updateDisplaySettings(() => newSettings);
  }, [updateDisplaySettings]);

  const handleRampEnabledChange = useCallback((enabled: boolean) => {
    rsvp.setRampEnabled(enabled);
    patchDisplaySettings({ rampEnabled: enabled });
  }, [patchDisplaySettings, rsvp]);

  const handleAlternateColorsChange = useCallback((enabled: boolean) => {
    patchDisplaySettings({ rsvpAlternateColors: enabled });
  }, [patchDisplaySettings]);

  const handleShowORPChange = useCallback((enabled: boolean) => {
    patchDisplaySettings({ rsvpShowORP: enabled });
  }, [patchDisplaySettings]);

  const handleGuidedShowOVPChange = useCallback((enabled: boolean) => {
    patchDisplaySettings({ guidedShowOVP: enabled });
  }, [patchDisplaySettings]);

  const handleGuidedPacerStyleChange = useCallback((style: GuidedPacerStyle) => {
    patchDisplaySettings({ guidedPacerStyle: style, guidedShowSweep: style === 'sweep' });
  }, [patchDisplaySettings]);

  const handleGuidedFocusTargetChange = useCallback((target: GuidedFocusTarget) => {
    patchDisplaySettings({ guidedFocusTarget: target });
  }, [patchDisplaySettings]);

  const handleGuidedMergeShortFunctionWordsChange = useCallback((enabled: boolean) => {
    patchDisplaySettings({ guidedMergeShortFunctionWords: enabled });
  }, [patchDisplaySettings]);

  const handleGuidedLengthChange = useCallback((length: number) => {
    patchDisplaySettings({ guidedLength: length });
  }, [patchDisplaySettings]);

  const handleGenerationDifficultyChange = useCallback((difficulty: GenerationDifficulty) => {
    patchDisplaySettings({ generationDifficulty: difficulty });
  }, [patchDisplaySettings]);

  const handleGenerationSweepRevealChange = useCallback((enabled: boolean) => {
    patchDisplaySettings({ generationSweepReveal: enabled });
  }, [patchDisplaySettings]);

  const handleProgressChange = useCallback((progress: number) => {
    const newIndex = Math.floor((progress / 100) * rsvp.chunks.length);
    rsvp.goToIndex(newIndex);
  }, [rsvp]);

  // --- Navigation handlers ---

  const saveLastSession = useCallback((articleId: string, activity: Activity, displayMode: DisplayMode) => {
    patchDisplaySettings({ lastSession: { articleId, activity, displayMode } });
  }, [patchDisplaySettings]);

  const applySessionLaunchPlan = useCallback((plan: ReturnType<typeof planContinueSession>) => {
    if (plan.clearSnapshot) {
      clearSessionSnapshot();
    }
    syncWpmForActivity(plan.syncWpmActivity);
    rsvp.loadArticle(plan.article, plan.loadOptions);
    if (plan.saveLastSession) {
      saveLastSession(
        plan.saveLastSession.articleId,
        plan.saveLastSession.activity,
        plan.saveLastSession.displayMode
      );
    }
    setViewState(plan.nextView);
    if (plan.autoPlay) {
      setTimeout(() => rsvp.play(), 100);
    }
  }, [rsvp, saveLastSession, setViewState, syncWpmForActivity]);

  const handleSelectActivity = useCallback((activity: Activity) => {
    syncWpmForActivity(activity);
    navigate({ screen: 'content-browser', activity });
  }, [navigate, syncWpmForActivity]);

  const handleStartDrill = useCallback(() => {
    syncWpmForActivity('training');
    navigate({ screen: 'active-training' });
  }, [navigate, syncWpmForActivity]);

  const handleStartComprehensionFromReading = useCallback(() => {
    if (!rsvp.article) return;
    rsvp.pause();
    setViewState({
      screen: 'active-comprehension',
      article: rsvp.article,
      entryPoint: 'post-reading',
      comprehension: {
        runMode: 'quick-check',
        sourceArticleIds: [rsvp.article.id],
      },
    });
  }, [rsvp, setViewState]);

  const handleStartComprehensionBuilder = useCallback(() => {
    setViewState({ screen: 'comprehension-builder' });
  }, [setViewState]);

  const handleLaunchComprehensionBuilder = useCallback((builderState: ComprehensionBuilderState) => {
    const articleById = new Map(articles.map((article) => [article.id, article]));
    const resolvedSourceArticles = builderState.sourceArticleIds
      .map((articleId) => articleById.get(articleId))
      .filter((article): article is Article => article !== undefined);
    if (resolvedSourceArticles.length === 0) {
      setViewState({ screen: 'home' });
      return;
    }

    setViewState({
      screen: 'active-comprehension',
      article: resolvedSourceArticles[0],
      entryPoint: 'launcher',
      comprehension: {
        runMode: 'exam',
        sourceArticleIds: resolvedSourceArticles.map((article) => article.id),
        examPreset: builderState.preset,
        difficultyTarget: builderState.difficultyTarget,
        openBookSynthesis: builderState.openBookSynthesis,
      },
    });
  }, [articles, setViewState]);

  const handleStartSRSReview = useCallback(() => {
    const dueCards = getDueCards(srsCards, Date.now());
    setSrsSessionCards(dueCards.map((card) => ({ ...card })));
    setViewState({ screen: 'active-srs-review' });
  }, [setViewState, srsCards, setSrsSessionCards]);

  const closeSRSReview = useCallback(() => {
    setSrsSessionCards([]);
    goHome();
  }, [setSrsSessionCards, goHome]);

  const handleOpenEpubBuffer = useCallback(async (buffer: ArrayBuffer) => {
    await epub.loadBook(buffer);
    setViewState({ screen: 'epub-reader' });
  }, [epub, setViewState]);

  const handleOpenEpub = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.epub';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const buffer = await file.arrayBuffer();
      await handleOpenEpubBuffer(buffer);
    };
    input.click();
  }, [handleOpenEpubBuffer]);

  const launchFeaturedArticle = useCallback(async ({
    fetchArticle,
    source,
    setStatus,
    setError,
    fallbackError,
    today,
  }: {
    fetchArticle: () => Promise<{ title: string; content: string; url: string }>;
    source: 'Wikipedia Daily' | 'Wikipedia Featured';
    setStatus: (status: 'idle' | 'loading' | 'error') => void;
    setError: (message: string | null) => void;
    fallbackError: string;
    today?: string;
  }) => {
    setStatus('loading');
    setError(null);

    try {
      const { title, content, url } = await fetchArticle();
      const resultPlan = planFeaturedFetchResult({
        existingArticles: articlesRef.current,
        payload: { title, content, url },
        source,
        now: Date.now(),
        generateId,
        today,
      });
      if (resultPlan.upserted.changed) {
        articlesRef.current = resultPlan.upserted.articles;
        setArticles(resultPlan.upserted.articles);
        void saveArticles(resultPlan.upserted.articles);
      }
      const article = resultPlan.upserted.article;

      if (resultPlan.dailyInfo) {
        saveDailyInfo(resultPlan.dailyInfo.date, resultPlan.dailyInfo.articleId);
      }
      setStatus('idle');
      applySessionLaunchPlan(planFeaturedArticleLaunch(article));
    } catch (err) {
      setStatus('error');
      setError(getFeaturedFetchErrorMessage(err, fallbackError));
    }
  }, [applySessionLaunchPlan]);

  const handleStartDaily = useCallback(async () => {
    const today = getTodayUTC();

    // Check if we already fetched today's article
    const cachedDaily = resolveDailyFeaturedArticle(today, loadDailyInfo(), articlesRef.current);
    if (cachedDaily) {
      applySessionLaunchPlan(planFeaturedArticleLaunch(cachedDaily));
      return;
    }

    await launchFeaturedArticle({
      fetchArticle: fetchDailyArticle,
      source: 'Wikipedia Daily',
      setStatus: setDailyStatus,
      setError: setDailyError,
      fallbackError: 'Failed to fetch daily article',
      today,
    });
  }, [applySessionLaunchPlan, launchFeaturedArticle]);

  const handleStartRandom = useCallback(async () => {
    await launchFeaturedArticle({
      fetchArticle: fetchRandomFeaturedArticle,
      source: 'Wikipedia Featured',
      setStatus: setRandomStatus,
      setError: setRandomError,
      fallbackError: 'Failed to fetch article',
    });
  }, [launchFeaturedArticle]);

  // Content browser → article selected → preview
  const handleContentBrowserSelectArticle = useCallback((article: Article) => {
    if (viewState.screen === 'content-browser') {
      navigate(planContentBrowserArticleSelection(viewState.activity, article));
    }
  }, [viewState, navigate]);

  // Preview → start reading
  const handleStartReading = useCallback((article: Article, wpm: number, mode: TokenMode) => {
    if (viewState.screen !== 'preview') return;
    const launchPlan = planStartReadingFromPreview(viewState.activity, article, mode);
    if (!launchPlan) return;

    setActivityWpm(launchPlan.syncWpmActivity, wpm);
    applySessionLaunchPlan(launchPlan);
  }, [applySessionLaunchPlan, setActivityWpm, viewState]);

  // Continue from home screen
  const continueInfo = useMemo(() => {
    return resolveContinueSessionInfo(settings.lastSession, articles);
  }, [settings.lastSession, articles]);

  const comprehensionSummary = useMemo(() => {
    const lastAttempt = comp.comprehensionAttempts[0];
    return {
      attemptCount: comp.comprehensionAttempts.length,
      lastScore: lastAttempt?.overallScore ?? null,
    };
  }, [comp.comprehensionAttempts]);

  const srsDueCount = useMemo(() => {
    const now = Date.now();
    return srsCards.filter((c) => c.status === 'active' && c.nextDueAt <= now).length;
  }, [srsCards]);

  const srsDueCards = useMemo(() => {
    if (viewState.screen !== 'active-srs-review') return [];
    return comp.srsSessionCards;
  }, [comp.srsSessionCards, viewState.screen]);

  const activeComprehensionSourceArticles = useMemo(() => {
    if (viewState.screen !== 'active-comprehension') return [];
    if (viewState.comprehension.runMode !== 'exam') {
      return [viewState.article];
    }
    return viewState.comprehension.sourceArticleIds
      .map((articleId) => articles.find((article) => article.id === articleId))
      .filter((article): article is Article => article !== undefined);
  }, [articles, viewState]);

  const handleContinue = useCallback((info: { article: Article; activity: Activity; displayMode: DisplayMode }) => {
    applySessionLaunchPlan(planContinueSession(info));
  }, [applySessionLaunchPlan]);

  // --- Computed values ---

  const remainingTime = rsvp.chunks.length > 0
    ? formatTime(calculateRemainingTime(rsvp.chunks, rsvp.currentChunkIndex, rsvp.effectiveWpm, rsvp.mode))
    : '--:--';

  const totalWords = useMemo(
    () => rsvp.chunks.reduce((sum, c) => sum + c.wordCount, 0),
    [rsvp.chunks]
  );

  const formattedWordCount = totalWords >= 1000
    ? `${(totalWords / 1000).toFixed(1).replace(/\.0$/, '')}k`
    : `${totalWords}`;

  const progress = calculateProgress(rsvp.currentChunkIndex, rsvp.chunks.length);
  const isAtEndOfText = rsvp.chunks.length > 0 && rsvp.currentChunkIndex >= rsvp.chunks.length - 1;

  // Header title based on view
  const headerTitle = getHeaderTitle(viewState);

  const showBackButton = shouldShowBackButton(viewState);
  const headerBackAction = getHeaderBackAction(viewState);
  const appMainClassName = viewState.screen === 'active-reader' ? 'app-main app-main-active-reader' : 'app-main';

  // --- Render helpers ---

  const renderReaderControls = (allowedModes: DisplayMode[], activity: Activity) => (
    <ReaderControls
      isPlaying={rsvp.isPlaying}
      wpm={rsvp.wpm}
      mode={rsvp.mode}
      displayMode={rsvp.displayMode}
      allowedDisplayModes={allowedModes}
      showPacer={rsvp.showPacer}
      currentPageIndex={rsvp.currentGuidedPageIndex}
      totalPages={rsvp.guidedPages.length}
      onPlay={rsvp.play}
      onPause={rsvp.pause}
      onNext={rsvp.next}
      onPrev={rsvp.prev}
      onReset={rsvp.reset}
      onSkipToEnd={() => rsvp.goToIndex(rsvp.chunks.length - 1)}
      onWpmChange={(nextWpm) => setActivityWpm(activity, nextWpm)}
      onModeChange={rsvp.setMode}
      onDisplayModeChange={rsvp.setDisplayMode}
      onShowPacerChange={rsvp.setShowPacer}
      onNextPage={rsvp.nextPage}
      onPrevPage={rsvp.prevPage}
      rampEnabled={rsvp.rampEnabled}
      effectiveWpm={rsvp.effectiveWpm}
      onRampEnabledChange={handleRampEnabledChange}
      alternateColors={displaySettings.rsvpAlternateColors}
      onAlternateColorsChange={handleAlternateColorsChange}
      showORP={displaySettings.rsvpShowORP}
      onShowORPChange={handleShowORPChange}
      guidedShowOVP={displaySettings.guidedShowOVP}
      onGuidedShowOVPChange={handleGuidedShowOVPChange}
      guidedPacerStyle={displaySettings.guidedPacerStyle}
      onGuidedPacerStyleChange={handleGuidedPacerStyleChange}
      guidedFocusTarget={displaySettings.guidedFocusTarget}
      onGuidedFocusTargetChange={handleGuidedFocusTargetChange}
      guidedMergeShortFunctionWords={displaySettings.guidedMergeShortFunctionWords}
      onGuidedMergeShortFunctionWordsChange={handleGuidedMergeShortFunctionWordsChange}
      guidedLength={displaySettings.guidedLength}
      onGuidedLengthChange={handleGuidedLengthChange}
      generationDifficulty={displaySettings.generationDifficulty}
      onGenerationDifficultyChange={handleGenerationDifficultyChange}
      generationSweepReveal={displaySettings.generationSweepReveal}
      onGenerationSweepRevealChange={handleGenerationSweepRevealChange}
      generationReveal={generationRevealHeld}
      onGenerationRevealToggle={toggleGenerationReveal}
    />
  );

  const renderArticleInfo = () => (
    <div className="article-info">
      {rsvp.article ? (
        <>
          <span className="article-title">{rsvp.article.title}</span>
          <span className="article-meta">
            {rsvp.displayMode === 'prediction' || rsvp.displayMode === 'recall' ? (
              `${rsvp.article.source} • ${rsvp.currentChunkIndex} / ${rsvp.chunks.length} words`
            ) : (
              `${rsvp.article.source} • ${formattedWordCount} words • ${remainingTime} remaining • ${rsvp.effectiveWpm} WPM`
            )}
          </span>
        </>
      ) : (
        <span className="article-meta">No article loaded</span>
      )}
    </div>
  );

  if (!articlesLoaded) return null;

  return (
    <div className="app" style={{
      '--rsvp-font-size': `${displaySettings.rsvpFontSize}rem`,
      '--guided-font-size': `${displaySettings.guidedFontSize}rem`,
      '--prediction-font-size': `${displaySettings.predictionFontSize}rem`,
      '--prediction-line-width': `${PREDICTION_LINE_WIDTHS[displaySettings.predictionLineWidth]}ch`,
    } as React.CSSProperties}>
      <header className="app-header">
        <div className="app-header-left">
          {showBackButton && (
            <button
              className="control-btn app-back-btn"
              onClick={
                headerBackAction === 'close-active-exercise'
                  ? closeActiveExercise
                  : headerBackAction === 'close-active-comprehension'
                    ? closeActiveComprehension
                    : headerBackAction === 'close-srs-review'
                      ? closeSRSReview
                      : goHome
              }
            >
              Home
            </button>
          )}
          <h1>{headerTitle}</h1>
        </div>
        <button
          className="settings-gear-btn"
          onClick={() => navigate({ screen: 'settings' })}
          title="Display settings"
          aria-label="Display settings"
        >
          <svg
            className="settings-gear-icon"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M19.4 15.1a1 1 0 0 0 .2 1.1l.1.1a1.2 1.2 0 0 1 0 1.7l-1.1 1.1a1.2 1.2 0 0 1-1.7 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9v.2a1.2 1.2 0 0 1-1.2 1.2h-1.6a1.2 1.2 0 0 1-1.2-1.2v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1.2 1.2 0 0 1-1.7 0l-1.1-1.1a1.2 1.2 0 0 1 0-1.7l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6h-.2A1.2 1.2 0 0 1 2 13.9v-1.6A1.2 1.2 0 0 1 3.2 11h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1L4 9.2a1.2 1.2 0 0 1 0-1.7l1.1-1.1a1.2 1.2 0 0 1 1.7 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9v-.2A1.2 1.2 0 0 1 9.8 4h1.6a1.2 1.2 0 0 1 1.2 1.2v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1.2 1.2 0 0 1 1.7 0l1.1 1.1a1.2 1.2 0 0 1 0 1.7l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a1.2 1.2 0 0 1 1.2 1.2v1.6a1.2 1.2 0 0 1-1.2 1.2h-.2a1 1 0 0 0-.9.6Z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </header>

      <main className={appMainClassName}>
        {/* Home Screen */}
        {viewState.screen === 'home' && (
          <HomeScreen
            onSelectActivity={handleSelectActivity}
            onContinue={handleContinue}
            onStartDrill={handleStartDrill}
            onStartComprehensionBuilder={handleStartComprehensionBuilder}
            onStartDaily={handleStartDaily}
            dailyStatus={dailyStatus}
            dailyError={dailyError}
            onStartRandom={handleStartRandom}
            randomStatus={randomStatus}
            randomError={randomError}
            continueInfo={continueInfo}
            comprehensionSummary={comprehensionSummary}
            comprehensionAttempts={comp.comprehensionAttempts}
            srsDueCount={srsDueCount}
            onStartSRSReview={handleStartSRSReview}
            onOpenEpub={handleOpenEpub}
            srsCards={srsCards}
            onDeleteSRSCard={comp.handleDeleteSRSCard}
            onResetSRSCard={comp.handleResetSRSCard}
            onUpdateSRSCardStatus={comp.handleSRSCardStatusChange}
          />
        )}

        {viewState.screen === 'comprehension-builder' && (
          <ComprehensionExamBuilder
            articles={articles}
            onClose={goHome}
            onLaunch={handleLaunchComprehensionBuilder}
          />
        )}

        {/* Content Browser */}
        {viewState.screen === 'content-browser' && (
          <ContentBrowser
            activity={viewState.activity}
            articles={articles}
            currentArticleId={rsvp.article?.id}
            feeds={feeds}
            isLoadingFeed={isLoadingFeed}
            onSelectArticle={handleContentBrowserSelectArticle}
            onRemoveArticle={handleRemoveArticle}
            onAddArticle={handleAddArticle}
            onAddFeed={handleAddFeed}
            onRemoveFeed={handleRemoveFeed}
            onRefreshFeed={handleRefreshFeed}
            onOpenLibrarySettings={() => navigate({ screen: 'library-settings' })}
            onOpenEpubBuffer={handleOpenEpubBuffer}
            onBack={goHome}
          />
        )}

        {/* Article Preview */}
        {viewState.screen === 'preview' && (
          <ArticlePreview
            article={viewState.article}
            initialWpm={getActivityWpm(viewState.activity)}
            initialMode={rsvp.mode}
            onStart={handleStartReading}
            onClose={() => navigate({ screen: 'content-browser', activity: viewState.activity })}
          />
        )}

        {/* Paced Reading: RSVP / Guided */}
        {viewState.screen === 'active-reader' && (
          <>
            <div ref={readerContainerRef} className="reader-measure">
              <Reader
                chunk={rsvp.currentChunk}
                isPlaying={rsvp.isPlaying}
                displayMode={rsvp.displayMode}
                guidedPage={rsvp.currentGuidedPage}
                showPacer={rsvp.showPacer}
                wpm={rsvp.effectiveWpm}
                colorPhase={displaySettings.rsvpAlternateColors ? (rsvp.currentChunkIndex % 2 === 0 ? 'a' : 'b') : undefined}
                showORP={displaySettings.rsvpShowORP}
                guidedShowOVP={displaySettings.guidedShowOVP}
                guidedShowSweep={displaySettings.guidedShowSweep}
                guidedPacerStyle={displaySettings.guidedPacerStyle}
                guidedFocusTarget={displaySettings.guidedFocusTarget}
                guidedMergeShortFunctionWords={displaySettings.guidedMergeShortFunctionWords}
                guidedLength={displaySettings.guidedLength}
                generationDifficulty={displaySettings.generationDifficulty}
                generationSweepReveal={displaySettings.generationSweepReveal}
                generationMaskSeed={generationMaskSeed}
                generationReveal={generationRevealHeld}
              />
              {(rsvp.displayMode === 'guided' || rsvp.displayMode === 'generation') && (
                <>
                  <div
                    className="page-tap-zone page-tap-zone-prev"
                    onClick={rsvp.prevPage}
                    aria-label="Previous page"
                  />
                  <div
                    className="page-tap-zone page-tap-zone-next"
                    onClick={rsvp.nextPage}
                    aria-label="Next page"
                  />
                </>
              )}
            </div>
            <ProgressBar progress={progress} onChange={handleProgressChange} />
            {renderArticleInfo()}
            {renderReaderControls(['rsvp', 'guided', 'generation'], 'paced-reading')}
            {isAtEndOfText && (
              <div className="reader-finish-actions">
                <button className="control-btn" onClick={handleStartComprehensionFromReading}>
                  Comprehension Check
                </button>
              </div>
            )}
          </>
        )}

        {/* Active Recall: Prediction / Recall */}
        {viewState.screen === 'active-exercise' && (
          <>
            <div className="exercise-return-bar">
              <button className="control-btn" onClick={closeActiveExercise}>
                Return to Reading
              </button>
            </div>
            {rsvp.displayMode === 'recall' ? (
              <div className="recall-container">
                <PredictionStats stats={rsvp.predictionStats} />
                <RecallReader
                  pages={rsvp.guidedPages}
                  chunks={rsvp.chunks}
                  currentChunkIndex={rsvp.currentChunkIndex}
                  onAdvance={rsvp.advanceSelfPaced}
                  onPredictionResult={rsvp.handlePredictionResult}
                  onReset={rsvp.resetPredictionStats}
                  onClose={closeActiveExercise}
                  stats={rsvp.predictionStats}
                  goToIndex={rsvp.goToIndex}
                />
              </div>
            ) : (
              <div className="prediction-container">
                <PredictionStats stats={rsvp.predictionStats} />
                <PredictionReader
                  chunks={rsvp.chunks}
                  currentChunkIndex={rsvp.currentChunkIndex}
                  onAdvance={rsvp.advanceSelfPaced}
                  onPredictionResult={rsvp.handlePredictionResult}
                  onReset={rsvp.resetPredictionStats}
                  onClose={closeActiveExercise}
                  stats={rsvp.predictionStats}
                  wpm={rsvp.wpm}
                  goToIndex={rsvp.goToIndex}
                  onWpmChange={(nextWpm) => setActivityWpm('active-recall', nextWpm)}
                  previewMode={displaySettings.predictionPreviewMode}
                  previewSentenceCount={displaySettings.predictionPreviewSentenceCount}
                />
              </div>
            )}
            {renderReaderControls(['prediction', 'recall'], 'active-recall')}
          </>
        )}

        {/* Training */}
        {viewState.screen === 'active-training' && (
          <div className="training-container">
            <TrainingReader
              article={viewState.article}
              initialWpm={getActivityWpm('training')}
              guidedShowOVP={displaySettings.guidedShowOVP}
              guidedShowSweep={displaySettings.guidedShowSweep}
              guidedPacerStyle={displaySettings.guidedPacerStyle}
              guidedFocusTarget={displaySettings.guidedFocusTarget}
              guidedMergeShortFunctionWords={displaySettings.guidedMergeShortFunctionWords}
              guidedLength={displaySettings.guidedLength}
              onClose={goHome}
              onWpmChange={(nextWpm) => setActivityWpm('training', nextWpm)}
              onSelectArticle={() => navigate({ screen: 'content-browser', activity: 'training' })}
            />
          </div>
        )}

        {viewState.screen === 'active-comprehension' && (
          <ComprehensionCheckBoundary onClose={closeActiveComprehension}>
            <ComprehensionCheck
              article={viewState.article}
              entryPoint={viewState.entryPoint}
              sourceArticles={activeComprehensionSourceArticles}
              comprehension={viewState.comprehension}
              adapter={comp.comprehensionAdapter}
              onClose={closeActiveComprehension}
              onOpenSettings={() => navigate({ screen: 'settings' })}
              onAttemptSaved={comp.handleComprehensionAttemptSaved}
            />
          </ComprehensionCheckBoundary>
        )}

        {viewState.screen === 'active-srs-review' && (
          <ComprehensionCheckBoundary onClose={closeSRSReview}>
            <SRSReviewSession
              dueCards={srsDueCards}
              onCardReviewed={comp.handleSRSCardReviewed}
              onCardStatusChange={comp.handleSRSCardStatusChange}
              onClose={closeSRSReview}
            />
          </ComprehensionCheckBoundary>
        )}

        {/* EPUB Reader */}
        {viewState.screen === 'epub-reader' && (
          <EpubReader epub={epub} onBack={goHome} />
        )}

        {/* Add Article */}
        {viewState.screen === 'add' && (
          <AddContent
            onAdd={handleAddArticle}
            onClose={goHome}
          />
        )}

        {/* Settings */}
        {viewState.screen === 'settings' && (
          <SettingsPanel
            settings={displaySettings}
            onSettingsChange={handleSettingsChange}
            comprehensionApiKey={comp.comprehensionApiKey}
            comprehensionApiKeyStorageMode={comp.comprehensionApiKeyStorageMode}
            onComprehensionApiKeyChange={comp.handleComprehensionApiKeyChange}
            onClose={goHome}
          />
        )}

        {viewState.screen === 'library-settings' && (
          <LibrarySettings onClose={goHome} />
        )}
      </main>
    </div>
  );
}
