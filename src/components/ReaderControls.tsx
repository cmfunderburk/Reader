import type { TokenMode, DisplayMode } from '../types';
import { MODE_CHAR_WIDTHS } from '../types';

interface ReaderControlsProps {
  isPlaying: boolean;
  wpm: number;
  mode: TokenMode;
  displayMode: DisplayMode;
  customCharWidth: number;
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onReset: () => void;
  onSkipToEnd: () => void;
  onWpmChange: (wpm: number) => void;
  onModeChange: (mode: TokenMode) => void;
  onDisplayModeChange: (displayMode: DisplayMode) => void;
  onCustomCharWidthChange: (width: number) => void;
}

export function ReaderControls({
  isPlaying,
  wpm,
  mode,
  displayMode,
  customCharWidth,
  onPlay,
  onPause,
  onNext,
  onPrev,
  onReset,
  onSkipToEnd,
  onWpmChange,
  onModeChange,
  onDisplayModeChange,
  onCustomCharWidthChange,
}: ReaderControlsProps) {
  return (
    <div className="reader-controls">
      <div className="controls-transport">
        <button onClick={onReset} title="Skip to start" className="control-btn">
          ⏮
        </button>
        <button onClick={onPrev} title="Previous chunk (←)" className="control-btn">
          ⏪
        </button>
        <button
          onClick={isPlaying ? onPause : onPlay}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          className="control-btn control-btn-primary"
        >
          {isPlaying ? '⏸ PAUSE' : '▶ PLAY'}
        </button>
        <button onClick={onNext} title="Next chunk (→)" className="control-btn">
          ⏩
        </button>
        <button onClick={onSkipToEnd} title="Skip to end" className="control-btn">
          ⏭
        </button>
      </div>

      <div className="controls-settings">
        <label className="control-group">
          <span className="control-label">Speed:</span>
          <select
            value={wpm}
            onChange={e => onWpmChange(Number(e.target.value))}
            className="control-select"
          >
            {[100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800].map(v => (
              <option key={v} value={v}>{v} WPM</option>
            ))}
          </select>
        </label>

        <label className="control-group">
          <span className="control-label">Display:</span>
          <select
            value={displayMode}
            onChange={e => onDisplayModeChange(e.target.value as DisplayMode)}
            className="control-select"
          >
            <option value="rsvp">RSVP</option>
            <option value="saccade">Saccade</option>
          </select>
        </label>

        <label className="control-group">
          <span className="control-label">Chunks:</span>
          <select
            value={mode}
            onChange={e => onModeChange(e.target.value as TokenMode)}
            className="control-select"
          >
            <option value="word">Word</option>
            <option value="phrase">Phrase (~{MODE_CHAR_WIDTHS.phrase}ch)</option>
            <option value="clause">Clause (~{MODE_CHAR_WIDTHS.clause}ch)</option>
            <option value="custom">Custom</option>
          </select>
        </label>

        {mode === 'custom' && (
          <label className="control-group">
            <span className="control-label">Width:</span>
            <input
              type="range"
              min="10"
              max="60"
              value={customCharWidth}
              onChange={e => onCustomCharWidthChange(Number(e.target.value))}
              className="control-slider"
            />
            <span className="control-value">{customCharWidth}ch</span>
          </label>
        )}
      </div>
    </div>
  );
}
