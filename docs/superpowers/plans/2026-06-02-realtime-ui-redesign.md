# Real-Time Voice UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 3-column RealTimeVoice layout with a 2-column chat-bubble UI where coach tips are inline in the conversation flow.

**Architecture:** 4 new components (ChatBubble, CoachBubble, RecordingBar, CustomerPicker) + 1 new hook (useCoachTips) + 1 rewrite (RealTimeVoice.tsx) + 2 deletions (RealtimeCoach.tsx, RealtimeTranscript.tsx). Backend and useRealtimeASR unchanged.

**Tech Stack:** React 19 + TypeScript + Tailwind CSS + CSS variables (dark/light theme)

---

### Task 1: Add CoachTipDisplay type to types/index.ts

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Add CoachTipDisplay and TRIGGER_CONFIG types**

Append after the existing `RealtimeSessionDetail` interface (line ~531):

```typescript
// ─── Coach Tip Display (inline bubble) ───

export interface CoachTipDisplay {
  id: string;
  trigger: string;       // rule_id from backend: "hesitation", "price_objection", etc.
  action: string;        // action type from backend
  content: string;       // DeepSeek-generated coach text
  color: string;         // accent color for border/icon
  icon: string;          // emoji icon
  label: string;         // Chinese label
  timestamp: number;     // Date.now() when received
  isPinned: boolean;     // user pinned this tip
}

export const TRIGGER_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  hesitation:           { icon: '💡', label: '策略建议', color: '#a371f7' },
  price_objection:      { icon: '💰', label: '价格异议', color: '#ff7b72' },
  competitor_mention:   { icon: '🔍', label: '竞品分析', color: '#d29922' },
  commitment_signal:    { icon: '⭐', label: '销售金句', color: '#3fb950' },
  objection:            { icon: '⚠️', label: '反对处理', color: '#ffa657' },
  long_silence:         { icon: '🧊', label: '静默提醒', color: '#79c0ff' },
  emotional_shift:      { icon: '🎯', label: '情绪感知', color: '#ff7be1' },
  multi_party:          { icon: '🎯', label: '情绪感知', color: '#ff7be1' },
};

/** Fallback for unknown trigger rules */
export const DEFAULT_TRIGGER = { icon: '💡', label: '教练提示', color: '#a371f7' };
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: no new errors introduced by type additions.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat: add CoachTipDisplay type and TRIGGER_CONFIG for inline coach bubbles"
```

---

### Task 2: Create useCoachTips hook

**Files:**
- Create: `frontend/src/hooks/useCoachTips.ts`

- [ ] **Step 1: Write useCoachTips.ts**

```typescript
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
      // Only keep newest tip visible at a time; move previous active to history
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useCoachTips.ts
git commit -m "feat: add useCoachTips hook for coach tip queue management"
```

---

### Task 3: Create ChatBubble component

**Files:**
- Create: `frontend/src/components/ChatBubble.tsx`

- [ ] **Step 1: Write ChatBubble.tsx**

```typescript
import React from 'react';

export interface ChatBubbleProps {
  text: string;
  timestamp: number;    // seconds offset in recording
  speaker: string;      // "销售" | "客户" | other
  isSelf: boolean;      // true = right-aligned blue, false = left-aligned gray
  confidence?: number;  // ASR confidence 0-1
}

/** Format seconds to HH:MM:SS or MM:SS */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function ChatBubble({ text, timestamp, speaker, isSelf, confidence }: ChatBubbleProps) {
  return (
    <div className={`flex ${isSelf ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] ${isSelf ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
        {/* Speaker label */}
        <span className={`text-[10px] font-medium px-1 ${
          isSelf ? 'text-[var(--accent-blue)] self-end' : 'text-[var(--accent-green)] self-start'
        }`}>
          {speaker}
          {confidence != null && confidence < 0.7 && (
            <span className="ml-1 text-[var(--text-placeholder)]" title="低置信度">~</span>
          )}
        </span>

        {/* Bubble body */}
        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          isSelf
            ? 'bg-[var(--btn-blue)] text-white rounded-br-md'
            : 'bg-[var(--bg-primary)] text-[var(--text-primary)] rounded-bl-md border border-[var(--border-subtle)]'
        }`}>
          {text}
        </div>

        {/* Timestamp */}
        <span className={`text-[10px] text-[var(--text-placeholder)] px-1 ${isSelf ? 'self-end' : 'self-start'}`}>
          {formatTime(timestamp)}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ChatBubble.tsx
git commit -m "feat: add ChatBubble component — reusable chat bubble for realtime/training/post_sales"
```

