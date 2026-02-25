import { useState, useRef, useEffect, useCallback, useMemo, KeyboardEvent } from 'react';
import type { Chunk } from '../types';
import { isExactMatch, isWordKnown, isDetailWord } from '../lib/levenshtein';
import {
  applyStatsDelta,
  buildRemainingMissStats,
  collectRemainingPreviewWordKeys,
  consumeRecallTokens,
  parseNoScaffoldRecallInput,
  planScaffoldMissContinue,
  planScaffoldRecallSubmission,
} from '../lib/trainingRecall';
import type { TrainingFinalWord } from '../lib/trainingScoring';
import { MIN_WPM } from '../lib/wpm';

type TrainingPhase = 'setup' | 'reading' | 'recall' | 'feedback' | 'complete';

type WordKey = string;

interface CompletedWord {
  text: string;
  correct: boolean;
  forfeited?: boolean;
}

interface ParagraphStats {
  totalWords: number;
  exactMatches: number;
  knownWords: number;
  detailTotal: number;
  detailKnown: number;
}

function createEmptyParagraphStats(): ParagraphStats {
  return { totalWords: 0, exactMatches: 0, knownWords: 0, detailTotal: 0, detailKnown: 0 };
}

export interface UseTrainingRecallParams {
  phase: TrainingPhase;
  recallChunks: Chunk[];
  wpm: number;
  isDrill: boolean;
  showFirstLetterScaffold: boolean;
  paused: boolean;
  onFinishRecall: (stats: ParagraphStats, finalWord: TrainingFinalWord | null) => void;
}

export interface UseTrainingRecallReturn {
  // State
  recallInput: string;
  recallWordIndex: number;
  showingMiss: boolean;
  lastMissResult: { predicted: string; actual: string } | null;
  lastPreviewPenaltyCount: number;
  completedWords: Map<WordKey, CompletedWord>;
  paragraphStats: ParagraphStats;
  currentRecallChunk: Chunk | null;
  isDrillPreviewing: boolean;
  drillPreviewVisibleWordKeys: Set<WordKey>;
  drillForfeitedWordKeys: Set<WordKey>;

  // Refs
  inputRef: React.RefObject<HTMLInputElement>;
  inputContainerRef: React.RefObject<HTMLSpanElement>;

  // Handlers
  handleRecallInputChange: (value: string) => void;
  handleRecallSubmit: () => void;
  handleKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  handleMissContinue: () => void;
  handleGiveUp: () => void;
  handleTabPreviewRemaining: () => void;

  // Lifecycle
  resetRecallState: () => void;
  setParagraphStats: (stats: ParagraphStats) => void;
  snapshotPreviewPenalty: () => void;
  isChunkDetail: (chunkIndex: number) => boolean;
}

