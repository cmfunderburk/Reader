import { useState } from 'react';
import type { Activity, Article, ComprehensionAttempt, DisplayMode } from '../types';

interface ContinueInfo {
  article: Article;
  activity: Activity;
  displayMode: DisplayMode;
}

interface HomeScreenProps {
  onSelectActivity: (activity: Activity) => void;
  onContinue: (info: ContinueInfo) => void;
  onStartDrill: () => void;
  onStartComprehensionBuilder: () => void;
  onStartDaily: () => void;
  dailyStatus: 'idle' | 'loading' | 'error';
  dailyError: string | null;
  onStartRandom: () => void;
  randomStatus: 'idle' | 'loading' | 'error';
  randomError: string | null;
  continueInfo: ContinueInfo | null;
  comprehensionSummary: { attemptCount: number; lastScore: number | null };
  comprehensionAttempts: ComprehensionAttempt[];
  srsDueCount: number;
  onStartSRSReview: () => void;
}

const MAX_HISTORY_ATTEMPTS = 30;

function formatAttemptDate(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return String(timestamp);
  }
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatEntryPoint(entryPoint: ComprehensionAttempt['entryPoint']): string {
  return entryPoint === 'post-reading' ? 'Post-reading' : 'Launcher';
}

function formatDisplayMode(mode: DisplayMode): string {
  switch (mode) {
    case 'rsvp':
      return 'RSVP';
    case 'saccade':
      return 'Saccade';
    case 'generation':
      return 'Generation';
    case 'prediction':
      return 'Prediction';
    case 'recall':
      return 'Recall';
    case 'training':
      return 'Training';
    default:
      return mode;
  }
}

function formatActivity(activity: Activity): string {
  switch (activity) {
    case 'paced-reading':
      return 'Paced Reading';
    case 'active-recall':
      return 'Active Recall';
    case 'training':
      return 'Training';
    case 'comprehension-check':
      return 'Comprehension Check';
    default:
      return activity;
  }
}

