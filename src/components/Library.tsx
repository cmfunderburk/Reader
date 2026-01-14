import { useState, useEffect, useCallback } from 'react';
import type { LibrarySource, LibraryItem } from '../types/electron';
import type { Article } from '../types';

interface LibraryProps {
  onAdd: (article: Omit<Article, 'id' | 'addedAt' | 'readPosition' | 'isRead'>) => void;
  onOpenSettings: () => void;
}

export function Library({ onAdd, onOpenSettings }: LibraryProps) {
  const [sources, setSources] = useState<LibrarySource[]>([]);
  const [selectedSource, setSelectedSource] = useState<LibrarySource | null>(null);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingItem, setLoadingItem] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load sources on mount
  useEffect(() => {
    if (!window.library) return;

    window.library.getSources().then((sources) => {
      setSources(sources);
      if (sources.length > 0 && !selectedSource) {
        setSelectedSource(sources[0]);
      }
    });
  }, []);

  // Load items when source changes
  useEffect(() => {
    if (!window.library || !selectedSource) {
      setItems([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    window.library
      .listBooks(selectedSource.path)
      .then((items) => {
        setItems(items);
      })
      .catch((err) => {
        setError(`Failed to load: ${err.message}`);
        setItems([]);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [selectedSource]);

  const handleOpenBook = useCallback(
    async (item: LibraryItem) => {
      if (!window.library) return;

      setLoadingItem(item.path);
      setError(null);

      try {
        const content = await window.library.openBook(item.path);
        onAdd({
          title: content.title,
          content: content.content,
          source: `Library: ${item.name}`,
        });
      } catch (err) {
        setError(`Failed to open: ${(err as Error).message}`);
      } finally {
        setLoadingItem(null);
      }
    },
    [onAdd]
  );

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!window.library) {
    return null;
  }

  return (
    <div className="library">
      <div className="library-header">
        <h3>Library</h3>
        <button
          className="library-settings-btn"
          onClick={onOpenSettings}
          title="Library Settings"
        >
          ⚙
        </button>
      </div>

      {sources.length === 0 ? (
        <div className="library-empty">
          <p>No library sources configured.</p>
          <button onClick={onOpenSettings}>Add Directory</button>
        </div>
      ) : (
        <>
          <div className="library-sources">
            {sources.map((source) => (
              <button
                key={source.path}
                className={`library-source ${selectedSource?.path === source.path ? 'active' : ''}`}
                onClick={() => setSelectedSource(source)}
              >
                {source.name}
              </button>
            ))}
          </div>

          <div className="library-items">
            {isLoading && <div className="library-loading">Loading...</div>}

            {error && <div className="library-error">{error}</div>}

            {!isLoading && items.length === 0 && (
              <div className="library-empty">No PDF or EPUB files found.</div>
            )}

            {items.map((item) => (
              <button
                key={item.path}
                className="library-item"
                onClick={() => handleOpenBook(item)}
                disabled={loadingItem === item.path}
              >
                <span className="library-item-icon">
                  {item.type === 'pdf' ? '📄' : '📚'}
                </span>
                <span className="library-item-name">{item.name}</span>
                <span className="library-item-size">{formatSize(item.size)}</span>
                {loadingItem === item.path && (
                  <span className="library-item-loading">...</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
