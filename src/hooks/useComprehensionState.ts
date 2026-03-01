import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  loadComprehensionAttempts,
  getComprehensionApiKeyStorageMode,
  loadPreferredComprehensionApiKey,
  savePreferredComprehensionApiKey,
} from '../lib/storage';
import type { ComprehensionApiKeyStorageMode } from '../lib/storage';
import type {
  ComprehensionAttempt,
  ComprehensionGeminiModel,
  SRSCard,
  SRSCardStatus,
} from '../types';
import { createComprehensionAdapter } from '../lib/comprehensionAdapter';
import type { ComprehensionAdapter } from '../lib/comprehensionAdapter';
import {
  loadSRSPool,
  saveSRSPool,
  ingestComprehensionAttempt,
  backfillFromAttempts,
  updateCardAfterReview,
  updateCardStatus,
  deleteCard,
  resetCard,
  hasInitializedSRSBackfill,
  markSRSBackfillInitialized,
} from '../lib/srsStore';

interface UseComprehensionStateParams {
  comprehensionGeminiModel: ComprehensionGeminiModel;
}

interface UseComprehensionStateReturn {
  // State
  comprehensionApiKey: string;
  comprehensionApiKeyStorageMode: ComprehensionApiKeyStorageMode;
  comprehensionAttempts: ComprehensionAttempt[];
  srsCards: SRSCard[];
  srsSessionCards: SRSCard[];
  setSrsSessionCards: React.Dispatch<React.SetStateAction<SRSCard[]>>;
  comprehensionAdapter: ComprehensionAdapter;

  // Callbacks
  handleComprehensionApiKeyChange: (apiKey: string) => Promise<void>;
  handleComprehensionAttemptSaved: (attempt: ComprehensionAttempt) => void;
  handleSRSCardReviewed: (cardKey: string, selfGradeCorrect: boolean) => void;
  handleSRSCardStatusChange: (cardKey: string, status: SRSCardStatus) => void;
  handleDeleteSRSCard: (cardKey: string) => void;
  handleResetSRSCard: (cardKey: string) => void;
}

export function useComprehensionState({
  comprehensionGeminiModel,
}: UseComprehensionStateParams): UseComprehensionStateReturn {
  const [comprehensionApiKey, setComprehensionApiKey] = useState<string>('');
  const [comprehensionApiKeyStorageMode, setComprehensionApiKeyStorageMode] = useState<ComprehensionApiKeyStorageMode>('local');
  const [comprehensionAttempts, setComprehensionAttempts] = useState<ComprehensionAttempt[]>(() => loadComprehensionAttempts());
  const [srsCards, setSrsCards] = useState(() => loadSRSPool());
  const [srsSessionCards, setSrsSessionCards] = useState<SRSCard[]>([]);

  const comprehensionAdapter = useMemo(() => {
    return createComprehensionAdapter({
      apiKey: comprehensionApiKey || undefined,
      model: comprehensionGeminiModel,
    });
  }, [comprehensionApiKey, comprehensionGeminiModel]);

  // Load API key on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storageMode, apiKey] = await Promise.all([
        getComprehensionApiKeyStorageMode(),
        loadPreferredComprehensionApiKey(),
      ]);
      if (cancelled) return;
      setComprehensionApiKeyStorageMode(storageMode);
      setComprehensionApiKey(apiKey ?? '');
    })().catch((err) => {
      console.error('Failed to initialize comprehension API key storage', err);
      if (cancelled) return;
      setComprehensionApiKeyStorageMode('unavailable');
      setComprehensionApiKey('');
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-backfill SRS pool from existing comprehension attempts on first load
  useEffect(() => {
    if (!hasInitializedSRSBackfill()) {
      if (srsCards.length === 0 && comprehensionAttempts.length > 0) {
        const backfilled = backfillFromAttempts(comprehensionAttempts);
        setSrsCards(backfilled);
        saveSRSPool(backfilled);
      }
      markSRSBackfillInitialized();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — run once on mount

  const handleComprehensionApiKeyChange = useCallback(async (apiKey: string) => {
    const normalizedApiKey = apiKey.trim();
    await savePreferredComprehensionApiKey(normalizedApiKey);
    setComprehensionApiKey(normalizedApiKey);
    setComprehensionApiKeyStorageMode(await getComprehensionApiKeyStorageMode());
  }, []);

  const handleComprehensionAttemptSaved = useCallback((attempt: ComprehensionAttempt) => {
    setComprehensionAttempts((existing) => [attempt, ...existing].slice(0, 200));
    setSrsCards((existing) => {
      const updated = ingestComprehensionAttempt(existing, attempt, Date.now());
      saveSRSPool(updated);
      return updated;
    });
  }, []);

  const handleSRSCardReviewed = useCallback((cardKey: string, selfGradeCorrect: boolean) => {
    setSrsCards((existing) => {
      const updated = updateCardAfterReview(existing, cardKey, selfGradeCorrect, Date.now());
      saveSRSPool(updated);
      return updated;
    });
  }, []);

  const handleSRSCardStatusChange = useCallback((cardKey: string, status: SRSCardStatus) => {
    setSrsCards((existing) => {
      const updated = updateCardStatus(existing, cardKey, status);
      saveSRSPool(updated);
      return updated;
    });
  }, []);

  const handleDeleteSRSCard = useCallback((cardKey: string) => {
    setSrsCards((existing) => {
      const updated = deleteCard(existing, cardKey);
      saveSRSPool(updated);
      return updated;
    });
  }, []);

  const handleResetSRSCard = useCallback((cardKey: string) => {
    setSrsCards((existing) => {
      const updated = resetCard(existing, cardKey, Date.now());
      saveSRSPool(updated);
      return updated;
    });
  }, []);

  return {
    comprehensionApiKey,
    comprehensionApiKeyStorageMode,
    comprehensionAttempts,
    srsCards,
    srsSessionCards,
    setSrsSessionCards,
    comprehensionAdapter,
    handleComprehensionApiKeyChange,
    handleComprehensionAttemptSaved,
    handleSRSCardReviewed,
    handleSRSCardStatusChange,
    handleDeleteSRSCard,
    handleResetSRSCard,
  };
}
