import type { Article, DisplayMode, SessionSnapshot } from '../types';

interface ResumeReadingPlan {
  article: Article;
  displayMode: 'saccade' | 'rsvp';
  chunkIndex: number;
  snapshot: SessionSnapshot;
}

export type CloseActiveExercisePlan =
  | { type: 'resume-reading'; plan: ResumeReadingPlan }
  | { type: 'go-home'; clearSnapshot: boolean };

function normalizeReadingDisplayMode(displayMode: DisplayMode): 'saccade' | 'rsvp' {
  return displayMode === 'saccade' || displayMode === 'rsvp' ? displayMode : 'saccade';
}

export function planCloseActiveExercise(
  snapshot: SessionSnapshot | null,
  articles: Article[],
  now: number
): CloseActiveExercisePlan {
  const reading = snapshot?.reading;
  if (!reading) {
    return { type: 'go-home', clearSnapshot: false };
  }

  const sourceArticle = articles.find((article) => article.id === reading.articleId);
  if (!sourceArticle) {
    return { type: 'go-home', clearSnapshot: true };
  }

  return {
    type: 'resume-reading',
    plan: {
      article: sourceArticle,
      displayMode: normalizeReadingDisplayMode(reading.displayMode),
      chunkIndex: reading.chunkIndex,
      snapshot: {
        ...snapshot,
        training: undefined,
        lastTransition: 'return-to-reading',
        updatedAt: now,
      },
    },
  };
}
