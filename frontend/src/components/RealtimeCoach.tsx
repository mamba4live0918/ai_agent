import { useState, useRef, useEffect, useCallback } from 'react';

// ─── Types ───

interface CoachTipItem {
  id: string;
  trigger: string;
  content: string;
  timestamp: number;
  isStreaming: boolean;
  pinned: boolean;
}

interface RealtimeCoachProps {
  connected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}

// ─── Trigger display config ───

const TRIGGER_LABELS: Record<string, string> = {
  price_objection: '价格异议',
  hesitation: '客户犹豫',
  competitor_mention: '竞品对比',
  commitment_signal: '成交信号',
  objection: '客户拒绝',
  long_silence: '长时间沉默',
  multi_party: '多方讨论',
  emotional_shift: '情绪变化',
};

const TRIGGER_BORDERS: Record<string, string> = {
  coach_tip: 'var(--accent-blue)',
  strategy_alert: 'var(--accent-orange)',
  closing_guide: 'var(--btn-primary)',
  objection_handle: '#db6d28',
  break_tip: 'var(--accent-purple)',
  role_analysis: '#39d2c0',
  emotion_alert: 'var(--accent-red)',
};

const MAX_TIPS = 20;

// ─── Helpers ───

function getWsUrl(): string {
  const apiBase =
    import.meta.env.VITE_API_BASE || 'http://localhost:8000/api';
  const wsBase = apiBase.replace(/^http/, 'ws').replace(/\/api\/?$/, '');
  const token = localStorage.getItem('token');
  return `${wsBase}/ws/realtime/session?token=${token || ''}`;
}

function getTriggerLabel(trigger: string): string {
  return TRIGGER_LABELS[trigger] || trigger;
}

