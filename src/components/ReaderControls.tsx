import type { TokenMode, DisplayMode, GuidedPacerStyle, GuidedFocusTarget, GenerationDifficulty } from '../types';

interface ReaderControlsProps {
  isPlaying: boolean;
  wpm: number;
  mode: TokenMode;
  displayMode: DisplayMode;
  allowedDisplayModes?: DisplayMode[];
  showPacer: boolean;
  currentPageIndex: number;
  totalPages: number;
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onReset: () => void;
  onSkipToEnd: () => void;
  onWpmChange: (wpm: number) => void;
  onModeChange: (mode: TokenMode) => void;
  onDisplayModeChange: (displayMode: DisplayMode) => void;
  onShowPacerChange: (show: boolean) => void;
  onNextPage: () => void;
  onPrevPage: () => void;
  rampEnabled: boolean;
  effectiveWpm: number;
  onRampEnabledChange: (enabled: boolean) => void;
  alternateColors: boolean;
  onAlternateColorsChange: (enabled: boolean) => void;
  showORP: boolean;
  onShowORPChange: (enabled: boolean) => void;
  guidedShowOVP: boolean;
  onGuidedShowOVPChange: (enabled: boolean) => void;
  guidedPacerStyle: GuidedPacerStyle;
  onGuidedPacerStyleChange: (style: GuidedPacerStyle) => void;
  guidedFocusTarget: GuidedFocusTarget;
  onGuidedFocusTargetChange: (target: GuidedFocusTarget) => void;
  guidedMergeShortFunctionWords: boolean;
  onGuidedMergeShortFunctionWordsChange: (enabled: boolean) => void;
  guidedLength: number;
  onGuidedLengthChange: (length: number) => void;
  generationDifficulty: GenerationDifficulty;
  onGenerationDifficultyChange: (difficulty: GenerationDifficulty) => void;
  generationSweepReveal: boolean;
  onGenerationSweepRevealChange: (enabled: boolean) => void;
}

