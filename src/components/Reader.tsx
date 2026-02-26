import type {
  Chunk,
  DisplayMode,
  GenerationDifficulty,
  GuidedPage,
  GuidedPacerStyle,
  GuidedFocusTarget,
} from '../types';
import { isBreakChunk } from '../lib/rsvp';
import { calculateORP, FUNCTION_WORDS } from '../lib/tokenizer';
import { GuidedReader } from './GuidedReader';

interface ReaderProps {
  chunk: Chunk | null;
  isPlaying: boolean;
  displayMode: DisplayMode;
  guidedPage?: GuidedPage | null;
  showPacer?: boolean;
  wpm: number;
  colorPhase?: 'a' | 'b';
  showORP?: boolean;
  guidedShowOVP?: boolean;
  guidedShowSweep?: boolean;
  guidedPacerStyle?: GuidedPacerStyle;
  guidedFocusTarget?: GuidedFocusTarget;
  guidedMergeShortFunctionWords?: boolean;
  guidedLength?: number;
  generationDifficulty?: GenerationDifficulty;
  generationSweepReveal?: boolean;
  generationMaskSeed?: number;
  generationReveal?: boolean;
}

export function Reader({
  chunk,
  isPlaying,
  displayMode,
  guidedPage,
  showPacer = true,
  wpm,
  colorPhase,
  showORP = true,
  guidedShowOVP,
  guidedShowSweep,
  guidedPacerStyle,
  guidedFocusTarget,
  guidedMergeShortFunctionWords,
  guidedLength,
  generationDifficulty = 'normal',
  generationSweepReveal = true,
  generationMaskSeed = 0,
  generationReveal = false,
}: ReaderProps) {
  // Guided mode uses its own reader component
  if (displayMode === 'guided') {
    return <GuidedReader page={guidedPage ?? null} chunk={chunk} isPlaying={isPlaying} showPacer={showPacer} wpm={wpm} guidedShowOVP={guidedShowOVP} guidedShowSweep={guidedShowSweep} guidedPacerStyle={guidedPacerStyle} guidedFocusTarget={guidedFocusTarget} guidedMergeShortFunctionWords={guidedMergeShortFunctionWords} guidedLength={guidedLength} />;
  }
  if (displayMode === 'generation') {
    return (
      <GuidedReader
        page={guidedPage ?? null}
        chunk={chunk}
        isPlaying={isPlaying}
        showPacer={showPacer}
        wpm={wpm}
        generationMode
        generationDifficulty={generationDifficulty}
        generationSweepReveal={generationSweepReveal}
        generationMaskSeed={generationMaskSeed}
        generationReveal={generationReveal}
        guidedShowOVP={false}
        guidedPacerStyle="sweep"
        guidedFocusTarget="fixation"
        guidedMergeShortFunctionWords={false}
        guidedLength={guidedLength}
      />
    );
  }
  // No article loaded
  if (!chunk) {
    return (
      <div className="reader">
        <div className="reader-display">
          <span className="reader-placeholder">No article loaded</span>
        </div>
      </div>
    );
  }

  // Paragraph break marker
  if (isBreakChunk(chunk)) {
    return (
      <div className="reader">
        <div className="reader-display">
          <span className="reader-break">{chunk.text}</span>
        </div>
      </div>
    );
  }

  const { text } = chunk;

  // For multi-word chunks, place ORP on the first content word (skip function words).
  // Function words are predictable enough to process from a nearby fixation even
  // without the parafoveal preview that natural guided reading provides.
  // For single words or when all words are function words, fall back to chunk center.
  let orp = calculateORP(text);
  if (text.includes(' ')) {
    const words = text.split(' ');
    let offset = 0;
    for (const word of words) {
      if (!FUNCTION_WORDS.has(word.toLowerCase().replace(/[^a-z]/g, ''))) {
        orp = offset + calculateORP(word);
        break;
      }
      offset += word.length + 1;
    }
  }

  const beforeOrp = text.slice(0, orp);
  const orpChar = text[orp] || '';
  const afterOrp = text.slice(orp + 1);

  return (
    <div className="reader">
      <div className={`reader-display${colorPhase ? ` reader-color-${colorPhase}` : ''}`}>
        <div className="reader-text">
          <span className="reader-before">{beforeOrp}</span>
          <span className={showORP ? 'reader-orp' : 'reader-before'}>{orpChar}</span>
          <span className="reader-after">{afterOrp}</span>
        </div>
        <div className="reader-marker">▲</div>
      </div>
    </div>
  );
}