export function useTrainingRecall({
  phase,
  recallChunks,
  wpm,
  isDrill,
  showFirstLetterScaffold,
  paused,
  onFinishRecall,
}: UseTrainingRecallParams): UseTrainingRecallReturn {
  // Stable ref for the finish callback to avoid cascading callback rebuilds.
  // The parent passes a new arrow every render; this ref keeps deps stable.
  const onFinishRecallRef = useRef(onFinishRecall);
  onFinishRecallRef.current = onFinishRecall;

  // --- State ---
  const [recallInput, setRecallInput] = useState('');
  const [recallWordIndex, setRecallWordIndex] = useState(0);
  const [showingMiss, setShowingMiss] = useState(false);
  const [lastMissResult, setLastMissResult] = useState<{ predicted: string; actual: string } | null>(null);
  const [lastPreviewPenaltyCount, setLastPreviewPenaltyCount] = useState(0);
  const [drillForfeitedWordKeys, setDrillForfeitedWordKeys] = useState<Set<WordKey>>(new Set());
  const [drillPreviewWordKeys, setDrillPreviewWordKeys] = useState<WordKey[]>([]);
  const [drillPreviewVisibleCount, setDrillPreviewVisibleCount] = useState(0);
  const [completedWords, setCompletedWords] = useState<Map<WordKey, CompletedWord>>(new Map());
  const [paragraphStats, setParagraphStats] = useState<ParagraphStats>(createEmptyParagraphStats);

  // --- Refs ---
  const inputRef = useRef<HTMLInputElement>(null);
  const inputContainerRef = useRef<HTMLSpanElement>(null);
  const drillPreviewTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const drillPreviewHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Derived state ---
  const currentRecallChunk = recallChunks[recallWordIndex] ?? null;
  const isDrillPreviewing = drillPreviewWordKeys.length > 0;
  const drillPreviewVisibleWordKeys = useMemo(
    () => new Set(drillPreviewWordKeys.slice(0, drillPreviewVisibleCount)),
    [drillPreviewWordKeys, drillPreviewVisibleCount]
  );

  // --- Helpers ---
  const isChunkDetail = useCallback((chunkIndex: number) => {
    const chunk = recallChunks[chunkIndex];
    if (!chunk) return false;
    const isFirst = chunkIndex === 0 ||
      /[.?!]$/.test(recallChunks[chunkIndex - 1].text);
    return isDetailWord(chunk.text, isFirst);
  }, [recallChunks]);

  const resetRecallState = useCallback(() => {
    setRecallInput('');
    setRecallWordIndex(0);
    setShowingMiss(false);
    setLastMissResult(null);
    setCompletedWords(new Map());
    setParagraphStats(createEmptyParagraphStats());
    setDrillForfeitedWordKeys(new Set());
    setDrillPreviewWordKeys([]);
    setDrillPreviewVisibleCount(0);
    setLastPreviewPenaltyCount(0);
  }, []);

  // Snapshot drillForfeitedWordKeys.size into lastPreviewPenaltyCount
  // and clear drill preview state. Used by finishRecallPhase before
  // transitioning to the feedback phase.
  const snapshotPreviewPenalty = useCallback(() => {
    setLastPreviewPenaltyCount(drillForfeitedWordKeys.size);
    setDrillForfeitedWordKeys(new Set());
    setDrillPreviewWordKeys([]);
    setDrillPreviewVisibleCount(0);
  }, [drillForfeitedWordKeys]);

  // --- Callbacks ---
  const processRecallTokens = useCallback((tokens: string[]) => {
    if (tokens.length === 0) return false;

    const tokenPlan = consumeRecallTokens({
      tokens,
      chunks: recallChunks,
      startIndex: recallWordIndex,
      stats: paragraphStats,
      forfeitedWordKeys: drillForfeitedWordKeys,
      isWordKnown,
      isExactMatch,
      isDetailChunk: isChunkDetail,
    });

    setCompletedWords(prev => {
      const next = new Map(prev);
      for (const scored of tokenPlan.scoredWords) {
        next.set(scored.key, {
          text: scored.text,
          correct: scored.correct,
          forfeited: scored.forfeited,
        });
      }
      return next;
    });
    setParagraphStats(tokenPlan.nextStats);

    if (tokenPlan.nextIndex >= recallChunks.length) {
      setRecallWordIndex(recallChunks.length);
      onFinishRecallRef.current(tokenPlan.nextStats, null);
      return true;
    }

    setRecallWordIndex(tokenPlan.nextIndex);
    return false;
  }, [paragraphStats, recallWordIndex, recallChunks, isChunkDetail, drillForfeitedWordKeys]);

  const handleRecallInputChange = useCallback((value: string) => {
    if (isDrillPreviewing) return;
    // Scaffold mode remains single-token input (no spaces).
    if (showFirstLetterScaffold) {
      setRecallInput(value.replace(/\s/g, ''));
      return;
    }

    // No-scaffold mode: consume complete space-delimited tokens immediately.
    const { completeTokens, pendingToken } = parseNoScaffoldRecallInput(value);

    if (completeTokens.length > 0) {
      const finished = processRecallTokens(completeTokens);
      if (finished) {
        setRecallInput('');
        return;
      }
    }

    setRecallInput(pendingToken);
  }, [showFirstLetterScaffold, processRecallTokens, isDrillPreviewing]);

  const handleRecallSubmit = useCallback(() => {
    if (isDrillPreviewing) return;
    if (!currentRecallChunk || recallInput.trim() === '') return;

    // No-scaffold mode: submit current in-progress token (prediction-style flow).
    if (!showFirstLetterScaffold) {
      processRecallTokens([recallInput.trim()]);
      setRecallInput('');
      setLastMissResult(null);
      setShowingMiss(false);
      return;
    }

    const transitionPlan = planScaffoldRecallSubmission({
      predicted: recallInput.trim(),
      chunk: currentRecallChunk,
      isDrill,
      currentIndex: recallWordIndex,
      chunkCount: recallChunks.length,
      isDetail: isChunkDetail(recallWordIndex),
      isWordKnown,
      isExactMatch,
    });

    setCompletedWords(prev => new Map(prev).set(transitionPlan.completedWord.key, {
      text: transitionPlan.completedWord.text,
      correct: transitionPlan.completedWord.correct,
    }));

    if (transitionPlan.type === 'show-miss') {
      setLastMissResult(transitionPlan.missResult);
      setShowingMiss(true);
      return;
    }

    setRecallInput('');
    setLastMissResult(null);
    setShowingMiss(false);

    if (transitionPlan.type === 'finish') {
      onFinishRecallRef.current(paragraphStats, transitionPlan.finalWord);
    } else {
      setParagraphStats(prev => applyStatsDelta(prev, transitionPlan.statsDelta));
      setRecallWordIndex(transitionPlan.nextIndex);
    }
  }, [
    recallInput,
    currentRecallChunk,
    recallWordIndex,
    recallChunks,
    paragraphStats,
    isChunkDetail,
    isDrill,
    showFirstLetterScaffold,
    processRecallTokens,
    isDrillPreviewing,
  ]);

  const scoreRemainingAsMisses = useCallback(() => {
    const finalStats = buildRemainingMissStats({
      chunkCount: recallChunks.length,
      currentIndex: recallWordIndex,
      stats: paragraphStats,
      isDetailChunk: isChunkDetail,
    });
    if (!finalStats) return false;

    setRecallInput('');
    setShowingMiss(false);
    setLastMissResult(null);
    setDrillPreviewWordKeys([]);
    setDrillPreviewVisibleCount(0);
    onFinishRecallRef.current(finalStats, null);
    return true;
  }, [recallWordIndex, recallChunks.length, paragraphStats, isChunkDetail]);

  const handleGiveUp = useCallback(() => {
    scoreRemainingAsMisses();
  }, [scoreRemainingAsMisses]);

  const handleTabPreviewRemaining = useCallback(() => {
    if (isDrillPreviewing) return;
    const previewKeys: WordKey[] = collectRemainingPreviewWordKeys(recallChunks, recallWordIndex);
    if (previewKeys.length === 0) return;
    setRecallInput('');
    setShowingMiss(false);
    setLastMissResult(null);
    setDrillForfeitedWordKeys(prev => {
      const next = new Set(prev);
      for (const key of previewKeys) next.add(key);
      return next;
    });
    setDrillPreviewWordKeys(previewKeys);
    setDrillPreviewVisibleCount(0);
  }, [isDrillPreviewing, recallChunks, recallWordIndex]);

  const handleMissContinue = useCallback(() => {
    setShowingMiss(false);
    setLastMissResult(null);
    setRecallInput('');

    const transitionPlan = planScaffoldMissContinue({
      currentIndex: recallWordIndex,
      chunkCount: recallChunks.length,
      isDetail: isChunkDetail(recallWordIndex),
    });

    if (transitionPlan.type === 'finish') {
      onFinishRecallRef.current(paragraphStats, transitionPlan.finalWord);
    } else {
      setParagraphStats(prev => applyStatsDelta(prev, transitionPlan.statsDelta));
      setRecallWordIndex(transitionPlan.nextIndex);
    }
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [recallWordIndex, recallChunks.length, paragraphStats, isChunkDetail]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    // Scaffold mode keeps per-word flow (Space/Enter submit).
    // No-scaffold mode allows spaces for full-sentence typing (Enter submit).
    if (e.key === 'Tab' && isDrill && !showFirstLetterScaffold) {
      e.preventDefault();
      e.stopPropagation();
      handleTabPreviewRemaining();
      return;
    }
    const submitOnSpace = showFirstLetterScaffold;
    if (isDrillPreviewing && ((submitOnSpace && e.key === ' ') || e.key === 'Enter')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if ((submitOnSpace && e.key === ' ') || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleRecallSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleGiveUp();
    }
  }, [handleRecallSubmit, handleGiveUp, handleTabPreviewRemaining, showFirstLetterScaffold, isDrill, isDrillPreviewing]);

  // --- Effects ---

  // Focus input when entering recall phase
  useEffect(() => {
    if (phase === 'recall' && !showingMiss) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [phase, showingMiss, recallWordIndex]);

  // Scroll current word into view
  useEffect(() => {
    if (phase === 'recall' && inputContainerRef.current) {
      inputContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [phase, recallWordIndex]);

  // Random drill Tab preview: reveal remaining words at current WPM, then hide.
  useEffect(() => {
    if (drillPreviewTimerRef.current) {
      clearInterval(drillPreviewTimerRef.current);
      drillPreviewTimerRef.current = null;
    }
    if (drillPreviewHideTimerRef.current) {
      clearTimeout(drillPreviewHideTimerRef.current);
      drillPreviewHideTimerRef.current = null;
    }
    if (drillPreviewWordKeys.length === 0) {
      setDrillPreviewVisibleCount(0);
      return;
    }

    const stepMs = Math.max(80, Math.round(60000 / Math.max(MIN_WPM, wpm)));
    let shown = 0;
    setDrillPreviewVisibleCount(0);

    drillPreviewTimerRef.current = setInterval(() => {
      shown += 1;
      setDrillPreviewVisibleCount(shown);
      if (shown >= drillPreviewWordKeys.length) {
        if (drillPreviewTimerRef.current) {
          clearInterval(drillPreviewTimerRef.current);
          drillPreviewTimerRef.current = null;
        }
        drillPreviewHideTimerRef.current = setTimeout(() => {
          setDrillPreviewWordKeys([]);
          setDrillPreviewVisibleCount(0);
          drillPreviewHideTimerRef.current = null;
        }, stepMs);
      }
    }, stepMs);

    return () => {
      if (drillPreviewTimerRef.current) {
        clearInterval(drillPreviewTimerRef.current);
        drillPreviewTimerRef.current = null;
      }
      if (drillPreviewHideTimerRef.current) {
        clearTimeout(drillPreviewHideTimerRef.current);
        drillPreviewHideTimerRef.current = null;
      }
    };
  }, [drillPreviewWordKeys, wpm]);

  // Global key listener for miss state
  useEffect(() => {
    if (showingMiss) {
      const handler = (e: globalThis.KeyboardEvent) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          handleMissContinue();
        }
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }
  }, [showingMiss, handleMissContinue]);

  // Refocus input when unpausing recall
  useEffect(() => {
    if (phase === 'recall' && !paused && !showingMiss) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [phase, paused, showingMiss]);

  return {
    // State
    recallInput,
    recallWordIndex,
    showingMiss,
    lastMissResult,
    lastPreviewPenaltyCount,
    completedWords,
    paragraphStats,
    currentRecallChunk,
    isDrillPreviewing,
    drillPreviewVisibleWordKeys,
    drillForfeitedWordKeys,

    // Refs
    inputRef,
    inputContainerRef,

    // Handlers
    handleRecallInputChange,
    handleRecallSubmit,
    handleKeyDown,
    handleMissContinue,
    handleGiveUp,
    handleTabPreviewRemaining,

    // Lifecycle
    resetRecallState,
    setParagraphStats,
    snapshotPreviewPenalty,
    isChunkDetail,
  };
}
