interface ProgressBarProps {
  progress: number; // 0-100
  onChange: (progress: number) => void;
}

export function ProgressBar({ progress, onChange }: ProgressBarProps) {
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const newProgress = (x / rect.width) * 100;
    onChange(Math.max(0, Math.min(100, newProgress)));
  };

  return (
    <div className="progress-bar" onClick={handleClick}>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
        <div className="progress-thumb" style={{ left: `${progress}%` }} />
      </div>
    </div>
  );
}
