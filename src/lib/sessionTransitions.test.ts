import { describe, expect, it } from 'vitest';
import { planCloseActiveExercise } from './sessionTransitions';
import type { Article, SessionSnapshot } from '../types';

function makeArticle(id: string): Article {
  return {
    id,
    title: `Article ${id}`,
    content: 'Sample content',
    source: 'test',
    addedAt: 1,
    readPosition: 0,
    isRead: false,
  };
}

describe('sessionTransitions', () => {
  it('goes home without clearing snapshot when no reading snapshot exists', () => {
    expect(planCloseActiveExercise(null, [], 10)).toEqual({
      type: 'go-home',
      clearSnapshot: false,
    });

    const trainingOnly: SessionSnapshot = {
      training: { passageId: 'p1', mode: 'prediction', startedAt: 1 },
      updatedAt: 1,
    };
    expect(planCloseActiveExercise(trainingOnly, [], 10)).toEqual({
      type: 'go-home',
      clearSnapshot: false,
    });
  });

  it('goes home and clears snapshot when reading article no longer exists', () => {
    const snapshot: SessionSnapshot = {
      reading: { articleId: 'missing', chunkIndex: 42, displayMode: 'saccade' },
      updatedAt: 1,
    };
    expect(planCloseActiveExercise(snapshot, [], 10)).toEqual({
      type: 'go-home',
      clearSnapshot: true,
    });
  });

  it('resumes reading and updates snapshot transition metadata', () => {
    const article = makeArticle('a1');
    const snapshot: SessionSnapshot = {
      reading: { articleId: 'a1', chunkIndex: 12, displayMode: 'rsvp' },
      training: { passageId: 'p1', mode: 'recall', startedAt: 1 },
      lastTransition: 'read-to-recall',
      updatedAt: 1,
    };
    const plan = planCloseActiveExercise(snapshot, [article], 123);
    expect(plan).toEqual({
      type: 'resume-reading',
      plan: {
        article,
        displayMode: 'rsvp',
        chunkIndex: 12,
        snapshot: {
          reading: { articleId: 'a1', chunkIndex: 12, displayMode: 'rsvp' },
          training: undefined,
          lastTransition: 'return-to-reading',
          updatedAt: 123,
        },
      },
    });
  });

  it('normalizes non-reading display modes to saccade when resuming', () => {
    const article = makeArticle('a2');
    const snapshot: SessionSnapshot = {
      reading: { articleId: 'a2', chunkIndex: 7, displayMode: 'prediction' },
      updatedAt: 1,
    };
    const plan = planCloseActiveExercise(snapshot, [article], 55);
    expect(plan).toEqual({
      type: 'resume-reading',
      plan: {
        article,
        displayMode: 'saccade',
        chunkIndex: 7,
        snapshot: {
          reading: { articleId: 'a2', chunkIndex: 7, displayMode: 'prediction' },
          training: undefined,
          lastTransition: 'return-to-reading',
          updatedAt: 55,
        },
      },
    });
  });
});
