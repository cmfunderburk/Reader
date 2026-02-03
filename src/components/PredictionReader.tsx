import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
import type { Chunk, PredictionResult, PredictionStats } from '../types';
import { normalizedLoss, isExactMatch } from '../lib/levenshtein';
import { LossMeter } from './LossMeter';
import { PredictionComplete } from './PredictionComplete';

interface PredictionReaderProps {
  chunks: Chunk[];
  currentChunkIndex: number;
  onAdvance: () => void;
  onPredictionResult: (result: PredictionResult) => void;
  onReset: () => void;
  onClose: () => void;
  stats: PredictionStats;
  wpm: number;
  goToIndex: (index: number) => void;
}

/**
 * Core component for prediction mode reading experience.
 * Displays accumulated text with inline input for next-word prediction.
 */
function calculateWordOVP(word: string): number {
  if (word.length <= 1) return 0;
  if (word.length <= 3) return 1;
  return Math.floor(word.length * 0.35);
}

export function PredictionReader({
  chunks,
  currentChunkIndex,
  onAdvance,
  onPredictionResult,
  onReset,
  onClose,
  stats,
  wpm,
  goToIndex,
}: PredictionReaderProps) {
  const [input, setInput] = useState('');
  const [showingMiss, setShowingMiss] = useState(false);
  const [lastResult, setLastResult] = useState<PredictionResult | null>(null);

  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const previewStartIndexRef = useRef(0);
  const previewTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const textAreaRef = useRef<HTMLDivElement>(null);
  const inputContainerRef = useRef<HTMLSpanElement>(null);

  // Focus input on mount and when not showing miss or previewing
  useEffect(() => {
    if (!showingMiss && !isPreviewing) {
      inputRef.current?.focus();
    }
  }, [showingMiss, isPreviewing, currentChunkIndex]);

  // Scroll input/preview word into view when position changes
  useEffect(() => {
    if (inputContainerRef.current) {
      inputContainerRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentChunkIndex, previewIndex]);

  // Build accumulated text from completed chunks
  const accumulatedText = chunks
    .slice(0, currentChunkIndex)
    .map((chunk, i) => {
      // Handle paragraph breaks (wordCount: 0 chunks)
      if (chunk.wordCount === 0) {
        return { type: 'break' as const, key: i };
      }
      return { type: 'word' as const, text: chunk.text, key: i };
    });

  // Check if we're at the end
  const isComplete = currentChunkIndex >= chunks.length;

  // Get current word to predict (skip paragraph breaks)
  const currentChunk = chunks[currentChunkIndex];
  const isCurrentBreak = currentChunk?.wordCount === 0;

  // Auto-advance past paragraph breaks
  useEffect(() => {
    if (isCurrentBreak && !isComplete) {
      onAdvance();
    }
  }, [isCurrentBreak, isComplete, onAdvance]);

  const handleSubmit = useCallback(() => {
    if (!currentChunk || input.trim() === '' || isCurrentBreak) return;

    const actual = currentChunk.text;
    const loss = normalizedLoss(input, actual);
    const correct = isExactMatch(input, actual);

    const result: PredictionResult = {
      predicted: input.trim(),
      actual,
      loss,
      timestamp: Date.now(),
      wordIndex: currentChunkIndex,
    };

    onPredictionResult(result);

    if (correct) {
      // Correct - advance immediately (flow state)
      setInput('');
      onAdvance();
    } else {
      // Incorrect - show feedback, wait for acknowledgment
      setLastResult(result);
      setShowingMiss(true);
    }
  }, [input, currentChunk, currentChunkIndex, isCurrentBreak, onPredictionResult, onAdvance]);

  const handleContinue = useCallback(() => {
    setShowingMiss(false);
    setLastResult(null);
    setInput('');
    onAdvance();
    // Re-focus after state update
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [onAdvance]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const handleMissKeyDown = useCallback((e: globalThis.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      handleContinue();
    }
  }, [handleContinue]);

  // Global key listener for miss state
  useEffect(() => {
    if (showingMiss) {
      window.addEventListener('keydown', handleMissKeyDown);
      return () => window.removeEventListener('keydown', handleMissKeyDown);
    }
  }, [showingMiss, handleMissKeyDown]);

  // Preview mode callbacks
  const stopPreview = useCallback(() => {
    if (previewTimerRef.current) {
      clearInterval(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    goToIndex(previewStartIndexRef.current);
    setIsPreviewing(false);
    setInput('');
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [goToIndex]);

  const startPreview = useCallback(() => {
    previewStartIndexRef.current = currentChunkIndex;
    setPreviewIndex(currentChunkIndex);
    setIsPreviewing(true);
    setInput('');

    const interval = 60000 / wpm;
    previewTimerRef.current = setInterval(() => {
      setPreviewIndex((prev) => {
        let next = prev + 1;
        // Skip break chunks
        while (next < chunks.length && chunks[next].wordCount === 0) {
          next++;
        }
        if (next >= chunks.length) {
          // Reached end — stop preview
          setTimeout(() => stopPreview(), 0);
          return prev;
        }
        return next;
      });
    }, interval);
  }, [currentChunkIndex, wpm, chunks, stopPreview]);

  const togglePreview = useCallback(() => {
    if (showingMiss || isComplete) return;
    if (isPreviewing) {
      stopPreview();
    } else {
      startPreview();
    }
  }, [showingMiss, isComplete, isPreviewing, stopPreview, startPreview]);

  const resetToBeginning = useCallback(() => {
    if (previewTimerRef.current) {
      clearInterval(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    setIsPreviewing(false);
    setShowingMiss(false);
    setLastResult(null);
    setInput('');
    goToIndex(0);
    onReset();
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [goToIndex, onReset]);

  // Global key listeners for preview toggle and reset
  useEffect(() => {
    const handleGlobalKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        togglePreview();
      } else if (e.key === '`') {
        e.preventDefault();
        resetToBeginning();
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [togglePreview, resetToBeginning]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (previewTimerRef.current) {
        clearInterval(previewTimerRef.current);
      }
    };
  }, []);

  // Handle read again
  const handleReadAgain = useCallback(() => {
    onReset();
  }, [onReset]);

  if (isComplete) {
    return (
      <PredictionComplete
        stats={stats}
        onReadAgain={handleReadAgain}
        onClose={onClose}
      />
    );
  }

  // During preview, render words from previewStartIndex to previewIndex as muted preview text
  const previewChunk = isPreviewing ? chunks[previewIndex] : null;

  const renderPreviewWord = (word: string) => {
    const ovpIndex = calculateWordOVP(word);
    const before = word.slice(0, ovpIndex);
    const ovpChar = word[ovpIndex] || '';
    const after = word.slice(ovpIndex + 1);
    return (
      <>
        <span>{before}</span>
        <span className="prediction-preview-orp">{ovpChar}</span>
        <span>{after}</span>
      </>
    );
  };

  return (
    <div className="prediction-reader">
      <div className="prediction-text-area" ref={textAreaRef}>
        <span className="prediction-text">
          {accumulatedText.map((item) => {
            if (item.type === 'break') {
              return <span key={item.key} className="prediction-paragraph-break" />;
            }
            // During preview, words from previewStartIndex onward get muted styling
            const isPreviewWord = isPreviewing && item.key >= previewStartIndexRef.current;
            return (
              <span key={item.key} className={isPreviewWord ? 'prediction-preview-word' : ''}>
                {item.text}{' '}
              </span>
            );
          })}
        </span>

        {isPreviewing && (
          <>
            {/* Preview words between accumulated and current preview position */}
            <span className="prediction-text">
              {chunks.slice(currentChunkIndex, previewIndex).map((chunk, i) => {
                const idx = currentChunkIndex + i;
                if (chunk.wordCount === 0) {
                  return <span key={idx} className="prediction-paragraph-break" />;
                }
                return (
                  <span key={idx} className="prediction-preview-word">
                    {chunk.text}{' '}
                  </span>
                );
              })}
            </span>
            {/* Current preview word with ORP */}
            {previewChunk && previewChunk.wordCount > 0 && (
              <span ref={inputContainerRef} className="prediction-preview-current">
                {renderPreviewWord(previewChunk.text)}
              </span>
            )}
          </>
        )}

        {!isPreviewing && !showingMiss && !isCurrentBreak && currentChunk && (
          <span ref={inputContainerRef} className="prediction-input-container">
            {input.length === 0 && (
              <span className="prediction-hint-letter">
                {currentChunk.text.charAt(0)}
              </span>
            )}
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value.replace(/\s/g, ''))}
              onKeyDown={handleKeyDown}
              className="prediction-input-inline"
              placeholder=""
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              style={{ width: `${Math.max(1, input.length)}ch` }}
            />
          </span>
        )}

        {showingMiss && lastResult && (
          <span className="prediction-revealed">{lastResult.actual} </span>
        )}
      </div>

      {isPreviewing && (
        <div className="prediction-preview-badge">
          Tab to stop preview
        </div>
      )}

      {showingMiss && lastResult && (
        <div className="prediction-feedback">
          <LossMeter loss={lastResult.loss} />
          <div className="prediction-comparison">
            <span className="prediction-you-said">"{lastResult.predicted}"</span>
            <span className="prediction-arrow">→</span>
            <span className="prediction-actual">"{lastResult.actual}"</span>
          </div>
          <div className="prediction-continue-hint">
            Press Space to continue
          </div>
        </div>
      )}
    </div>
  );
}
