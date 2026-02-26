// Activity: top-level grouping of display modes
export type Activity = 'paced-reading' | 'active-recall' | 'training' | 'comprehension-check';

// Display mode: how text is presented
export type DisplayMode = 'rsvp' | 'guided' | 'generation' | 'prediction' | 'recall' | 'training';

// Token/chunk mode: how text is chunked
export type TokenMode = 'word' | 'custom';

export type RampCurve = 'linear' | 'logarithmic';

export type PredictionLineWidth = 'narrow' | 'medium' | 'wide';
export type PredictionPreviewMode = 'sentences' | 'unlimited';
export type ThemePreference = 'dark' | 'light' | 'system';
export type GuidedPacerStyle = 'sweep' | 'focus';
export type GuidedFocusTarget = 'fixation' | 'word';
export type GenerationDifficulty = 'normal' | 'hard' | 'recall';

export const PREDICTION_LINE_WIDTHS: Record<PredictionLineWidth, number> = {
  narrow: 50,
  medium: 65,
  wide: 85,
};

export type GuidedLineType = 'body' | 'heading' | 'blank' | 'figure';

export interface GuidedLine {
  text: string;
  type: GuidedLineType;
  level?: number;  // 1-6 for headings
  figureId?: string;
  figureSrc?: string;
  figureCaption?: string;
  isEquation?: boolean;
  equationIndex?: number;
}

export interface GuidedPage {
  lines: GuidedLine[];
  lineChunks: Chunk[][];  // lineChunks[lineIndex] = chunks for that line
}

export interface GuidedPosition {
  pageIndex: number;
  lineIndex: number;
  startChar: number;
  endChar: number;
}

export interface Chunk {
  text: string;
  wordCount: number;
  orpIndex: number; // character index of the ORP within the chunk
  guided?: GuidedPosition; // present only in guided mode
}

export interface Article {
  id: string;
  title: string;
  content: string;
  source: string;
  sourcePath?: string;
  assetBaseUrl?: string;
  url?: string;
  addedAt: number;
  readPosition: number; // chunk index for RSVP/guided
  predictionPosition?: number; // word index for prediction mode
  isRead: boolean;
  charCount?: number;
  wordCount?: number;
  group?: string;
}

export interface PredictionResult {
  predicted: string;      // what user typed
  actual: string;         // correct word
  loss: number;           // 0-1 normalized Levenshtein
  timestamp: number;      // for pacing analysis
  wordIndex: number;      // position in text
}

export interface PredictionStats {
  totalWords: number;
  exactMatches: number;
  knownWords: number;
}

export interface TrainingParagraphResult {
  paragraphIndex: number;
  score: number;       // 0-1 (1 = perfect)
  wpm: number;         // WPM used for this paragraph
  repeated: boolean;
  wordCount: number;
  exactMatches: number;
}

export interface Feed {
  id: string;
  url: string;
  title: string;
  lastFetched: number;
}

export type PassageCaptureKind = 'line' | 'sentence' | 'paragraph' | 'last-lines';
export type PassageReviewState = 'new' | 'hard' | 'easy' | 'done';
export type PassageReviewMode = 'recall' | 'prediction';

export interface Passage {
  id: string;
  articleId: string;
  articleTitle: string;
  sourceMode: DisplayMode;
  captureKind: PassageCaptureKind;
  text: string;
  createdAt: number;
  updatedAt: number;
  sourceChunkIndex: number;
  sourcePageIndex?: number;
  sourceLineIndex?: number;
  reviewState: PassageReviewState;
  reviewCount: number;
  lastReviewedAt?: number;
  lastReviewMode?: PassageReviewMode;
}

export interface SessionSnapshot {
  reading?: {
    articleId: string;
    chunkIndex: number;
    displayMode: DisplayMode;
  };
  training?: {
    passageId: string;
    mode: PassageReviewMode;
    startedAt: number;
  };
  lastTransition?: 'read-to-recall' | 'read-to-prediction' | 'return-to-reading';
  updatedAt: number;
}

