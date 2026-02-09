import type { Activity, Article, DisplayMode } from '../types';

interface ContinueInfo {
  article: Article;
  activity: Activity;
  displayMode: DisplayMode;
}

interface HomeScreenProps {
  onSelectActivity: (activity: Activity) => void;
  onContinue: (info: ContinueInfo) => void;
  onStartDrill: () => void;
  onStartDaily: () => void;
  dailyStatus: 'idle' | 'loading' | 'error';
  dailyError: string | null;
  continueInfo: ContinueInfo | null;
}

export function HomeScreen({ onSelectActivity, onContinue, onStartDrill, onStartDaily, dailyStatus, dailyError, continueInfo }: HomeScreenProps) {
  return (
    <div className="home-screen">
      {continueInfo && (
        <button
          className="continue-banner"
          onClick={() => onContinue(continueInfo)}
        >
          <span className="continue-label">Continue</span>
          <span className="continue-title">{continueInfo.article.title}</span>
          <span className="continue-meta">{continueInfo.displayMode.toUpperCase()}</span>
        </button>
      )}

      <button
        className="daily-banner"
        onClick={onStartDaily}
        disabled={dailyStatus === 'loading'}
      >
        <span className="daily-label">Daily Article</span>
        <span className="daily-desc">
          {dailyStatus === 'loading'
            ? 'Fetching\u2026'
            : dailyStatus === 'error'
              ? dailyError ?? 'Failed to load'
              : 'Today\u2019s Wikipedia featured article'}
        </span>
        <span className="daily-meta">Saccade</span>
      </button>

      <div className="activity-grid">
        <button
          className="activity-card"
          onClick={() => onSelectActivity('paced-reading')}
        >
          <h2 className="activity-card-title">Paced Reading</h2>
          <p className="activity-card-desc">Read with adjustable pace guidance</p>
          <div className="activity-card-modes">
            <span className="activity-card-mode">RSVP</span>
            <span className="activity-card-mode">Saccade</span>
          </div>
        </button>

        <button
          className="activity-card"
          onClick={() => onSelectActivity('active-recall')}
        >
          <h2 className="activity-card-title">Active Recall</h2>
          <p className="activity-card-desc">Test working memory and retention</p>
          <div className="activity-card-modes">
            <span className="activity-card-mode">Prediction</span>
            <span className="activity-card-mode">Recall</span>
          </div>
        </button>

        <div className="activity-card activity-card-split">
          <h2 className="activity-card-title">Training</h2>
          <p className="activity-card-desc">Structured read-recall loops with adaptive pacing</p>
          <div className="activity-card-actions">
            <button
              className="activity-card-action"
              onClick={() => onSelectActivity('training')}
            >
              Memorize
            </button>
            <button
              className="activity-card-action"
              onClick={onStartDrill}
            >
              Random Drill
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
