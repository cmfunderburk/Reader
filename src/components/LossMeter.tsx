interface LossMeterProps {
  loss: number;  // 0-1
}

/**
 * Visual feedback bar for prediction accuracy.
 * Shows score (1 - loss) as a colored bar.
 */
export function LossMeter({ loss }: LossMeterProps) {
  const score = 1 - loss;
  const percentage = Math.round(score * 100);

  // Color gradient: green (100%) -> yellow (50%) -> red (0%)
  let color: string;
  if (score >= 0.8) {
    color = 'var(--success, #22c55e)';
  } else if (score >= 0.5) {
    color = '#eab308'; // yellow
  } else {
    color = '#ef4444'; // red
  }

  // Label based on score
  let label: string;
  if (score === 1) {
    label = 'Perfect!';
  } else if (score >= 0.8) {
    label = 'Close';
  } else if (score >= 0.5) {
    label = 'Partial';
  } else {
    label = 'Miss';
  }

  return (
    <div className="loss-meter">
      <div className="loss-bar">
        <div
          className="loss-fill"
          style={{ width: `${percentage}%`, backgroundColor: color }}
        />
      </div>
      <div className="loss-label">
        {percentage}% - {label}
      </div>
    </div>
  );
}
