import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { TrainingSession, TrainingSessionDetail, Persona } from '../types';
import {
  getTrainingSessions, getTrainingSession, createTrainingSession, deleteTrainingSession,
} from '../services/api';
import PersonaForm from '../components/PersonaForm';
import TrainingSessionComponent from '../components/TrainingSession';

const STORAGE_KEY = 'trainingActiveSessionId';

export default function Training() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCustomerId = searchParams.get('customerId');
  const sessionIdParam = searchParams.get('sessionId');

  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TrainingSessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showPersonaForm, setShowPersonaForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const autoCreatedRef = useRef(false);
  const restoredRef = useRef(false);

  const fetchSessions = useCallback(async () => {
    try {
      const result = await getTrainingSessions(undefined, undefined, 1, 50);
      setSessions(result.items);
    } catch (e) { console.error('Fetch sessions failed:', e); }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const selectSession = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    setSidebarOpen(false);

    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      newParams.set('sessionId', id);
      return newParams;
    }, { replace: true });
    sessionStorage.setItem(STORAGE_KEY, id);

    try {
      const d = await getTrainingSession(id);
      setDetail(d);
    } catch (e) {
      console.error('Get session detail failed:', e);
      sessionStorage.removeItem(STORAGE_KEY);
      setSelectedId(null);
    } finally {
      setDetailLoading(false);
    }
  }, [setSearchParams]);

  const handleSelect = useCallback(async (s: TrainingSession) => {
    await selectSession(s.id);
  }, [selectSession]);

  useEffect(() => {
    if (restoredRef.current) return;
    const idToRestore = sessionIdParam || sessionStorage.getItem(STORAGE_KEY);
    if (idToRestore) {
      restoredRef.current = true;
      selectSession(idToRestore);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!initialCustomerId || autoCreatedRef.current || sessionIdParam) return;
    autoCreatedRef.current = true;

    (async () => {
      try {
        setCreating(true);
        const s = await createTrainingSession({
          customer_id: initialCustomerId,
          scenario: '产品讲解',
        });
        await fetchSessions();
        await selectSession(s.id);
      } catch (e) {
        console.error('Auto-create session failed:', e);
        autoCreatedRef.current = false;
      } finally {
        setCreating(false);
      }
    })();
  }, [initialCustomerId, sessionIdParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateFromPersona = async (persona: Persona, scenario: string) => {
    setCreating(true);
    try {
      const s = await createTrainingSession({ persona, scenario });
      setShowPersonaForm(false);
      await fetchSessions();
      await selectSession(s.id);
    } catch (e) {
      console.error('Create session from persona failed:', e);
    } finally { setCreating(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个训练会话吗？相关消息和复盘记录将被永久删除。')) return;
    try {
      await deleteTrainingSession(id);
      if (selectedId === id) {
        setSelectedId(null);
        setDetail(null);
        sessionStorage.removeItem(STORAGE_KEY);
        setSearchParams(prev => {
          const newParams = new URLSearchParams(prev);
          newParams.delete('sessionId');
          return newParams;
        }, { replace: true });
      }
      await fetchSessions();
    } catch (e) { console.error('Delete session failed:', e); }
  };

  const handleSessionUpdated = () => {
    fetchSessions();
  };

  return (
    <div className="flex h-full relative overflow-hidden">
      {/* Sliding sidebar */}
      <div className={`absolute left-0 top-0 bottom-0 z-20 flex flex-row
        transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-[calc(100%-4px)]'}`}>
        <div className="w-[220px] sm:w-[240px] h-full flex flex-col sidebar-glass relative">
        {/* Toggle button on right edge */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-12 rounded-r-lg sidebar-toggle
            flex items-center justify-center
            hover:bg-[var(--bg-overlay)] hover:shadow-[0_0_8px_rgba(88,166,255,0.15)]
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
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]/40 backdrop-blur-md">
          <span className="text-sm font-semibold text-[var(--text-primary)]">训练记录</span>
        </div>
        {/* Session list content */}
        <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
          {sessions.map(s => (
            <div
              key={s.id}
              onClick={() => { handleSelect(s); setSidebarOpen(false); }}
              className={`group relative rounded-xl border p-2.5 cursor-pointer transition-all duration-200 backdrop-blur-md hover:shadow-lg hover:shadow-black/10 ${
                selectedId === s.id
                  ? 'border-[var(--accent-blue)] bg-[var(--bg-overlay)]/80'
                  : s.status === 'pending' || s.status === 'active'
                    ? 'border-[var(--accent-orange)]/60 bg-[var(--bg-overlay)]/70 hover:bg-[var(--bg-overlay)]/85'
                    : 'border-transparent bg-[var(--bg-primary)]/40 hover:bg-[var(--bg-secondary)]/60'
              }`}
            >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: s.status === 'completed' ? 'var(--accent-green)' : 'var(--accent-orange)' }}
                    />
                    <span className="text-xs text-[var(--text-primary)] font-medium truncate">
                      {s.persona?.name || '未知'} · {s.scenario}
                    </span>
                  </div>
                  <div className="text-[10px] mt-1.5 ml-[14px]" style={{ color: s.status === 'completed' ? 'var(--accent-green)' : 'var(--accent-orange)' }}>
                    {s.status === 'completed'
                      ? `✓ 已完成${s.has_review ? ' · 📊 复盘' : ''}`
                      : s.status === 'active'
                        ? '⏳ 进行中 — 点击继续'
                        : '⏳ 未开始 — 点击开始'}
                  </div>
                  <div className="text-[9px] text-[var(--text-placeholder)] mt-1 ml-[14px]">{formatTime(s.started_at)}</div>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(s.id); }}
                    className="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 text-[var(--text-placeholder)] hover:text-[var(--accent-red)] text-xs transition-opacity"
                    title="删除"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {sessions.length === 0 && (
                <div className="text-center py-6">
                  <p className="text-[11px] text-[var(--text-placeholder)]">暂无训练记录</p>
                </div>
              )}
            </div>
            <div className="px-4 py-2 border-t border-[var(--border-subtle)]">
              <button
                onClick={() => { setShowPersonaForm(true); setSidebarOpen(false); }}
                className="w-full px-3 py-2 bg-[var(--btn-primary)] text-white text-xs rounded-full hover:bg-[var(--btn-primary-hover)] transition-colors"
              >
                + 手动创建数字人
              </button>
            </div>
        </div>
      </div>

      {/* Backdrop overlay when sidebar is open */}
      {sidebarOpen && (
        <div
          className="absolute inset-0 z-[15] bg-black/40 backdrop-blur-[2px] transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main area */}
      <div className="flex-1 min-w-0 bg-[var(--bg-primary)] flex flex-col">
        {/* Header bar */}
        <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-[var(--border-subtle)]">
          <span className="text-sm font-semibold text-[var(--text-primary)]">仿真培训</span>
          {sessions.length > 0 && <span className="text-[10px] text-[var(--text-placeholder)]">{sessions.length} 个会话</span>}
          <button
            onClick={() => setShowPersonaForm(true)}
            className="ml-auto px-3 py-1.5 text-xs rounded-full bg-[var(--btn-primary)] text-white hover:bg-[var(--btn-primary-hover)] transition-all duration-200"
          >
            + 新建训练
          </button>
        </div>

        <div className="flex-1 min-h-0">
          {creating ? (
            <div className="flex items-center justify-center h-full text-[var(--text-secondary)] text-sm">
              <div className="text-center">
                <div className="animate-spin w-6 h-6 border-2 border-[var(--accent-blue)] border-t-transparent rounded-full mx-auto mb-3" />
                <p>正在创建训练场景...</p>
              </div>
            </div>
          ) : detailLoading ? (
            <div className="flex items-center justify-center h-full text-[var(--text-placeholder)] text-sm">加载中...</div>
          ) : detail ? (
            <TrainingSessionComponent
              key={detail.id}
              session={detail}
              onSessionUpdated={handleSessionUpdated}
            />
          ) : (
            <div className="flex items-center justify-center h-full px-4">
              <div className="text-center">
                <div className="text-4xl mb-4">🎯</div>
                <p className="text-sm text-[var(--text-primary)] font-medium mb-1">仿真培训 — AI 数字人对练</p>
                <p className="text-xs text-[var(--text-placeholder)] mb-4">
                  {initialCustomerId ? '选择一个训练会话或创建新的训练' : '点击左侧箭头展开训练记录，或创建新的数字人开始训练'}
                </p>
                <button
                  onClick={() => setShowPersonaForm(true)}
                  className="px-5 py-2.5 bg-[var(--btn-primary)] text-white text-xs rounded-full hover:bg-[var(--btn-primary-hover)] transition-all duration-200 shadow-md"
                >
                  + 新建训练
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <PersonaForm
        visible={showPersonaForm}
        onClose={() => setShowPersonaForm(false)}
        onSubmit={handleCreateFromPersona}
        loading={creating}
      />
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return '刚刚';
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return d.toLocaleDateString('zh-CN');
}
