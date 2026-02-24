import { useState, useCallback } from 'react';
import type { SRSCard, SRSCardStatus } from '../types';
import { isGraduationEligible } from '../lib/srsScheduling';

type Phase = 'question' | 'reveal' | 'graduation';

interface SRSReviewSessionProps {
  dueCards: SRSCard[];
  onCardReviewed: (cardKey: string, selfGradeCorrect: boolean) => void;
  onCardStatusChange: (cardKey: string, status: SRSCardStatus) => void;
  onClose: () => void;
}

export function SRSReviewSession({
  dueCards,
  onCardReviewed,
  onCardStatusChange,
  onClose,
}: SRSReviewSessionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('question');
  const [userRecall, setUserRecall] = useState('');
  const [correctCount, setCorrectCount] = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);

  const card = dueCards[currentIndex];
  const isComplete = currentIndex >= dueCards.length;

  const handleShowAnswer = useCallback(() => {
    setPhase('reveal');
  }, []);

  const handleSelfGrade = useCallback((correct: boolean) => {
    if (!card) return;
    onCardReviewed(card.key, correct);
    if (correct) setCorrectCount((c) => c + 1);
    setReviewedCount((c) => c + 1);

    // Check if graduation prompt needed (after advancing — box was just bumped)
    if (correct && isGraduationEligible(card)) {
      setPhase('graduation');
      return;
    }

    // Move to next card
    setCurrentIndex((i) => i + 1);
    setPhase('question');
    setUserRecall('');
  }, [card, onCardReviewed]);

  const handleGraduationChoice = useCallback((choice: 'complete' | 'deferred' | 'keep') => {
    if (!card) return;
    if (choice === 'complete') {
      onCardStatusChange(card.key, 'complete');
    } else if (choice === 'deferred') {
      onCardStatusChange(card.key, 'deferred');
    }
    // 'keep' = do nothing, card stays active

    setCurrentIndex((i) => i + 1);
    setPhase('question');
    setUserRecall('');
  }, [card, onCardStatusChange]);

  // Summary screen
  if (isComplete) {
    return (
      <div className="comprehension-check">
        <h2>Review Complete</h2>
        <div className="comprehension-meta">
          <p>Reviewed: {reviewedCount} card{reviewedCount !== 1 ? 's' : ''}</p>
          <p>Correct: {correctCount} / {reviewedCount}</p>
        </div>
        <div className="comprehension-actions">
          <button className="control-btn" onClick={onClose}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="comprehension-check">
      <div className="comprehension-meta">
        Card {currentIndex + 1} of {dueCards.length}
        {' \u00b7 '}Box {card.box}
        {' \u00b7 '}{card.dimension}
        {' \u00b7 '}from &ldquo;{card.articleTitle}&rdquo;
      </div>

      <div className="comprehension-question-card">
        <p><strong>{card.prompt}</strong></p>

        {phase === 'question' && (
          <>
            <textarea
              className="comprehension-answer-input"
              value={userRecall}
              onChange={(e) => setUserRecall(e.target.value)}
              placeholder="Type your recall attempt (optional)..."
              rows={4}
            />
            <div className="comprehension-actions">
              <button className="control-btn" onClick={handleShowAnswer}>
                Show Answer
              </button>
            </div>
          </>
        )}

        {phase === 'reveal' && (
          <>
            {userRecall.trim() && (
              <div className="comprehension-meta">
                <p><strong>Your recall:</strong> {userRecall}</p>
              </div>
            )}
            <div className="comprehension-meta">
              <p><strong>Model answer:</strong> {card.modelAnswer}</p>
            </div>
            <div className="comprehension-actions">
              <button className="control-btn" onClick={() => handleSelfGrade(true)}>
                Got It
              </button>
              <button className="control-btn" onClick={() => handleSelfGrade(false)}>
                Missed It
              </button>
            </div>
          </>
        )}

        {phase === 'graduation' && (
          <>
            <div className="comprehension-meta">
              <p>This card has reached Box 5 (30+ day interval). What would you like to do?</p>
            </div>
            <div className="comprehension-actions">
              <button className="control-btn" onClick={() => handleGraduationChoice('complete')}>
                Mark Complete
              </button>
              <button className="control-btn" onClick={() => handleGraduationChoice('deferred')}>
                Defer
              </button>
              <button className="control-btn" onClick={() => handleGraduationChoice('keep')}>
                Keep Reviewing
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
