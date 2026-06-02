import React, { useState, useEffect, useRef } from 'react';
import type { CoachTipDisplay } from '../types';

interface CoachBubbleProps {
  tip: CoachTipDisplay;
  onPin: (id: string) => void;
  onDismiss: (id: string) => void;
}

/** Remaining seconds display for auto-dismiss countdown */
function CountdownBadge({ createdAt, isPinned }: { createdAt: number; isPinned: boolean }) {
  const [remaining, setRemaining] = useState(10);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isPinned) {
      setRemaining(0);
      return;
    }
    const elapsed = (Date.now() - createdAt) / 1000;
    const initial = Math.max(0, Math.ceil(10 - elapsed));
    setRemaining(initial);

    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPinned, createdAt]);

  if (isPinned) return null;
  if (remaining <= 0) return null;

  return (
    <span className="text-[8px] text-[#d29922] ml-auto flex-shrink-0">⏱ {remaining}s</span>
  );
}

export default function CoachBubble({ tip, onPin, onDismiss }: CoachBubbleProps) {
  const [fading, setFading] = useState(false);

  // Trigger fade animation 2s before auto-dismiss
  useEffect(() => {
    if (tip.isPinned) return;
    const elapsed = Date.now() - tip.timestamp;
    const remaining = Math.max(0, 10000 - elapsed);
    if (remaining <= 2000) {
      setFading(true);
    } else {
      const fadeStart = setTimeout(() => setFading(true), remaining - 2000);
      return () => clearTimeout(fadeStart);
    }
  }, [tip.isPinned, tip.timestamp]);

  const borderStyle = tip.isPinned ? 'solid' : 'dashed';

  return (
    <div className="flex justify-center">
      <div
        className={`w-[92%] max-w-lg rounded-xl px-3.5 py-2.5 transition-all duration-500
          ${fading ? 'opacity-40' : 'opacity-100'}`}
        style={{
          background: `${tip.color}0D`,
          border: `1.5px ${borderStyle} ${tip.color}66`,
          boxShadow: tip.isPinned ? `0 0 12px ${tip.color}20` : 'none',
        }}
      >
        {/* Header row */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-xs">{tip.icon}</span>
          <span className="text-[10px] font-semibold tracking-wide" style={{ color: tip.color }}>
            {tip.label}
          </span>
          <span className="text-[8px] px-1.5 py-0.5 rounded text-[var(--text-placeholder)] bg-[var(--bg-tertiary)]">
            {tip.trigger}
          </span>
          {tip.isPinned && (
            <span className="text-[8px] px-1.5 py-0.5 rounded text-[var(--accent-purple)] bg-[var(--accent-purple)]/10 ml-auto">
              📌 已钉住
            </span>
          )}
          {!tip.isPinned && (
            <CountdownBadge createdAt={tip.timestamp} isPinned={tip.isPinned} />
          )}
        </div>

        {/* Content */}
        <p className="text-[11px] text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">
          {tip.content}
        </p>

        {/* Action buttons */}
        <div className="flex justify-end gap-2 mt-2">
          {!tip.isPinned && (
            <button
              onClick={() => onPin(tip.id)}
              className="text-[9px] px-2 py-1 rounded-md border transition-colors"
              style={{
                color: tip.color,
                borderColor: `${tip.color}40`,
                background: `${tip.color}10`,
              }}
            >
              📌 钉住
            </button>
          )}
          {tip.isPinned && (
            <button
              onClick={() => onPin(tip.id)}
              className="text-[9px] px-2 py-1 rounded-md border border-[var(--border-default)] text-[var(--text-placeholder)] hover:text-[var(--text-secondary)] transition-colors"
            >
              取消钉住
            </button>
          )}
          <button
            onClick={() => onDismiss(tip.id)}
            className="text-[9px] px-2 py-1 rounded-md border border-[var(--border-default)] text-[var(--text-placeholder)] hover:text-[var(--text-secondary)] transition-colors"
          >
            忽略
          </button>
        </div>
      </div>
    </div>
  );
}