export function ReaderControls({
  isPlaying,
  wpm,
  mode,
  displayMode,
  allowedDisplayModes,
  showPacer,
  currentPageIndex,
  totalPages,
  onPlay,
  onPause,
  onNext,
  onPrev,
  onReset,
  onSkipToEnd,
  onWpmChange,
  onModeChange,
  onDisplayModeChange,
  onShowPacerChange,
  onNextPage,
  onPrevPage,
  rampEnabled,
  effectiveWpm,
  onRampEnabledChange,
  alternateColors,
  onAlternateColorsChange,
  showORP,
  onShowORPChange,
  guidedShowOVP,
  onGuidedShowOVPChange,
  guidedPacerStyle,
  onGuidedPacerStyleChange,
  guidedFocusTarget,
  onGuidedFocusTargetChange,
  guidedMergeShortFunctionWords,
  onGuidedMergeShortFunctionWordsChange,
  guidedLength,
  onGuidedLengthChange,
  generationDifficulty,
  onGenerationDifficultyChange,
  generationSweepReveal,
  onGenerationSweepRevealChange,
}: ReaderControlsProps) {
  const isSelfPaced = displayMode === 'prediction' || displayMode === 'recall' || displayMode === 'training';
  const showChunks = !isSelfPaced && displayMode !== 'guided' && displayMode !== 'generation';
  const showGuidedPageTransport = !isSelfPaced && (displayMode === 'guided' || displayMode === 'generation');
  const hasGuidedPages = totalPages > 0;
  const safePageNumber = hasGuidedPages ? currentPageIndex + 1 : 0;

  return (
    <div className="reader-controls">
      {/* Hide transport controls in self-paced modes */}
      {!isSelfPaced && (
        <div className="controls-transport">
          <button onClick={onReset} title="Skip to start" className="control-btn">
            ⏮
          </button>
          <button onClick={onPrev} title="Previous chunk (←)" className="control-btn">
            ⏪
          </button>
          {showGuidedPageTransport && (
            <>
              <button
                onClick={onPrevPage}
                disabled={!hasGuidedPages || currentPageIndex <= 0}
                className="control-btn control-btn-page"
                title="Previous page"
              >
                ◀ Pg
              </button>
              <span className="page-indicator page-indicator-inline">
                Page {safePageNumber} / {totalPages}
              </span>
            </>
          )}
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
          {showGuidedPageTransport && (
            <button
              onClick={onNextPage}
              disabled={!hasGuidedPages || currentPageIndex >= totalPages - 1}
              className="control-btn control-btn-page"
              title="Next page"
            >
              Pg ▶
            </button>
          )}
          <button onClick={onSkipToEnd} title="Skip to end" className="control-btn">
            ⏭
          </button>
        </div>
      )}

      <div className="controls-settings">
        {/* Hide WPM in self-paced modes */}
        {!isSelfPaced && (
          <>
            <label className="control-group">
              <span className="control-label">Speed:</span>
              <input
                type="range"
                min="100"
                max="800"
                step="10"
                value={wpm}
                onChange={e => onWpmChange(Number(e.target.value))}
                className="control-slider wpm-slider"
              />
              <span className="control-value">
                {rampEnabled ? `${effectiveWpm} → ${wpm} WPM` : `${wpm} WPM`}
              </span>
            </label>
            <label className="control-group control-checkbox">
              <input
                type="checkbox"
                checked={rampEnabled}
                onChange={e => onRampEnabledChange(e.target.checked)}
              />
              <span className="control-label">Ramp</span>
            </label>
          </>
        )}

        {displayMode === 'rsvp' && (
          <>
            <label className="control-group control-checkbox">
              <input
                type="checkbox"
                checked={alternateColors}
                onChange={e => onAlternateColorsChange(e.target.checked)}
              />
              <span className="control-label">Alt colors</span>
            </label>
            <label className="control-group control-checkbox">
              <input
                type="checkbox"
                checked={showORP}
                onChange={e => onShowORPChange(e.target.checked)}
              />
              <span className="control-label">ORP</span>
            </label>
          </>
        )}

        {(() => {
          const ALL_MODES: { value: DisplayMode; label: string }[] = [
            { value: 'rsvp', label: 'RSVP' },
            { value: 'guided', label: 'Guided' },
            { value: 'generation', label: 'Generation' },
            { value: 'prediction', label: 'Prediction' },
            { value: 'recall', label: 'Recall' },
            { value: 'training', label: 'Training' },
          ];
          const modes = allowedDisplayModes
            ? ALL_MODES.filter(m => allowedDisplayModes.includes(m.value))
            : ALL_MODES;
          return modes.length > 1 ? (
            <label className="control-group">
              <span className="control-label">Display:</span>
              <select
                value={displayMode}
                onChange={e => onDisplayModeChange(e.target.value as DisplayMode)}
                className="control-select"
              >
                {modes.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </label>
          ) : null;
        })()}

        {/* Hide chunk mode in self-paced and guided modes */}
        {showChunks && (
          <>
            <label className="control-group">
              <span className="control-label">Chunking:</span>
              <select
                value={mode}
                onChange={e => onModeChange(e.target.value as TokenMode)}
                className="control-select"
              >
                <option value="word">Word</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            {mode === 'custom' && (
              <label className="control-group">
                <span className="control-label">Guided:</span>
                <input
                  type="range"
                  min="7"
                  max="15"
                  step="1"
                  value={guidedLength}
                  onChange={e => onGuidedLengthChange(Number(e.target.value))}
                  className="control-slider"
                />
                <span className="control-value">{guidedLength}ch</span>
              </label>
            )}
          </>
        )}

        {displayMode === 'guided' && (
          <>
            <label className="control-group control-checkbox">
              <input
                type="checkbox"
                checked={showPacer}
                onChange={e => onShowPacerChange(e.target.checked)}
              />
              <span className="control-label">Pacer</span>
            </label>
            <label className="control-group control-checkbox">
              <input
                type="checkbox"
                checked={guidedShowOVP}
                onChange={e => onGuidedShowOVPChange(e.target.checked)}
              />
              <span className="control-label">OVP</span>
            </label>
            {showPacer && (
              <label className="control-group">
                <span className="control-label">Pacer style:</span>
                <select
                  value={guidedPacerStyle}
                  onChange={e => onGuidedPacerStyleChange(e.target.value as GuidedPacerStyle)}
                  className="control-select"
                >
                  <option value="sweep">Sweep</option>
                  <option value="focus">Focus</option>
                </select>
              </label>
            )}
            {showPacer && guidedPacerStyle === 'focus' && (
              <label className="control-group">
                <span className="control-label">Focus by:</span>
                <select
                  value={guidedFocusTarget}
                  onChange={e => onGuidedFocusTargetChange(e.target.value as GuidedFocusTarget)}
                  className="control-select"
                >
                  <option value="fixation">Fixation</option>
                  <option value="word">Word</option>
                </select>
              </label>
            )}
            {showPacer && guidedPacerStyle === 'focus' && guidedFocusTarget === 'word' && (
              <label className="control-group control-checkbox">
                <input
                  type="checkbox"
                  checked={guidedMergeShortFunctionWords}
                  onChange={e => onGuidedMergeShortFunctionWordsChange(e.target.checked)}
                />
                <span className="control-label">Merge short words</span>
              </label>
            )}
            {(showPacer && guidedPacerStyle === 'focus' && guidedFocusTarget === 'fixation')
              || (guidedShowOVP && !(showPacer && guidedPacerStyle === 'focus' && guidedFocusTarget === 'word')) ? (
              <label className="control-group">
                <span className="control-label">Guided:</span>
                <input
                  type="range"
                  min="7"
                  max="15"
                  step="1"
                  value={guidedLength}
                  onChange={e => onGuidedLengthChange(Number(e.target.value))}
                  className="control-slider"
                />
                <span className="control-value">{guidedLength}ch</span>
              </label>
            ) : null}
          </>
        )}

        {displayMode === 'generation' && (
          <>
            <label className="control-group control-checkbox">
              <input
                type="checkbox"
                checked={showPacer}
                onChange={e => onShowPacerChange(e.target.checked)}
              />
              <span className="control-label">Pacer</span>
            </label>
            <label className="control-group control-checkbox">
              <input
                type="checkbox"
                checked={generationSweepReveal}
                onChange={e => onGenerationSweepRevealChange(e.target.checked)}
              />
              <span className="control-label">Sweep reveal</span>
            </label>
            <label className="control-group">
              <span className="control-label">Difficulty:</span>
              <select
                value={generationDifficulty}
                onChange={e => onGenerationDifficultyChange(e.target.value as GenerationDifficulty)}
                className="control-select"
              >
                <option value="normal">Normal</option>
                <option value="hard">Hard</option>
                <option value="recall">Recall</option>
              </select>
            </label>
            <span className="control-label">Hold R to reveal</span>
          </>
        )}


      </div>
    </div>
  );
}
