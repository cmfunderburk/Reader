import type { PredictionStats as Stats } from '../types';

interface PredictionStatsProps {
  stats: Stats;
}

/**
 * Stats bar showing prediction progress and accuracy.
 */
export function PredictionStats({ stats }: PredictionStatsProps) {
  const exactPercent = stats.totalWords > 0
    ? Math.round((stats.exactMatches / stats.totalWords) * 100)
    : 0;

  const avgScore = stats.totalWords > 0
    ? Math.round((1 - stats.averageLoss) * 100)
    : 100;

  return (
    <div className="prediction-stats-bar">
      <div className="prediction-stat">
        <span className="prediction-stat-value">{stats.totalWords}</span>
        <span className="prediction-stat-label">words</span>
      </div>
      <div className="prediction-stat">
        <span className="prediction-stat-value">{exactPercent}%</span>
        <span className="prediction-stat-label">exact</span>
      </div>
      <div className="prediction-stat">
        <span className="prediction-stat-value">{avgScore}%</span>
        <span className="prediction-stat-label">avg score</span>
      </div>
    </div>
  );
}