// Comprehension Check types
export type ComprehensionDimension = 'factual' | 'inference' | 'structural' | 'evaluative';
export type ComprehensionFormat = 'multiple-choice' | 'true-false' | 'short-answer' | 'essay';
export type ComprehensionRunMode = 'quick-check' | 'exam';
export type ComprehensionExamPreset = 'quiz' | 'midterm' | 'final';
export type ComprehensionExamSection = 'recall' | 'interpretation' | 'synthesis';
export type ComprehensionItemMode =
  | 'retrieval-check'
  | 'elaboration'
  | 'self-explanation'
  | 'argument-map'
  | 'synthesis'
  | 'spaced-recheck'
  | 'interleaved-drill';
export type ComprehensionHint = string;
export type ComprehensionConfidence = 1 | 2 | 3 | 4 | 5;
export const COMPREHENSION_GEMINI_MODELS = ['gemini-3.1-pro-preview', 'gemini-3-flash-preview'] as const;
export type ComprehensionGeminiModel = typeof COMPREHENSION_GEMINI_MODELS[number];

export interface ComprehensionSourceRef {
  articleId: string;
  title: string;
  group?: string;
}

export interface ComprehensionKeyPoint {
  id?: string;
  text: string;
  weight?: number;
}

export interface ComprehensionKeyPointResult {
  keyPoint: string;
  hit: boolean;
  evidence?: string;
  weight?: number;
}

export interface ComprehensionScheduleMetadata {
  nextDueAt?: number;
  lastSeenAt?: number;
  intervalDays?: number;
  stability?: number;
  lapseCount?: number;
}

export interface ComprehensionQuestionResult {
  id: string;
  dimension: ComprehensionDimension;
  format: ComprehensionFormat;
  section?: ComprehensionExamSection;
  sourceArticleId?: string;
  mode?: ComprehensionItemMode;
  keyPoints?: ComprehensionKeyPoint[];
  targetLatencySec?: number;
  prompt: string;
  userAnswer: string;
  confidence?: ComprehensionConfidence;
  withheld?: boolean;
  hintsUsed?: ComprehensionHint[];
  timeToAnswerMs?: number;
  modelAnswer: string;
  score: number;          // 0-3
  feedback: string;
  correct?: boolean;      // for auto-scored multiple-choice
  schedule?: ComprehensionScheduleMetadata;
  keyPointResults?: ComprehensionKeyPointResult[];
}

export interface ComprehensionAttempt {
  id: string;
  articleId: string;
  articleTitle: string;
  entryPoint: 'post-reading' | 'launcher';
  runMode?: ComprehensionRunMode;
  examPreset?: ComprehensionExamPreset;
  sourceArticles?: ComprehensionSourceRef[];
  difficultyTarget?: 'standard' | 'challenging';
  openBookSynthesis?: boolean;
  questions: ComprehensionQuestionResult[];
  overallScore: number;   // 0-100
  createdAt: number;
  durationMs: number;
}

export interface GeneratedComprehensionQuestion {
  id: string;
  dimension: ComprehensionDimension;
  format: ComprehensionFormat;
  section?: ComprehensionExamSection;
  sourceArticleId?: string;
  mode?: ComprehensionItemMode;
  keyPoints?: ComprehensionKeyPoint[];
  targetLatencySec?: number;
  prompt: string;
  options?: string[];
  correctOptionIndex?: number;
  correctAnswer?: boolean;
  modelAnswer: string;
}

export interface GeneratedComprehensionCheck {
  questions: GeneratedComprehensionQuestion[];
}

export interface ComprehensionQuestionScore {
  score: number;          // 0-3
  feedback: string;
  keyPointResults?: ComprehensionKeyPointResult[];
}

// EPUB types
export interface BookState {
  title: string;
  lastChapterIndex: number;
  lastWordIndex: number;
  lastOpenedAt: number;
}

// SRS (Spaced Repetition) types
export type SRSCardStatus = 'active' | 'complete' | 'deferred';
export type LeitnerBox = 1 | 2 | 3 | 4 | 5;

export interface SRSCard {
  key: string;              // `${articleId}::${normalizedPrompt}` (dedup key)
  box: LeitnerBox;
  nextDueAt: number;
  lastReviewedAt: number;
  createdAt: number;
  reviewCount: number;
  lapseCount: number;
  status: SRSCardStatus;
  // Question snapshot
  prompt: string;
  modelAnswer: string;
  format: ComprehensionFormat;
  dimension: ComprehensionDimension;
  section?: ComprehensionExamSection;
  // Source metadata
  articleId: string;
  articleTitle: string;
  sourceAttemptId: string;
}
