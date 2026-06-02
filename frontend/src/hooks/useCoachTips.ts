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

  // Refs to read current state inside callbacks without stale closures
  const activeRef = useRef(activeTips);
  activeRef.current = activeTips;
  const pinnedRef = useRef(pinnedTips);
  pinnedRef.current = pinnedTips;

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

    // Move previous active tip to history (read from ref, not inside updater)
    const prevActive = activeRef.current;
    if (prevActive.length > 0) {
      const old = prevActive[0];
      setHistoryTips((h) => [old, ...h].slice(0, MAX_HISTORY));
      const oldTimer = timersRef.current.get(old.id);
      if (oldTimer) {
        clearTimeout(oldTimer);
        timersRef.current.delete(old.id);
      }
    }

    setActiveTips([tip]);

    // Schedule auto-dismiss
    const timer = setTimeout(() => {
      setActiveTips((prev) => prev.filter((t) => t.id !== id));
      setHistoryTips((h) => [tip, ...h].slice(0, MAX_HISTORY));
      timersRef.current.delete(id);
    }, AUTO_DISMISS_MS);
    timersRef.current.set(id, timer);
  }, []);

  const pinTip = useCallback((id: string) => {
    // Check if this tip is currently active
    const active = activeRef.current;
    const found = active.find((t) => t.id === id);
    if (found) {
      // Pin: move from active to pinned, cancel timer
      const timer = timersRef.current.get(id);
      if (timer) {
        clearTimeout(timer);
        timersRef.current.delete(id);
      }
      setActiveTips((prev) => prev.filter((t) => t.id !== id));
      setPinnedTips((pt) => [{ ...found, isPinned: true }, ...pt].slice(0, MAX_HISTORY));
      return;
    }

    // Check if already pinned → unpin: move to history
    const pinned = pinnedRef.current;
    const pf = pinned.find((t) => t.id === id);
    if (pf) {
      setPinnedTips((prev) => prev.filter((t) => t.id !== id));
      setHistoryTips((h) => [{ ...pf, isPinned: false }, ...h].slice(0, MAX_HISTORY));
    }
  }, []);

  const dismissTip = useCallback((id: string) => {
    // Cancel timer if active
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }

    // Remove from active (read from ref)
    const active = activeRef.current;
    const foundActive = active.find((t) => t.id === id);
    if (foundActive) {
      setHistoryTips((h) => [{ ...foundActive, isPinned: false }, ...h].slice(0, MAX_HISTORY));
    }
    setActiveTips((prev) => prev.filter((t) => t.id !== id));

    // Remove from pinned
    const pinned = pinnedRef.current;
    const foundPinned = pinned.find((t) => t.id === id);
    if (foundPinned) {
      setHistoryTips((h) => [{ ...foundPinned, isPinned: false }, ...h].slice(0, MAX_HISTORY));
    }
    setPinnedTips((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearHistory = useCallback(() => {
    setHistoryTips([]);
  }, []);

  return { activeTips, pinnedTips, historyTips, addTip, pinTip, dismissTip, clearHistory };
}
