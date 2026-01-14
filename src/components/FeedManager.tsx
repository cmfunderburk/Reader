import { useState } from 'react';
import type { Feed } from '../types';

interface FeedManagerProps {
  feeds: Feed[];
  onAddFeed: (url: string) => Promise<void>;
  onRemoveFeed: (id: string) => void;
  onRefreshFeed: (feed: Feed) => Promise<void>;
  isLoading: boolean;
}

export function FeedManager({
  feeds,
  onAddFeed,
  onRemoveFeed,
  onRefreshFeed,
  isLoading,
}: FeedManagerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [feedUrl, setFeedUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      await onAddFeed(feedUrl);
      setFeedUrl('');
      setShowAddForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add feed');
    }
  };

  return (
    <div className="feed-manager">
      <div className="feed-header">
        <h3>RSS Feeds</h3>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="btn-small"
        >
          {showAddForm ? 'Cancel' : '+ Add Feed'}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleSubmit} className="feed-add-form">
          {error && <div className="feed-error">{error}</div>}
          <input
            type="url"
            value={feedUrl}
            onChange={e => setFeedUrl(e.target.value)}
            placeholder="https://example.com/rss"
            className="feed-input"
            required
          />
          <button type="submit" disabled={isLoading} className="btn-small btn-primary">
            {isLoading ? 'Adding...' : 'Add'}
          </button>
        </form>
      )}

      <div className="feed-list">
        {feeds.length === 0 ? (
          <p className="feed-empty">No feeds added yet.</p>
        ) : (
          feeds.map(feed => (
            <div key={feed.id} className="feed-item">
              <span className="feed-title">{feed.title}</span>
              <div className="feed-actions">
                <button
                  onClick={() => onRefreshFeed(feed)}
                  className="btn-icon"
                  title="Refresh"
                >
                  ↻
                </button>
                <button
                  onClick={() => onRemoveFeed(feed.id)}
                  className="btn-icon btn-danger"
                  title="Remove"
                >
                  ×
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
