import type { PredictionStats } from '../types';

interface PredictionCompleteProps {
  stats: PredictionStats;
  onReadAgain: () => void;
  onClose: () => void;
}

/**
 * Completion summary shown at end of article in prediction mode.
 */
export function PredictionComplete({ stats, onReadAgain, onClose }: PredictionCompleteProps) {
  const exactPercent = stats.totalWords > 0
    ? Math.round((stats.exactMatches / stats.totalWords) * 100)
    : 0;

  const avgScore = stats.totalWords > 0
    ? Math.round((1 - stats.averageLoss) * 100)
    : 100;

  return (
    <div className="prediction-complete">
      <h2>Article Complete</h2>

      <div className="prediction-complete-stats">
        <div className="prediction-stat">
          <span className="prediction-stat-value">{stats.totalWords}</span>
          <span className="prediction-stat-label">words predicted</span>
        </div>
        <div className="prediction-stat">
          <span className="prediction-stat-value">{exactPercent}%</span>
          <span className="prediction-stat-label">exact matches</span>
        </div>
        <div className="prediction-stat">
          <span className="prediction-stat-value">{avgScore}%</span>
          <span className="prediction-stat-label">average score</span>
        </div>
      </div>

      <div className="prediction-complete-actions">
        <button onClick={onReadAgain} className="control-btn">
          Read Again
        </button>
        <button onClick={onClose} className="control-btn control-btn-primary">
          Close
        </button>
      </div>
    </div>
  );
}
