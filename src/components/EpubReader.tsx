import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { UseEpubReaderResult, EpubReadingMode } from '../hooks/useEpubReader';
import type { GenerationDifficulty } from '../types';
import { useEpubPacer } from '../hooks/useEpubPacer';
import { selectMaskedWords } from '../lib/epubGenerationMask';

interface EpubReaderProps {
  epub: UseEpubReaderResult;
  onBack: () => void;
}

const MODE_LABELS: Record<EpubReadingMode, string> = {
  browse: 'Browse',
  pacer: 'Pacer',
  generation: 'Generation',
};

const DIFFICULTY_LABELS: Record<GenerationDifficulty, string> = {
  normal: 'Normal',
  hard: 'Hard',
  recall: 'Recall',
};

const DEFAULT_PACER_WPM = 300;
const MIN_PACER_WPM = 100;
const MAX_PACER_WPM = 900;
const WPM_STEP = 50;

export function EpubReader({ epub, onBack }: EpubReaderProps) {
  const [showTOC, setShowTOC] = useState(false);
  const [pacerWpm, setPacerWpm] = useState(DEFAULT_PACER_WPM);
  const [generationDifficulty, setGenerationDifficulty] = useState<GenerationDifficulty>('normal');
  const [revealed, setRevealed] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const prevHighlightRef = useRef<Element | null>(null);

  const isPacerMode = epub.mode === 'pacer';
  const isGenerationMode = epub.mode === 'generation';

  const pacer = useEpubPacer({
    wordCount: epub.wordCount,
    wpm: pacerWpm,
    enabled: isPacerMode,
  });

  // Deterministic seed from chapter index (changes per chapter)
  const maskSeed = epub.currentChapterIndex * 31337 + 42;

  // Compute masked word indices
  const maskedIndices = useMemo(() => {
    if (!isGenerationMode || epub.words.length === 0) return new Set<number>();
    return selectMaskedWords(epub.words, generationDifficulty, maskSeed);
  }, [isGenerationMode, epub.words, generationDifficulty, maskSeed]);

  // Reset revealed state when chapter or difficulty changes
  useEffect(() => {
    setRevealed(false);
  }, [epub.currentChapterIndex, generationDifficulty]);

  // Apply/remove highlight class on the current word span (pacer mode)
  useEffect(() => {
    if (!isPacerMode || !contentRef.current) {
      // Clean up any lingering highlight when leaving pacer mode
      if (prevHighlightRef.current) {
        prevHighlightRef.current.classList.remove('epub-word-highlight');
        prevHighlightRef.current = null;
      }
      return;
    }

    // Remove previous highlight
    if (prevHighlightRef.current) {
      prevHighlightRef.current.classList.remove('epub-word-highlight');
      prevHighlightRef.current = null;
    }

    // Apply new highlight
    const span = contentRef.current.querySelector(
      `[data-word-idx="${pacer.currentWordIndex}"]`
    );
    if (span) {
      span.classList.add('epub-word-highlight');
      prevHighlightRef.current = span;

      // Auto-scroll to keep highlighted word visible
      span.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [isPacerMode, pacer.currentWordIndex]);

  // Apply/remove masked class on masked word spans (generation mode)
  useEffect(() => {
    if (!contentRef.current) return;

    const container = contentRef.current;

    if (!isGenerationMode) {
      // Clean up all masked classes when leaving generation mode
      const maskedSpans = container.querySelectorAll('.epub-word-masked');
      maskedSpans.forEach(span => {
        span.classList.remove('epub-word-masked', 'revealed');
      });
      return;
    }

    // First, clear any existing masked/revealed classes
    const allMasked = container.querySelectorAll('.epub-word-masked');
    allMasked.forEach(span => {
      span.classList.remove('epub-word-masked', 'revealed');
    });

    // Apply masked class to selected word indices
    maskedIndices.forEach(idx => {
      const span = container.querySelector(`[data-word-idx="${idx}"]`);
      if (span) {
        span.classList.add('epub-word-masked');
        if (revealed) {
          span.classList.add('revealed');
        }
      }
    });
  }, [isGenerationMode, maskedIndices, revealed]);

  const handleWpmChange = useCallback((delta: number) => {
    setPacerWpm(prev => Math.max(MIN_PACER_WPM, Math.min(MAX_PACER_WPM, prev + delta)));
  }, []);

  if (epub.isLoading) {
    return (
      <div className="epub-reader">
        <div className="epub-loading">Loading EPUB...</div>
      </div>
    );
  }

  if (epub.error) {
    return (
      <div className="epub-reader">
        <div className="epub-error">
          <p>Failed to load EPUB: {epub.error}</p>
          <button className="control-btn" onClick={onBack}>Go Back</button>
        </div>
      </div>
    );
  }

  if (!epub.book) {
    return (
      <div className="epub-reader">
        <div className="epub-error">
          <p>No book loaded.</p>
          <button className="control-btn" onClick={onBack}>Go Back</button>
        </div>
      </div>
    );
  }

  const { book, currentChapterIndex, annotatedHtml } = epub;

  return (
    <div className="epub-reader">
      <div className="epub-toolbar">
        <button className="epub-toolbar-btn" onClick={onBack} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="epub-toolbar-title">{book.title}</h1>
        <button
          className="epub-toolbar-btn"
          onClick={() => setShowTOC(prev => !prev)}
          aria-label="Table of contents"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>

      {showTOC && (
        <div className="epub-toc">
          <h2 className="epub-toc-heading">Chapters</h2>
          <ul>
            {book.chapters.map((chapter, index) => (
              <li key={chapter.id}>
                <button
                  className={`epub-toc-item${index === currentChapterIndex ? ' active' : ''}`}
                  onClick={() => {
                    epub.goToChapter(index);
                    setShowTOC(false);
                  }}
                >
                  {chapter.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div
        ref={contentRef}
        className="epub-content"
        dangerouslySetInnerHTML={{ __html: annotatedHtml }}
      />

      {isPacerMode && (
        <div className="epub-pacer-controls">
          <button
            className="control-btn"
            onClick={() => handleWpmChange(-WPM_STEP)}
            disabled={pacerWpm <= MIN_PACER_WPM}
            aria-label="Decrease WPM"
          >
            -
          </button>
          <span className="epub-pacer-wpm">{pacerWpm} WPM</span>
          <button
            className="control-btn"
            onClick={() => handleWpmChange(WPM_STEP)}
            disabled={pacerWpm >= MAX_PACER_WPM}
            aria-label="Increase WPM"
          >
            +
          </button>
          <button
            className="control-btn epub-pacer-play"
            onClick={pacer.toggle}
            aria-label={pacer.isPlaying ? 'Pause' : 'Play'}
          >
            {pacer.isPlaying ? 'Pause' : 'Play'}
          </button>
        </div>
      )}

      {isGenerationMode && (
        <div className="epub-generation-controls">
          {(Object.keys(DIFFICULTY_LABELS) as GenerationDifficulty[]).map(d => (
            <button
              key={d}
              className={`control-btn${generationDifficulty === d ? ' active' : ''}`}
              onClick={() => setGenerationDifficulty(d)}
            >
              {DIFFICULTY_LABELS[d]}
            </button>
          ))}
          <button
            className="control-btn"
            onClick={() => setRevealed(prev => !prev)}
          >
            {revealed ? 'Hide' : 'Reveal'}
          </button>
        </div>
      )}

      <div className="epub-controls">
        <button
          className="control-btn"
          onClick={epub.prevChapter}
          disabled={currentChapterIndex === 0}
        >
          Prev
        </button>
        <span className="epub-controls-position">
          {currentChapterIndex + 1} / {book.chapters.length}
        </span>
        <button
          className="control-btn"
          onClick={epub.nextChapter}
          disabled={currentChapterIndex === book.chapters.length - 1}
        >
          Next
        </button>
      </div>

      <div className="epub-mode-controls">
        {(Object.keys(MODE_LABELS) as EpubReadingMode[]).map(m => (
          <button
            key={m}
            className={`control-btn${epub.mode === m ? ' active' : ''}`}
            onClick={() => epub.setMode(m)}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>
    </div>
  );
}