function getBorderColor(tipType: string): string {
  return TRIGGER_BORDERS[tipType] || 'var(--text-tertiary)';
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  const s = d.getSeconds().toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// ─── Component ───

export default function RealtimeCoach({
  connected: _connected,
  onConnect,
  onDisconnect,
}: RealtimeCoachProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [tips, setTips] = useState<CoachTipItem[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  /** Maps tip id -> currently displayed char count for typewriter */
  const [displayLen, setDisplayLen] = useState<Record<string, number>>({});

  const wsRef = useRef<WebSocket | null>(null);
  const streamingTargets = useRef<Record<string, string>>({});
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tipsRef = useRef<CoachTipItem[]>([]);
  const pinnedRef = useRef<Set<string>>(new Set());
  const dismissTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  // Allow the typewriter to call stopTypewriter without a dep cycle
  const stopTypewriterRef = useRef<() => void>(() => {});

  // Keep tipsRef in sync
  useEffect(() => {
    tipsRef.current = tips;
  }, [tips]);

  // ── Typewriter engine: single interval advances all streaming tips ──

  const stopTypewriter = useCallback(() => {
    if (typewriterRef.current) {
      clearInterval(typewriterRef.current);
      typewriterRef.current = null;
    }
  }, []);

  // Keep the ref current so the typewriter interval can call the latest stop
  useEffect(() => {
    stopTypewriterRef.current = stopTypewriter;
  }, [stopTypewriter]);

  const startTypewriter = useCallback(() => {
    if (typewriterRef.current) return;
    typewriterRef.current = setInterval(() => {
      const targets = streamingTargets.current;
      const keys = Object.keys(targets);
      if (keys.length === 0) {
        stopTypewriterRef.current();
        return;
      }
      let allDone = true;
      setDisplayLen((prev) => {
        const next = { ...prev };
        for (const [id, target] of Object.entries(targets)) {
          const cur = prev[id] ?? 0;
          if (cur < target.length) {
            next[id] = Math.min(cur + 1, target.length);
            allDone = false;
          }
        }
        return next;
      });
      if (allDone) {
        stopTypewriterRef.current();
      }
    }, 25);
  }, []); // stable — uses refs and functional setState

  // ── WebSocket connection ──

  const disconnect = useCallback(() => {
    stopTypewriter();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    // Clear auto-dismiss timers
    dismissTimers.current.forEach((t) => clearTimeout(t));
    dismissTimers.current.clear();
  }, [stopTypewriter]);

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    stopTypewriter();

    const ws = new WebSocket(getWsUrl());
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      onConnect();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);

        if (data.type === 'coach_tip') {
          const trigger: string = data.trigger || 'coach_tip';
          const content: string = data.content || '';
          const isStreaming: boolean = data.is_streaming ?? false;

          setTips((prev) => {
            const now = Date.now();

            // If streaming, update the existing streaming tip with same trigger
            if (isStreaming) {
              const existingIdx = prev.findIndex(
                (t) => t.isStreaming && t.trigger === trigger,
              );
              if (existingIdx >= 0) {
                const updated = [...prev];
                updated[existingIdx] = {
                  ...updated[existingIdx],
                  content,
                  timestamp: now,
                };
                tipsRef.current = updated;
                // Update target for typewriter
                streamingTargets.current[updated[existingIdx].id] = content;
                startTypewriter();
                return updated;
              }
            }

            // New tip
            const id = crypto.randomUUID
              ? crypto.randomUUID()
              : `${now}-${Math.random().toString(36).slice(2, 9)}`;
            const newTip: CoachTipItem = {
              id,
              trigger,
              content,
              timestamp: now,
              isStreaming,
              pinned: false,
            };

            const next = [newTip, ...prev].slice(0, MAX_TIPS);
            tipsRef.current = next;

            if (isStreaming) {
              streamingTargets.current[id] = content;
              startTypewriter();
            }

            // Auto-dismiss after 10s unless pinned or streaming
            if (!isStreaming && !pinnedRef.current.has(id)) {
              const timer = setTimeout(() => {
                setTips((cur) =>
                  cur.filter(
                    (t) => t.id !== id || pinnedRef.current.has(id),
                  ),
                );
                dismissTimers.current.delete(id);
              }, 10_000);
              dismissTimers.current.set(id, timer);
            }

            return next;
          });
        }
        // transcript messages are received but not processed by this component
      } catch {
        // Non-JSON binary messages ignored
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      onDisconnect();
      stopTypewriter();
      streamingTargets.current = {};
    };

    ws.onerror = () => {
      // onclose will follow
    };
  }, [onConnect, onDisconnect, stopTypewriter, startTypewriter]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTypewriter();
      dismissTimers.current.forEach((t) => clearTimeout(t));
      dismissTimers.current.clear();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [stopTypewriter]);

  // ── Handlers ──

  const handleTogglePin = useCallback((id: string) => {
    if (pinnedRef.current.has(id)) {
      pinnedRef.current.delete(id);
    } else {
      pinnedRef.current.add(id);
      // Clear any pending dismiss timer
      const timer = dismissTimers.current.get(id);
      if (timer) {
        clearTimeout(timer);
        dismissTimers.current.delete(id);
      }
    }
    // Force re-render
    setTips((prev) => [...prev]);
  }, []);

  const handleDismiss = useCallback((id: string) => {
    const timer = dismissTimers.current.get(id);
    if (timer) clearTimeout(timer);
    dismissTimers.current.delete(id);
    delete streamingTargets.current[id];
    setTips((prev) => prev.filter((t) => t.id !== id));
    setDisplayLen((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // ── Render helpers ──

  const getDisplayedContent = (tip: CoachTipItem): string => {
    if (!tip.isStreaming) return tip.content;
    const len = displayLen[tip.id] ?? 0;
    return tip.content.slice(0, len);
  };

  // ── Render ──

  return (
    <div
      className="flex flex-col h-full"
      style={{
        backgroundColor: 'var(--bg-primary)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2.5 border-b select-none flex-shrink-0"
        style={{
          borderColor: 'var(--border-default)',
          cursor: 'pointer',
        }}
        onClick={() => setCollapsed((v) => !v)}
      >
        <div className="flex items-center gap-2">
          {/* Live indicator dot */}
          {isConnected && (
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{
                backgroundColor: 'var(--btn-primary)',
                boxShadow: '0 0 6px var(--btn-primary)',
              }}
            />
          )}
          <span
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-primary)' }}
          >
            实时教练
          </span>
          {isConnected && (
            <span className="text-[10px]" style={{ color: 'var(--btn-primary-hover)' }}>
              LIVE
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!isConnected ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                connect();
              }}
              className="text-[10px] px-2 py-1 rounded font-medium transition-colors"
              style={{
                backgroundColor: 'var(--btn-primary)',
                color: 'var(--color-white)',
              }}
            >
              连接
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                disconnect();
              }}
              className="text-[10px] px-2 py-1 rounded font-medium transition-colors"
              style={{
                backgroundColor: 'var(--border-default)',
                color: 'var(--text-primary)',
              }}
            >
              断开
            </button>
          )}
          <span
            className="text-xs transition-transform duration-200"
            style={{
              color: 'var(--text-secondary)',
              transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            }}
          >
            &#9660;
          </span>
        </div>
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
          {tips.length === 0 ? (
            <div className="flex items-center justify-center py-12 px-4">
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {isConnected
                  ? '等待教练建议...'
                  : '点击"连接"接收实时教练建议'}
              </span>
            </div>
          ) : (
            <div className="flex flex-col">
              {tips.map((tip) => {
                const displayed = getDisplayedContent(tip);
                const isPinned = pinnedRef.current.has(tip.id);
                const borderColor = getBorderColor(tip.trigger);
                const tipLabel = getTriggerLabel(tip.trigger);

                return (
                  <div
                    key={tip.id}
                    className="px-3 py-2.5 border-b relative group"
                    style={{
                      borderColor: 'var(--border-subtle)',
                      borderLeftWidth: 3,
                      borderLeftStyle: 'solid',
                      borderLeftColor: borderColor,
                    }}
                  >
                    {/* Header row */}
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: `${borderColor}22`,
                            color: borderColor,
                          }}
                        >
                          {tipLabel}
                        </span>
                        <span
                          className="text-[10px]"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          {formatTime(tip.timestamp)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Pin button */}
                        <button
                          onClick={() => handleTogglePin(tip.id)}
                          className="text-xs px-1 rounded hover:bg-[var(--border-default)]"
                          style={{
                            color: isPinned ? 'var(--accent-orange)' : 'var(--text-tertiary)',
                          }}
                          title={isPinned ? '取消固定' : '固定'}
                        >
                          {isPinned ? '📌' : '📍'}
                        </button>
                        {/* Dismiss button */}
                        <button
                          onClick={() => handleDismiss(tip.id)}
                          className="text-xs px-1 rounded hover:bg-[var(--border-default)]"
                          style={{ color: 'var(--text-tertiary)' }}
                          title="关闭"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Content */}
                    <div
                      className="text-xs leading-relaxed whitespace-pre-wrap"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {displayed}
                      {tip.isStreaming && (
                        <span
                          className="inline-block w-[1px] h-3 ml-0.5 align-middle"
                          style={{
                            backgroundColor: 'var(--accent-blue)',
                            animation: 'blink-cursor 1s step-end infinite',
                          }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Blinking cursor keyframes */}
      <style>{`
        @keyframes blink-cursor {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
