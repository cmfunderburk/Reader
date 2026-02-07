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
  continueInfo: ContinueInfo | null;
}

export function HomeScreen({ onSelectActivity, onContinue, onStartDrill, continueInfo }: HomeScreenProps) {
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

      <div className="activity-grid">
        <button
          className="activity-card"
          onClick={() => onSelectActivity('speed-reading')}
        >
          <h2 className="activity-card-title">Speed Reading</h2>
          <p className="activity-card-desc">Build reading speed with guided eye movement</p>
          <div className="activity-card-modes">
            <span className="activity-card-mode">RSVP</span>
            <span className="activity-card-mode">Saccade</span>
          </div>
        </button>

        <button
          className="activity-card"
          onClick={() => onSelectActivity('comprehension')}
        >
          <h2 className="activity-card-title">Comprehension</h2>
          <p className="activity-card-desc">Test and improve reading comprehension</p>
          <div className="activity-card-modes">
            <span className="activity-card-mode">Prediction</span>
            <span className="activity-card-mode">Recall</span>
          </div>
        </button>

        <div className="activity-card activity-card-split">
          <h2 className="activity-card-title">Training</h2>
          <p className="activity-card-desc">Read-recall-adjust loop with adaptive pacing</p>
          <div className="activity-card-actions">
            <button
              className="activity-card-action"
              onClick={() => onSelectActivity('training')}
            >
              Article
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
