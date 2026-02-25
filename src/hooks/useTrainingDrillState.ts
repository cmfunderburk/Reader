import { useState, useEffect, useRef } from 'react';
import type { CorpusFamily, CorpusInfo, CorpusTier } from '../types/electron';
import { loadDrillState, saveDrillState } from '../lib/storage';
import { MAX_WPM, MIN_WPM } from '../lib/wpm';

const DRILL_TIERS: CorpusTier[] = ['easy', 'medium', 'hard'];

interface UseTrainingDrillStateParams {
  initialWpm: number;
  wpm: number;
  setWpm: (wpm: number) => void;
  onWpmChange: (wpm: number) => void;
}

interface UseTrainingDrillStateReturn {
  initialDrillWpm: number;
  drillCorpusFamily: CorpusFamily;
  setDrillCorpusFamily: (family: CorpusFamily) => void;
  drillTier: CorpusTier;
  setDrillTier: (tier: CorpusTier) => void;
  corpusInfo: CorpusInfo | null;
  autoAdjustDifficulty: boolean;
  setAutoAdjustDifficulty: (on: boolean) => void;
  drillMinWpm: number;
  setDrillMinWpm: (wpm: number) => void;
  drillMaxWpm: number;
  setDrillMaxWpm: (wpm: number) => void;
  rollingScores: number[];
  setRollingScores: React.Dispatch<React.SetStateAction<number[]>>;
}

export function useTrainingDrillState({
  initialWpm,
  wpm,
  setWpm,
  onWpmChange,
}: UseTrainingDrillStateParams): UseTrainingDrillStateReturn {
  // Stable ref for the WPM change callback to avoid effect re-fires.
  const onWpmChangeRef = useRef(onWpmChange);
  onWpmChangeRef.current = onWpmChange;

  // Load persisted drill state once on mount (used as defaults below)
  const [savedDrill] = useState(() => loadDrillState());

  const initialDrillWpm = savedDrill?.wpm ?? initialWpm;

  const [drillCorpusFamily, setDrillCorpusFamily] = useState<CorpusFamily>(
    () => savedDrill?.corpusFamily ?? 'wiki'
  );
  const [drillTier, setDrillTier] = useState<CorpusTier>(
    () => savedDrill?.tier ?? 'hard'
  );
  const [corpusInfo, setCorpusInfo] = useState<CorpusInfo | null>(null);
  const [autoAdjustDifficulty, setAutoAdjustDifficulty] = useState(
    () => savedDrill?.autoAdjustDifficulty ?? false
  );
  const [drillMinWpm, setDrillMinWpm] = useState(
    () => savedDrill?.minWpm ?? Math.max(MIN_WPM, (savedDrill?.wpm ?? initialWpm) - 50)
  );
  const [drillMaxWpm, setDrillMaxWpm] = useState(
    () => savedDrill?.maxWpm ?? Math.min(MAX_WPM, (savedDrill?.wpm ?? initialWpm) + 50)
  );
  const [rollingScores, setRollingScores] = useState<number[]>(
    () => savedDrill?.rollingScores ?? []
  );

  // Check corpus availability on mount
  useEffect(() => {
    let cancelled = false;
    window.corpus?.getInfo()
      .then((info) => {
        if (cancelled) return;
        setCorpusInfo(info ?? null);
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn('Failed to load corpus info', error);
        setCorpusInfo(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist cross-session drill state whenever it changes
  useEffect(() => {
    saveDrillState({
      wpm,
      rollingScores,
      corpusFamily: drillCorpusFamily,
      tier: drillTier,
      minWpm: drillMinWpm,
      maxWpm: drillMaxWpm,
      autoAdjustDifficulty,
    });
  }, [wpm, rollingScores, drillCorpusFamily, drillTier, drillMinWpm, drillMaxWpm, autoAdjustDifficulty]);

  // Keep selected tier valid for the selected corpus family.
  useEffect(() => {
    const familyInfo = corpusInfo?.[drillCorpusFamily];
    if (!familyInfo) return;
    if (familyInfo[drillTier]?.available) return;
    const fallbackTier = DRILL_TIERS.find(t => familyInfo[t]?.available);
    if (fallbackTier) setDrillTier(fallbackTier);
  }, [corpusInfo, drillCorpusFamily, drillTier]);

  // WPM range clamping
  useEffect(() => {
    if (drillMinWpm > drillMaxWpm) {
      setDrillMaxWpm(drillMinWpm);
      return;
    }
    if (!autoAdjustDifficulty) return;
    if (wpm < drillMinWpm) {
      setWpm(drillMinWpm);
      onWpmChangeRef.current(drillMinWpm);
    } else if (wpm > drillMaxWpm) {
      setWpm(drillMaxWpm);
      onWpmChangeRef.current(drillMaxWpm);
    }
  }, [autoAdjustDifficulty, drillMinWpm, drillMaxWpm, wpm, setWpm]);

  return {
    initialDrillWpm,
    drillCorpusFamily,
    setDrillCorpusFamily,
    drillTier,
    setDrillTier,
    corpusInfo,
    autoAdjustDifficulty,
    setAutoAdjustDifficulty,
    drillMinWpm,
    setDrillMinWpm,
    drillMaxWpm,
    setDrillMaxWpm,
    rollingScores,
    setRollingScores,
  };
}

export { DRILL_TIERS };
export type { UseTrainingDrillStateReturn };
