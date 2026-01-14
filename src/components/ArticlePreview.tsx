import { useState } from 'react';
import type { Article, TokenMode } from '../types';
import { tokenize, estimateReadingTime } from '../lib/tokenizer';

interface ArticlePreviewProps {
  article: Article;
  initialWpm: number;
  initialMode: TokenMode;
  onStart: (article: Article, wpm: number, mode: TokenMode) => void;
  onClose: () => void;
}

function formatReadTime(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} min read`;
}

export function ArticlePreview({
  article,
  initialWpm,
  initialMode,
  onStart,
  onClose,
}: ArticlePreviewProps) {
  const [wpm, setWpm] = useState(initialWpm);
  const [mode, setMode] = useState<TokenMode>(initialMode);

  const chunks = tokenize(article.content, mode);
  const readTime = estimateReadingTime(chunks, wpm);

  return (
    <div className="article-preview">
      <div className="preview-header">
        <h2>Article Preview</h2>
        <button onClick={onClose} className="btn-close">✕ Close</button>
      </div>

      <div className="preview-meta">
        <h3 className="preview-title">{article.title}</h3>
        <span className="preview-source">
          {article.source} • {formatReadTime(readTime)} • Added {new Date(article.addedAt).toLocaleDateString()}
        </span>
      </div>

      <div className="preview-content">
        {article.content}
      </div>

      <div className="preview-controls">
        <button onClick={() => onStart(article, wpm, mode)} className="btn-start">
          Start Reading ▶
        </button>

        <label className="control-group">
          <span className="control-label">Mode:</span>
          <select
            value={mode}
            onChange={e => setMode(e.target.value as TokenMode)}
            className="control-select"
          >
            <option value="word">Word</option>
            <option value="phrase">Phrase</option>
            <option value="clause">Clause</option>
          </select>
        </label>

        <label className="control-group">
          <span className="control-label">Speed:</span>
          <select
            value={wpm}
            onChange={e => setWpm(Number(e.target.value))}
            className="control-select"
          >
            {[100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800].map(v => (
              <option key={v} value={v}>{v} WPM</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
