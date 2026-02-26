import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { UseEpubReaderResult, EpubReadingMode } from '../hooks/useEpubReader';
import type { GenerationDifficulty } from '../types';
import { useEpubLineSweep } from '../hooks/useEpubLineSweep';
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
  const containerRef = useRef<HTMLDivElement>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [contentHeight, setContentHeight] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const isPaged = epub.viewMode === 'paged';

  const isPacerMode = epub.mode === 'pacer';
  const isGenerationMode = epub.mode === 'generation';

  // In paged mode, scroll to a given pixel offset by navigating to the right page
  const scrollToOffset = useCallback((offsetTop: number) => {
    if (!isPaged || !contentRef.current) return;
    // In paged (CSS columns) mode, content flows horizontally.
    // Find which page contains this vertical offset by checking the
    // element at that position. For simplicity, we locate the word span
    // nearest the offset and read its offsetLeft to determine the page.
    const el = contentRef.current;
    const pageWidth = el.clientWidth;
    if (pageWidth <= 0) return;

    // In CSS columns, offsetLeft of children tells us which column they're in
    // We need to find a word span near this offsetTop
    const spans = el.querySelectorAll<HTMLElement>('[data-word-idx]');
    let targetLeft = 0;
    for (const span of spans) {
      if (Math.abs(span.offsetTop - offsetTop) < 4) {
        targetLeft = span.offsetLeft;
        break;
      }
    }
    const page = Math.floor(targetLeft / pageWidth);
    const clamped = Math.max(0, Math.min(page, totalPages - 1));
    setCurrentPage(clamped);
    el.scrollTo({ left: clamped * pageWidth, behavior: 'instant' as ScrollBehavior });
  }, [isPaged, totalPages]);

  const sweep = useEpubLineSweep({
    contentRef,
    wordCount: epub.wordCount,
    wpm: pacerWpm,
    enabled: isPacerMode,
    scrollToOffset: isPaged ? scrollToOffset : undefined,
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

  // Measure pages after content renders or on resize (paged mode only)
  const measurePages = useCallback(() => {
    const el = contentRef.current;
    const container = containerRef.current;
    if (!el || !container || !isPaged) return;

    // Compute available height: container height minus non-content elements
    // The container is a flex column; the content div has flex:1
    // We measure the actual available space by looking at the content element's client area
    const containerRect = container.getBoundingClientRect();

    // Sum up heights of all non-content children (toolbar, toc, controls, etc.)
    let nonContentHeight = 0;
    for (const child of Array.from(container.children)) {
      if (child !== el) {
        nonContentHeight += (child as HTMLElement).getBoundingClientRect().height;
      }
    }

    const availableHeight = Math.floor(containerRect.height - nonContentHeight);
    const availableWidth = el.clientWidth;

    if (availableHeight <= 0 || availableWidth <= 0) return;

    setContentHeight(availableHeight);
    setContentWidth(availableWidth);

    // After setting dimensions, we need to measure in the next frame
    // when the CSS columns have been applied with the new dimensions
    requestAnimationFrame(() => {
      if (!el) return;
      const pages = Math.max(1, Math.round(el.scrollWidth / el.clientWidth));
      setTotalPages(pages);
    });
  }, [isPaged]);

  // Run measurement when content changes or view mode switches
  useEffect(() => {
    if (!isPaged) return;
    // Use rAF to ensure DOM has rendered the HTML
    const frame = requestAnimationFrame(() => {
      measurePages();
    });
    return () => cancelAnimationFrame(frame);
  }, [isPaged, epub.annotatedHtml, measurePages]);

  // ResizeObserver on the container to recompute on window resize
  useEffect(() => {
    if (!isPaged || !containerRef.current) return;
    const observer = new ResizeObserver(() => {
      measurePages();
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isPaged, measurePages]);

  // Reset page on chapter change
  useEffect(() => {
    setCurrentPage(0);
  }, [epub.currentChapterIndex]);

  // Reset page when switching to paged mode
  useEffect(() => {
    if (isPaged) {
      setCurrentPage(0);
    }
  }, [isPaged]);

  // Page navigation
  const goToPage = useCallback((page: number) => {
    const clamped = Math.max(0, Math.min(page, totalPages - 1));
    setCurrentPage(clamped);
    if (contentRef.current) {
      contentRef.current.scrollTo({ left: clamped * contentRef.current.clientWidth, behavior: 'instant' as ScrollBehavior });
    }
  }, [totalPages]);

  const nextPage = useCallback(() => {
    goToPage(currentPage + 1);
  }, [goToPage, currentPage]);

  const prevPage = useCallback(() => {
    goToPage(currentPage - 1);
  }, [goToPage, currentPage]);

  // Keyboard handler for page turns (paged mode, browse only)
  useEffect(() => {
    if (!isPaged) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { nextPage(); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { prevPage(); e.preventDefault(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isPaged, nextPage, prevPage]);

  // Click zones for page turns (left third = prev, right third = next)
  const handleContentClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPaged) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const third = rect.width / 3;
    if (x < third) prevPage();
    else if (x > third * 2) nextPage();
  }, [isPaged, prevPage, nextPage]);

  // Touch swipe for page turns
  const touchStartRef = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartRef.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartRef.current;
    touchStartRef.current = null;
    if (Math.abs(delta) < 50) return;
    if (delta < 0) nextPage();
    else prevPage();
  }, [nextPage, prevPage]);

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
    <div className="epub-reader" ref={containerRef}>
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
        className={`epub-content${isPaged ? ' paged' : ''}`}
        style={isPaged && contentHeight > 0 ? { height: `${contentHeight}px`, columnWidth: `${contentWidth}px` } : undefined}
        onClick={handleContentClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
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
            onClick={sweep.toggle}
            aria-label={sweep.isPlaying ? 'Pause' : 'Play'}
          >
            {sweep.isPlaying ? 'Pause' : 'Play'}
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
          {isPaged
            ? `${currentPage + 1} / ${totalPages}`
            : `${currentChapterIndex + 1} / ${book.chapters.length}`}
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
        <button
          className="control-btn"
          onClick={() => epub.setViewMode(epub.viewMode === 'paged' ? 'scroll' : 'paged')}
        >
          {epub.viewMode === 'paged' ? 'Scroll' : 'Paged'}
        </button>
      </div>
    </div>
  );
}
