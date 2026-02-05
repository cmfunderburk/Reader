import type { PredictionStats } from '../types';
import { predictionScorePercents } from '../lib/levenshtein';

interface PredictionCompleteProps {
  stats: PredictionStats;
  onReadAgain: () => void;
  onClose: () => void;
}

/**
 * Completion summary shown at end of article in prediction mode.
 */
export function PredictionComplete({ stats, onReadAgain, onClose }: PredictionCompleteProps) {
  const { exactPercent, avgScore } = predictionScorePercents(stats);

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