---

### Task 4: Create CoachBubble component

**Files:**
- Create: `frontend/src/components/CoachBubble.tsx`

- [ ] **Step 1: Write CoachBubble.tsx**

```typescript
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
  const borderOpacity = tip.isPinned ? '0.6' : '0.5';

  return (
    <div className="flex justify-center">
      <div
        className={`w-[92%] max-w-lg rounded-xl px-3.5 py-2.5 transition-all duration-500
          ${fading ? 'opacity-40' : 'opacity-100'}`}
        style={{
          background: `${tip.color}0D`,
          border: `1.5px ${borderStyle} ${tip.color}${borderOpacity.replace('0.', '')}`,
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CoachBubble.tsx
git commit -m "feat: add CoachBubble component — inline coach tip with pin/dismiss/auto-fade"
```

---

### Task 5: Create RecordingBar component

**Files:**
- Create: `frontend/src/components/RecordingBar.tsx`

- [ ] **Step 1: Write RecordingBar.tsx**

```typescript
import React from 'react';
import type { ConnectionState } from '../hooks/useRealtimeASR';

interface RecordingBarProps {
  isRecording: boolean;
  connectionState: ConnectionState;
  elapsed: number;        // seconds since recording started
  onStart: () => void;
  onStop: () => void;
}

const STATUS_LABELS: Record<ConnectionState, string> = {
  idle: '就绪',
  connecting: '连接中...',
  streaming: '录制中',
  disconnected: '已断开',
};

const STATUS_DOT: Record<ConnectionState, string> = {
  idle: 'var(--text-placeholder)',
  connecting: 'var(--accent-orange)',
  streaming: 'var(--accent-green)',
  disconnected: 'var(--accent-red)',
};

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function RecordingBar({ isRecording, connectionState, elapsed, onStart, onStop }: RecordingBarProps) {
  return (
    <div className="px-4 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-primary)] flex items-center justify-center gap-4 flex-shrink-0">
      {/* Connection status */}
      <div className="flex items-center gap-2">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: STATUS_DOT[connectionState] }}
        />
        <span className="text-[10px] text-[var(--text-secondary)] hidden sm:inline">
          {STATUS_LABELS[connectionState]}
        </span>
      </div>

      {/* Action button */}
      {!isRecording ? (
        <button
          onClick={onStart}
          disabled={connectionState === 'connecting'}
          className="px-6 py-2.5 text-sm font-medium rounded-full bg-[var(--btn-danger)] text-white
            hover:bg-[var(--accent-red)] disabled:opacity-50 disabled:cursor-not-allowed
            transition-all duration-200 flex items-center gap-2
            shadow-lg shadow-[var(--btn-danger)]/20 active:scale-95"
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1.5a5.25 5.25 0 1 0 0 10.5A5.25 5.25 0 0 0 8 1.5ZM8 0a6.75 6.75 0 1 1 0 13.5A6.75 6.75 0 0 1 8 0Zm-.75 4.5a.75.75 0 0 1 1.5 0v3a.75.75 0 0 1-1.5 0v-3ZM8 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
          </svg>
          开始录音
        </button>
      ) : (
        <>
          {/* Timer */}
          <span className="text-sm text-[var(--text-primary)] font-mono tabular-nums font-medium">
            {formatTimer(elapsed)}
          </span>

          {/* Recording pulse dot */}
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-red)] opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--accent-red)]" />
          </span>

          {/* Stop button */}
          <button
            onClick={onStop}
            className="px-6 py-2.5 text-sm font-medium rounded-full border-2 border-[var(--border-default)]
              text-[var(--text-primary)] hover:border-[var(--accent-red)]/50 hover:text-[var(--accent-red)]
              transition-all duration-200 flex items-center gap-2 active:scale-95"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
              <rect x="4.5" y="3" width="7" height="10" rx="1.5" />
            </svg>
            停止录音
          </button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/RecordingBar.tsx
git commit -m "feat: add RecordingBar component — bottom control bar with start/stop/timer/status"
```

