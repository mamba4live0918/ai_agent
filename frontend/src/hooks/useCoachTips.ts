import { useState, useRef, useCallback, useEffect } from 'react';
import type { CoachTipDisplay } from '../types';
import { TRIGGER_CONFIG, DEFAULT_TRIGGER } from '../types';

const AUTO_DISMISS_MS = 10_000;
const MAX_HISTORY = 20;

export interface UseCoachTips {
  activeTips: CoachTipDisplay[];
  pinnedTips: CoachTipDisplay[];
  historyTips: CoachTipDisplay[];
  addTip: (trigger: string, action: string, content: string) => void;
  pinTip: (id: string) => void;
  dismissTip: (id: string) => void;
  clearHistory: () => void;
}

export function useCoachTips(): UseCoachTips {
  const [activeTips, setActiveTips] = useState<CoachTipDisplay[]>([]);
  const [pinnedTips, setPinnedTips] = useState<CoachTipDisplay[]>([]);
  const [historyTips, setHistoryTips] = useState<CoachTipDisplay[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const idCounterRef = useRef(0);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
    };
  }, []);

  const addTip = useCallback((trigger: string, action: string, content: string) => {
    const cfg = TRIGGER_CONFIG[trigger] || DEFAULT_TRIGGER;
    const id = `coach-tip-${++idCounterRef.current}-${Date.now()}`;
    const tip: CoachTipDisplay = {
      id,
      trigger,
      action,
      content,
      color: cfg.color,
      icon: cfg.icon,
      label: cfg.label,
      timestamp: Date.now(),
      isPinned: false,
    };

    setActiveTips((prev) => {
      // Only keep newest tip visible; move previous active to history
      if (prev.length > 0) {
        setHistoryTips((h) => [prev[0], ...h].slice(0, MAX_HISTORY));
        // Clear old timer
        const oldTimer = timersRef.current.get(prev[0].id);
        if (oldTimer) {
          clearTimeout(oldTimer);
          timersRef.current.delete(prev[0].id);
        }
      }
      return [tip];
    });

    // Schedule auto-dismiss
    const timer = setTimeout(() => {
      setActiveTips((prev) => prev.filter((t) => t.id !== id));
      setHistoryTips((h) => [{ ...tip, isPinned: false }, ...h].slice(0, MAX_HISTORY));
      timersRef.current.delete(id);
    }, AUTO_DISMISS_MS);
    timersRef.current.set(id, timer);
  }, []);

  const pinTip = useCallback((id: string) => {
    setActiveTips((prev) => {
      const found = prev.find((t) => t.id === id);
      if (found) {
        // Cancel timer
        const timer = timersRef.current.get(id);
        if (timer) {
          clearTimeout(timer);
          timersRef.current.delete(id);
        }
        const pinned = { ...found, isPinned: true };
        setPinnedTips((pt) => [pinned, ...pt].slice(0, MAX_HISTORY));
        return prev.filter((t) => t.id !== id);
      }
      // Check pinnedTips (unpin)
      setPinnedTips((pt) => {
        const pf = pt.find((t) => t.id === id);
        if (pf) {
          return pt.filter((t) => t.id !== id);
        }
        return pt;
      });
      return prev;
    });
  }, []);

  const dismissTip = useCallback((id: string) => {
    // Cancel timer if active
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setActiveTips((prev) => {
      const found = prev.find((t) => t.id === id);
      if (found) {
        setHistoryTips((h) => [{ ...found, isPinned: false }, ...h].slice(0, MAX_HISTORY));
      }
      return prev.filter((t) => t.id !== id);
    });
    setPinnedTips((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearHistory = useCallback(() => {
    setHistoryTips([]);
  }, []);

  return { activeTips, pinnedTips, historyTips, addTip, pinTip, dismissTip, clearHistory };
}
