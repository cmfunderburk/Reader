import type { Article } from '../types';
import { estimateReadingTimeFromCharCount, formatReadTime } from '../lib/rsvp';

interface ArticleQueueProps {
  articles: Article[];
  currentArticleId?: string;
  onSelect: (article: Article) => void;
  onRemove: (id: string) => void;
  onAddClick: () => void;
  wpm: number;
}

export function ArticleQueue({
  articles,
  currentArticleId,
  onSelect,
  onRemove,
  onAddClick,
  wpm,
}: ArticleQueueProps) {
  return (
    <div className="article-queue">
      <div className="queue-header">
        <h2>Reading Queue ({articles.length})</h2>
        <button onClick={onAddClick} className="btn-add">+ Add URL</button>
      </div>

      <div className="queue-list">
        {articles.length === 0 ? (
          <div className="queue-empty">
            No articles in queue. Add a URL to get started.
          </div>
        ) : (
          articles.map(article => {
            const fallbackCharCount = article.content ? article.content.replace(/\s/g, '').length : 0;
            const charCount = article.charCount ?? fallbackCharCount;
            const readTime = estimateReadingTimeFromCharCount(charCount, wpm);
            const isCurrent = article.id === currentArticleId;

            return (
              <div
                key={article.id}
                className={`queue-item ${isCurrent ? 'queue-item-current' : ''} ${article.isRead ? 'queue-item-read' : ''}`}
                onClick={() => onSelect(article)}
              >
                <span className="queue-item-indicator">
                  {isCurrent ? '●' : article.isRead ? '✓' : '○'}
                </span>
                <div className="queue-item-content">
                  <span className="queue-item-title">{article.title}</span>
                  <span className="queue-item-meta">
                    {article.source} • {formatReadTime(readTime)}
                  </span>
                </div>
                <button
                  className="queue-item-remove"
                  onClick={e => {
                    e.stopPropagation();
                    onRemove(article.id);
                  }}
                  title="Remove"
                >
                  ×
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
