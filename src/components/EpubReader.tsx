import { useState } from 'react';
import type { UseEpubReaderResult, EpubReadingMode } from '../hooks/useEpubReader';

interface EpubReaderProps {
  epub: UseEpubReaderResult;
  onBack: () => void;
}

const MODE_LABELS: Record<EpubReadingMode, string> = {
  browse: 'Browse',
  pacer: 'Pacer',
  generation: 'Generation',
};

export function EpubReader({ epub, onBack }: EpubReaderProps) {
  const [showTOC, setShowTOC] = useState(false);

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
        className="epub-content"
        dangerouslySetInnerHTML={{ __html: annotatedHtml }}
      />

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