export function HomeScreen({
  onSelectActivity,
  onContinue,
  onStartDrill,
  onStartComprehensionBuilder,
  onStartDaily,
  dailyStatus,
  dailyError,
  onStartRandom,
  randomStatus,
  randomError,
  continueInfo,
  comprehensionSummary,
  comprehensionAttempts,
  srsDueCount,
  onStartSRSReview,
}: HomeScreenProps) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const attemptsToShow = comprehensionAttempts.slice(0, MAX_HISTORY_ATTEMPTS);
  const dailyStatusText = dailyStatus === 'loading'
    ? 'Fetching...'
    : dailyStatus === 'error'
      ? dailyError ?? 'Failed to load'
      : "Today's featured article";
  const randomStatusText = randomStatus === 'loading'
    ? 'Fetching...'
    : randomStatus === 'error'
      ? randomError ?? 'Failed to load'
      : 'Wikipedia featured article';

  return (
    <div className="home-screen">
      <section className={`resume-card${continueInfo ? '' : ' resume-card-empty'}`}>
        <div className="resume-copy">
          <p className="launcher-label">Resume</p>
          {continueInfo ? (
            <>
              <h2 className="resume-title">{continueInfo.article.title}</h2>
              <p className="resume-meta">
                {formatActivity(continueInfo.activity)} · {formatDisplayMode(continueInfo.displayMode)}
              </p>
            </>
          ) : (
            <>
              <h2 className="resume-title">Pick something to start</h2>
              <p className="resume-meta">Choose a source or launch a practice mode below.</p>
            </>
          )}
        </div>
        {continueInfo && (
          <button
            className="resume-action"
            onClick={() => onContinue(continueInfo)}
          >
            Continue
          </button>
        )}
      </section>

      <div className="launcher-overview-grid">
        <section className="launcher-card start-new-card" aria-label="Wikipedia quick start">
          <p className="launcher-label">Wikipedia</p>
          <h2 className="launcher-card-title">Featured Articles</h2>
          <div className="wikipedia-actions">
            <div className={`wikipedia-action${dailyStatus === 'error' ? ' wikipedia-action-error' : ''}`}>
              <div className="wikipedia-action-copy">
                <h3 className="wikipedia-action-title">Daily article</h3>
                <p className="wikipedia-action-desc">{dailyStatusText}</p>
              </div>
              <button
                className="launcher-primary-btn wikipedia-launch-btn"
                onClick={onStartDaily}
                disabled={dailyStatus === 'loading'}
              >
                {dailyStatus === 'loading' ? 'Loading...' : 'Start Daily'}
              </button>
            </div>
            <div className={`wikipedia-action${randomStatus === 'error' ? ' wikipedia-action-error' : ''}`}>
              <div className="wikipedia-action-copy">
                <h3 className="wikipedia-action-title">Random article</h3>
                <p className="wikipedia-action-desc">{randomStatusText}</p>
              </div>
              <button
                className="launcher-secondary-btn wikipedia-launch-btn"
                onClick={onStartRandom}
                disabled={randomStatus === 'loading'}
              >
                {randomStatus === 'loading' ? 'Loading...' : 'Start Random'}
              </button>
            </div>
          </div>
        </section>

        <section className="launcher-card review-card" aria-label="Review status">
          <p className="launcher-label">Review</p>
          <div className="review-stats">
            <p>
              <span className="review-stat-label">Due checks</span>
              <span className="review-stat-value">{srsDueCount}</span>
            </p>
            <p>
              <span className="review-stat-label">Last score</span>
              <span className="review-stat-value">
                {comprehensionSummary.lastScore == null ? 'N/A' : `${comprehensionSummary.lastScore}%`}
              </span>
            </p>
            <p>
              <span className="review-stat-label">Attempts</span>
              <span className="review-stat-value">{comprehensionSummary.attemptCount}</span>
            </p>
          </div>
          <div className="launcher-card-actions review-actions">
            <button
              className="launcher-primary-btn"
              onClick={onStartSRSReview}
              disabled={srsDueCount === 0}
            >
              Start Due Check ({srsDueCount} due)
            </button>
            <button
              className="launcher-secondary-btn"
              onClick={() => setIsHistoryOpen((value) => !value)}
            >
              {isHistoryOpen ? 'Hide History' : 'Review History'}
            </button>
          </div>
        </section>
      </div>

      <section className="practice-modes" aria-label="Practice modes">
        <div className="practice-modes-grid">
          <article className="mode-card">
            <h2 className="mode-card-title">Paced Reading</h2>
            <p className="mode-card-desc">Read with adjustable pace guidance</p>
            <div className="mode-card-chips">
              <span className="mode-chip">RSVP</span>
              <span className="mode-chip">Saccade</span>
              <span className="mode-chip">Generation</span>
            </div>
            <div className="mode-card-actions">
              <button
                className="launcher-primary-btn"
                onClick={() => onSelectActivity('paced-reading')}
              >
                Start
              </button>
            </div>
          </article>

          <article className="mode-card">
            <h2 className="mode-card-title">Active Recall</h2>
            <p className="mode-card-desc">Test working memory and retention</p>
            <div className="mode-card-chips">
              <span className="mode-chip">Prediction</span>
              <span className="mode-chip">Recall</span>
            </div>
            <div className="mode-card-actions">
              <button
                className="launcher-primary-btn"
                onClick={() => onSelectActivity('active-recall')}
              >
                Start
              </button>
            </div>
          </article>

          <article className="mode-card">
            <h2 className="mode-card-title">Comprehension Check</h2>
            <p className="mode-card-desc">LLM-generated questions with explanatory feedback</p>
            <p className="mode-card-meta">
              {comprehensionSummary.attemptCount > 0
                ? `Attempts: ${comprehensionSummary.attemptCount} · Last score: ${comprehensionSummary.lastScore}%`
                : 'No attempts yet'}
            </p>
            <div className="mode-card-actions">
              <button
                className="launcher-primary-btn"
                onClick={() => onSelectActivity('comprehension-check')}
              >
                Start Check
              </button>
              <button
                className="launcher-secondary-btn"
                onClick={onStartComprehensionBuilder}
              >
                Build Exam
              </button>
            </div>
          </article>

          <article className="mode-card">
            <h2 className="mode-card-title">Training</h2>
            <p className="mode-card-desc">Structured read-recall loops with adaptive pacing</p>
            <div className="mode-card-actions">
              <button
                className="launcher-primary-btn"
                onClick={() => onSelectActivity('training')}
              >
                Memorize
              </button>
              <button
                className="launcher-secondary-btn"
                onClick={onStartDrill}
              >
                Random Drill
              </button>
            </div>
          </article>
        </div>
      </section>

      {isHistoryOpen && (
        <section className="comprehension-history-panel" aria-label="Comprehension history">
          <div className="comprehension-history-header">
            <h2>Comprehension History</h2>
            <p>
              Showing {attemptsToShow.length}
              {comprehensionAttempts.length > MAX_HISTORY_ATTEMPTS
                ? ` of ${comprehensionAttempts.length}`
                : ''}
              {' '}attempts
            </p>
          </div>

          {attemptsToShow.length === 0 ? (
            <p className="comprehension-history-empty">No comprehension attempts yet.</p>
          ) : (
            <div className="comprehension-history-list">
              {attemptsToShow.map((attempt) => (
                <article key={attempt.id} className="comprehension-history-item">
                  <h3>{attempt.articleTitle}</h3>
                  <p className="comprehension-history-meta">
                    Score {attempt.overallScore}% · {attempt.questions.length} questions · {formatDuration(attempt.durationMs)} · {formatEntryPoint(attempt.entryPoint)}
                  </p>
                  <p className="comprehension-history-time">{formatAttemptDate(attempt.createdAt)}</p>

                  <details className="comprehension-history-details">
                    <summary>Review answers</summary>
                    <div className="comprehension-history-answers">
                      {attempt.questions.map((question, index) => (
                        <section key={`${attempt.id}-${question.id}`} className="comprehension-history-answer">
                          <h4>Q{index + 1} · {question.dimension} · {question.format}</h4>
                          <p>{question.prompt}</p>
                          <p><strong>Your answer:</strong> {question.userAnswer || '(no answer)'}</p>
                          <p><strong>Feedback:</strong> {question.feedback}</p>
                          <p><strong>Model answer:</strong> {question.modelAnswer}</p>
                        </section>
                      ))}
                    </div>
                  </details>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