---

### Task 6: Create CustomerPicker component

**Files:**
- Create: `frontend/src/components/CustomerPicker.tsx`

- [ ] **Step 1: Write CustomerPicker.tsx**

```typescript
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Customer } from '../types';
import { getCustomers } from '../services/api';

interface CustomerPickerProps {
  selected: Customer | null;
  onSelect: (customer: Customer) => void;
  onClear: () => void;
}

export default function CustomerPicker({ selected, onSelect, onClear }: CustomerPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [list, setList] = useState<Customer[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const searchCustomers = useCallback(async (q: string) => {
    try {
      const result = await getCustomers(q || undefined, 1, 10);
      setList(result.items);
    } catch {
      setList([]);
    }
  }, []);

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      {selected ? (
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
            bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]
            border border-[var(--accent-blue)]/30 hover:bg-[var(--accent-blue)]/20
            transition-all duration-200"
          title="切换客户"
        >
          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1.5a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5ZM3.25 14a4.75 4.75 0 0 1 9.5 0 .75.75 0 0 1-1.5 0 3.25 3.25 0 0 0-6.5 0 .75.75 0 0 1-1.5 0Z"/>
          </svg>
          {selected.name}
          <span
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="ml-0.5 text-[var(--text-placeholder)] hover:text-[var(--accent-red)] transition-colors"
          >×</span>
        </button>
      ) : (
        <button
          onClick={() => { setOpen(true); searchCustomers(''); }}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs
            text-[var(--text-placeholder)] border border-dashed border-[var(--border-subtle)]
            hover:text-[var(--text-secondary)] hover:border-[var(--border-default)]
            transition-all duration-200"
          title="关联客户（可选）"
        >
          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1.5a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5ZM3.25 14a4.75 4.75 0 0 1 9.5 0 .75.75 0 0 1-1.5 0 3.25 3.25 0 0 0-6.5 0 .75.75 0 0 1-1.5 0Z M13.25 7a.75.75 0 0 1 .75.75v2.5h2.5a.75.75 0 0 1 0 1.5H14v2.5a.75.75 0 0 1-1.5 0v-2.5H10a.75.75 0 0 1 0-1.5h2.5v-2.5a.75.75 0 0 1 .75-.75Z"/>
          </svg>
          关联客户
        </button>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full mt-1 left-0 w-64 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-xl shadow-xl z-30 overflow-hidden">
          <div className="p-2 border-b border-[var(--border-subtle)]">
            <input
              type="text"
              placeholder="搜索客户..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); searchCustomers(e.target.value); }}
              className="w-full bg-[var(--bg-secondary)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-placeholder)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)]/30"
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {list.length === 0 ? (
              <p className="px-3 py-4 text-[11px] text-[var(--text-placeholder)] text-center">暂无匹配客户</p>
            ) : (
              list.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { onSelect(c); setOpen(false); }}
                  className="w-full text-left px-3 py-2 hover:bg-[var(--bg-secondary)] transition-colors text-xs text-[var(--text-primary)] border-b border-[var(--border-subtle)] last:border-0"
                >
                  <span className="font-medium">{c.name}</span>
                  {c.ai_profile && (
                    <span className="text-[var(--text-placeholder)] ml-2">
                      {(c.ai_profile as Record<string, unknown>).disc_type || ''}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CustomerPicker.tsx
git commit -m "feat: add CustomerPicker component — reusable customer search/select dropdown"
```

---

### Task 7: Rewrite RealTimeVoice.tsx

**Files:**
- Modify: `frontend/src/pages/RealTimeVoice.tsx`
- Delete: `frontend/src/components/RealtimeCoach.tsx`
- Delete: `frontend/src/components/RealtimeTranscript.tsx`

- [ ] **Step 1: Rewrite RealTimeVoice.tsx (543 → ~180 lines)**

This replaces the entire file. The rewrite:
- Removes the `TranscriptChat` inner component (replaced by `ChatBubble` + `CoachBubble`)
- Removes `getSpeakerRole`, `STATUS_LABELS`, `STATUS_DOT`, `formatTimer`, `formatTimestamp`, `buildProfileText` helpers (moved to their respective components)
- Removes the `RealtimeCoach` import and right-sidebar JSX
- Removes `coachOpen` state and the mobile coach toggle
- Adds `useCoachTips` hook wired to the existing `coachTip` from `useRealtimeASR`
- Inlines `ChatBubble` (for transcript segments) and `CoachBubble` (for active+pinned tips) in the chat scroll area
- Uses `RecordingBar` for the bottom controls
- Uses `CustomerPicker` for the customer selector

