import { useState, useEffect, useCallback } from 'react';
import { getRealtimeSessions, getRealtimeSession, deleteRealtimeSession } from '../services/api';
import type { RealtimeSessionSummary, RealtimeSessionDetail } from '../types';

interface SessionSidebarProps {
  refreshTrigger: number;
  onSelectSession: (detail: RealtimeSessionDetail) => void;
  selectedSessionId: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(started: string | null, ended: string | null): string {
  if (!started || !ended) return '—';
  const ms = new Date(ended).getTime() - new Date(started).getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec}s`;
}

const STATUS_LABELS: Record<string, string> = {
  active: '进行中',
  completed: '已完成',
  abandoned: '已中断',
};

export default function SessionSidebar({
  refreshTrigger,
  onSelectSession,
  selectedSessionId,
}: SessionSidebarProps) {
  const [sessions, setSessions] = useState<RealtimeSessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getRealtimeSessions(1, 50);
      setSessions(data.items);
    } catch {
      // silent — no sessions or network error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions, refreshTrigger]);

  const handleSelect = async (id: string) => {
    try {
      const detail = await getRealtimeSession(id);
      onSelectSession(detail);
    } catch {
      // silent
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (deleting) return;
    setDeleting(id);
    try {
      await deleteRealtimeSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (selectedSessionId === id) {
        onSelectSession({ session: null as unknown as RealtimeSessionDetail['session'], segments: [] });
      }
    } catch {
      // silent
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-secondary)]/40 backdrop-blur-md">
        <span className="text-sm font-semibold text-[var(--text-primary)]">录音历史</span>
        <button
          onClick={loadSessions}
          disabled={loading}
          className="text-[var(--text-placeholder)] hover:text-[var(--text-secondary)] disabled:opacity-50 transition-colors"
          title="刷新列表"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.001 7.001 0 0 1 14.95 7.16a.75.75 0 1 1-1.49.178A5.501 5.501 0 0 0 8 2.5ZM1.705 8.005a.75.75 0 0 1 .834.656 5.501 5.501 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.001 7.001 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834Z" />
          </svg>
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
        {loading && sessions.length === 0 && (
          <div className="px-3 py-4 text-center text-[11px] text-[var(--text-placeholder)]">加载中...</div>
        )}

        {!loading && sessions.length === 0 && (
          <div className="px-3 py-6 text-center text-[11px] text-[var(--text-placeholder)]">
            <svg className="w-8 h-8 mx-auto mb-2 opacity-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            <p>暂无录音记录</p>
            <p className="text-[10px] mt-0.5">完成录音后将自动保存</p>
          </div>
        )}

        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => handleSelect(s.id)}
            className={`relative w-full text-left rounded-xl border p-2.5 cursor-pointer transition-all duration-200 group backdrop-blur-md hover:shadow-lg hover:shadow-black/10 ${
              selectedSessionId === s.id
                ? 'border-[var(--accent-blue)] bg-[var(--bg-overlay)]/80'
                : 'border-transparent bg-[var(--bg-primary)]/40 hover:bg-[var(--bg-secondary)]/60'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[var(--text-secondary)]">{formatDate(s.started_at)}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                {STATUS_LABELS[s.status] || s.status}
              </span>
            </div>

            {s.preview && (
              <p className="text-xs text-[var(--text-primary)] mt-1 truncate">{s.preview}</p>
            )}

            <div className="flex items-center gap-3 mt-1.5 text-[10px] text-[var(--text-placeholder)]">
              <span>{s.segment_count} 段</span>
              {s.speaker_count > 0 && <span>{s.speaker_count} 人</span>}
              <span>{formatDuration(s.started_at, s.ended_at)}</span>
            </div>

            {/* Delete */}
            <div className="absolute right-2 bottom-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <span
                onClick={(e) => handleDelete(e, s.id)}
                className="text-[var(--text-placeholder)] hover:text-[var(--accent-red)] text-xs cursor-pointer px-1"
                title="删除"
              >
                {deleting === s.id ? '...' : (
                  <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                    <path fillRule="evenodd" d="M6.75 2.75A.75.75 0 0 1 7.5 2h1a.75.75 0 0 1 .75.75V3h-2.5v-.25ZM4.25 3a.75.75 0 0 1 .75-.75h6a.75.75 0 0 1 .75.75V4h1.75a.75.75 0 0 1 0 1.5h-.14l-.67 8.024a1.75 1.75 0 0 1-1.745 1.726H5.055a1.751 1.751 0 0 1-1.745-1.726l-.67-8.024H2.5a.75.75 0 0 1 0-1.5h1.75V3Zm1 1.5v.25h5.5V4.5h-5.5Zm4.22 2.72a.75.75 0 0 1 1.06 0l.97.97.97-.97a.75.75 0 1 1 1.06 1.06l-.97.97.97.97a.75.75 0 1 1-1.06 1.06l-.97-.97-.97.97a.75.75 0 1 1-1.06-1.06l.97-.97-.97-.97a.75.75 0 0 1 0-1.06Z" />
                  </svg>
                )}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