```typescript
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRealtimeASR } from '../hooks/useRealtimeASR';
import type { TranscriptSegment } from '../hooks/useRealtimeASR';
import { useCoachTips } from '../hooks/useCoachTips';
import SessionSidebar from '../components/SessionSidebar';
import ChatBubble from '../components/ChatBubble';
import CoachBubble from '../components/CoachBubble';
import RecordingBar from '../components/RecordingBar';
import CustomerPicker from '../components/CustomerPicker';
import type { RealtimeSessionDetail, Customer } from '../types';

// ─── Speaker role helpers ───

function getSpeakerInfo(seg: TranscriptSegment): { label: string; isSelf: boolean } {
  const name = seg.speaker_name || seg.speaker || '';
  if (name === '销售' || seg.speaker === 'speaker_0') {
    return { label: '销售', isSelf: true };
  }
  if (name === '客户' || seg.speaker?.startsWith('speaker_')) {
    return { label: name || '客户', isSelf: false };
  }
  return { label: name || '未知', isSelf: false };
}

function buildProfileText(customer: Customer): string {
  const parts: string[] = [];
  parts.push(`姓名: ${customer.name}`);
  if (customer.ai_profile) {
    const p = customer.ai_profile as Record<string, unknown>;
    if (p.personality_summary) parts.push(`性格: ${p.personality_summary}`);
    if (p.disc_type) parts.push(`DISC类型: ${p.disc_type}`);
    if (p.profile_summary) parts.push(`画像: ${p.profile_summary}`);
  }
  if (customer.scores) {
    const s = customer.scores as Record<string, unknown>;
    if (s.wealth_scale !== undefined) parts.push(`资产等级: ${s.wealth_scale}/10`);
    if (s.risk_tolerance !== undefined) parts.push(`风险偏好: ${s.risk_tolerance}/10`);
  }
  return parts.join(' | ');
}

// ─── Main page ───

export default function RealTimeVoice() {
  const {
    isRecording,
    connectionState,
    transcript,
    error: asrError,
    start,
    stop,
    sendCustomerProfile,
    coachTip,
  } = useRealtimeASR();

  const { activeTips, pinnedTips, addTip, pinTip, dismissTip } = useCoachTips();

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Timer ──
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isRecording) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((n) => n + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  // ── Customer selection ──
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const handleSelectCustomer = useCallback((customer: Customer) => {
    setSelectedCustomer(customer);
    sendCustomerProfile(buildProfileText(customer));
  }, [sendCustomerProfile]);

  const handleClearCustomer = useCallback(() => {
    setSelectedCustomer(null);
    sendCustomerProfile('');
  }, [sendCustomerProfile]);

  // ── Coach tip → hook ──
  const prevCoachTipRef = useRef<typeof coachTip>(null);
  useEffect(() => {
    if (coachTip && coachTip !== prevCoachTipRef.current) {
      prevCoachTipRef.current = coachTip;
      addTip(coachTip.trigger, coachTip.action, coachTip.content);
    }
  }, [coachTip, addTip]);

  // ── Session history ──
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [historyDetail, setHistoryDetail] = useState<RealtimeSessionDetail | null>(null);

  const prevRecordingRef = useRef(isRecording);
  useEffect(() => {
    if (prevRecordingRef.current && !isRecording) {
      setRefreshTrigger((n) => n + 1);
    }
    prevRecordingRef.current = isRecording;
  }, [isRecording]);

  const handleSelectSession = useCallback((detail: RealtimeSessionDetail) => {
    if (detail.session) {
      setHistoryDetail(detail);
      setSelectedSessionId(detail.session.id);
    } else {
      setHistoryDetail(null);
      setSelectedSessionId(null);
    }
    setSidebarOpen(false);
  }, []);

  const handleBackToLive = useCallback(() => {
    setHistoryDetail(null);
    setSelectedSessionId(null);
  }, []);

  // ── Determine segments to display ──
  const displaySegments: TranscriptSegment[] = historyDetail
    ? historyDetail.segments.map((seg) => ({
        start: seg.start,
        end: seg.end,
        text: seg.text,
        confidence: seg.confidence,
        isPartial: false,
        speaker: seg.speaker,
        speaker_name: seg.speaker,
      }))
    : transcript;

  const isHistory = !!historyDetail;

  // Combine all visible tips (active + pinned) in order
  const allVisibleTips = [...activeTips, ...pinnedTips];

  return (
    <div className="flex h-full relative overflow-hidden">
      {/* ── Left: Session history sidebar ── */}
      <div className={`absolute left-0 top-0 bottom-0 z-20 flex flex-row
        transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-[calc(100%-4px)]'}`}>
        <div className="w-[220px] sm:w-[240px] h-full flex flex-col sidebar-glass relative">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-12 rounded-r-lg sidebar-toggle
              flex items-center justify-center hover:bg-[var(--bg-overlay)] hover:shadow-[0_0_8px_rgba(88,166,255,0.15)]
              transition-all duration-200 z-10 group/toggle"
            title={sidebarOpen ? '收起' : '展开'}
          >
            <svg className="w-3 h-3 text-[var(--text-placeholder)] group-hover/toggle:text-[var(--accent-blue)] transition-colors" viewBox="0 0 16 16" fill="currentColor">
              {sidebarOpen ? (
                <path fillRule="evenodd" d="M5.646 3.646a.5.5 0 0 1 .708 0l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L9.293 8 5.646 4.354a.5.5 0 0 1 0-.708Z" clipRule="evenodd"/>
              ) : (
                <path fillRule="evenodd" d="M10.354 3.646a.5.5 0 0 1 0 .708L6.707 8l3.647 3.646a.5.5 0 0 1-.708.708l-4-4a.5.5 0 0 1 0-.708l4-4a.5.5 0 0 1 .708 0Z" clipRule="evenodd"/>
              )}
            </svg>
          </button>
          <div className="flex-1 overflow-hidden">
            <SessionSidebar
              refreshTrigger={refreshTrigger}
              onSelectSession={handleSelectSession}
              selectedSessionId={selectedSessionId}
            />
          </div>
        </div>
      </div>

      {/* Sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="absolute inset-0 z-[15] bg-black/40 backdrop-blur-[2px] transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Main chat area ── */}
      <div className="flex-1 flex flex-col min-w-0 bg-[var(--bg-secondary)]">
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)] flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {/* History toggle */}
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0"
              title="录音历史"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                <path fillRule="evenodd" d="M2 3.75A.75.75 0 0 1 2.75 3h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 3.75Zm0 4a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 7.75Zm0 4a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1-.75-.75Z" clipRule="evenodd"/>
              </svg>
            </button>

            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-[var(--text-primary)] truncate">
                {isHistory ? '历史回放' : '实时语音陪跑'}
              </h2>
              {isHistory && historyDetail && (
                <p className="text-[10px] text-[var(--text-placeholder)] truncate">
                  {historyDetail.segments.length} 条片段 · {historyDetail.session.speaker_count} 人
                </p>
              )}
            </div>

            {/* Customer selector (live mode only) */}
            {!isHistory && (
              <CustomerPicker
                selected={selectedCustomer}
                onSelect={handleSelectCustomer}
                onClear={handleClearCustomer}
              />
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Back to live button */}
            {isHistory && (
              <button
                onClick={handleBackToLive}
                className="px-3 py-1.5 text-xs rounded-full border border-[var(--accent-blue)] text-[var(--accent-blue)] hover:bg-[var(--btn-blue)]/10 transition-all duration-200"
              >
                返回实时
              </button>
            )}
          </div>
        </div>

        {/* Chat transcript + coach bubbles */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {/* Empty state */}
          {displaySegments.length === 0 && !isRecording && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center px-4">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center">
                  <svg className="w-8 h-8 text-[var(--text-placeholder)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                  </svg>
                </div>
                <p className="text-sm text-[var(--text-secondary)] font-medium">实时语音陪跑</p>
                <p className="text-xs text-[var(--text-placeholder)] mt-1">点击下方按钮开始录音，AI 将实时转录并生成教练提示</p>
              </div>
            </div>
          )}

          {/* Recording waiting indicator */}
          {displaySegments.length === 0 && isRecording && (
            <div className="flex justify-center">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--bg-secondary)] text-xs text-[var(--text-secondary)]">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-red)] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--accent-red)]" />
                </span>
                等待语音输入...
              </div>
            </div>
          )}

          {/* Error banner */}
          {asrError && (
            <div className="mx-auto max-w-md px-3 py-2 bg-[var(--btn-danger)]/10 border border-[var(--btn-danger)]/30 rounded-xl text-xs text-[var(--accent-red)] text-center">
              {asrError}
            </div>
          )}

          {/* System start message */}
          {isRecording && displaySegments.length > 0 && (
            <div className="flex justify-center">
              <span className="text-[10px] text-[var(--text-placeholder)] bg-[var(--bg-secondary)] px-3 py-1 rounded-full">
                🎙️ 录音开始{selectedCustomer ? ` · 已关联客户：${selectedCustomer.name}` : ''}
              </span>
            </div>
          )}

          {/* Chat bubbles */}
          {displaySegments.map((seg, i) => {
            const { label, isSelf } = getSpeakerInfo(seg);
            return (
              <ChatBubble
                key={`seg-${seg.start}-${i}`}
                text={seg.text}
                timestamp={seg.start}
                speaker={label}
                isSelf={isSelf}
                confidence={seg.confidence}
              />
            );
          })}

          {/* Coach tips — shown inline after the latest segment */}
          {allVisibleTips.map((tip) => (
            <CoachBubble
              key={tip.id}
              tip={tip}
              onPin={pinTip}
              onDismiss={dismissTip}
            />
          ))}

          {/* Recording indicator at bottom */}
          {isRecording && displaySegments.length > 0 && (
            <div className="flex justify-center pt-1">
              <span className="text-[10px] text-[var(--text-placeholder)] flex items-center gap-1">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-red)] opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[var(--accent-red)]" />
                </span>
                录制中...
              </span>
            </div>
          )}
        </div>

        {/* Bottom recording bar (live mode only) */}
        {!isHistory && (
          <RecordingBar
            isRecording={isRecording}
            connectionState={connectionState}
            elapsed={elapsed}
            onStart={start}
            onStop={stop}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Delete RealtimeCoach.tsx**

```bash
git rm frontend/src/components/RealtimeCoach.tsx
```

- [ ] **Step 3: Delete RealtimeTranscript.tsx**

```bash
git rm frontend/src/components/RealtimeTranscript.tsx
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1`
Expected: no errors (may have pre-existing unrelated warnings).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/RealTimeVoice.tsx frontend/src/components/RealtimeCoach.tsx frontend/src/components/RealtimeTranscript.tsx
git commit -m "refactor: rewrite RealTimeVoice with inline coach bubbles, split into sub-components"
```

---

### Task 8: Verify frontend build

**Files:**
- None (verification only)

- [ ] **Step 1: Run Vite build check**

Run: `cd frontend && npm run build 2>&1`
Expected: build succeeds with no errors. Warnings about chunk size are acceptable.

- [ ] **Step 2: Run TypeScript check**

Run: `cd frontend && npx tsc --noEmit 2>&1`
Expected: no errors.

- [ ] **Step 3: Verify there are no remaining imports of deleted files**

Run: `cd frontend && npx tsc --noEmit 2>&1`
Expected: if there were, tsc would have caught them in step 2.

- [ ] **Step 4: Commit (if any build fixes needed)**

Only if build failed and needed fixes:
```bash
git add -A && git commit -m "fix: resolve build issues from realtime UI refactor"
```

---

### Summary

| Task | Action | Files |
|------|--------|-------|
| 1 | Add types | `types/index.ts` — `CoachTipDisplay` + `TRIGGER_CONFIG` |
| 2 | New hook | `hooks/useCoachTips.ts` |
| 3 | New component | `components/ChatBubble.tsx` |
| 4 | New component | `components/CoachBubble.tsx` |
| 5 | New component | `components/RecordingBar.tsx` |
| 6 | New component | `components/CustomerPicker.tsx` |
| 7 | Rewrite + delete | `pages/RealTimeVoice.tsx`, `rm RealtimeCoach.tsx`, `rm RealtimeTranscript.tsx` |
| 8 | Verify | `npm run build`, `npx tsc --noEmit` |
