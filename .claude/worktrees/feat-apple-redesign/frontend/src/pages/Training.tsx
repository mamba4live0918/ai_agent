import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { TrainingSession, TrainingSessionDetail, Persona } from '../types';
import {
  getTrainingSessions, getTrainingSession, createTrainingSession, deleteTrainingSession,
} from '../services/api';
import SessionList from '../components/SessionList';
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

  const sidebarContent = (
    <div className="w-[268px] flex-shrink-0 flex flex-col h-full">
      <SessionList
        sessions={sessions}
        selectedId={selectedId}
        onSelect={handleSelect}
        onDelete={handleDelete}
        onNewPersona={() => { setShowPersonaForm(true); setSidebarOpen(false); }}
      />
    </div>
  );

  return (
    <div className="flex h-full">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar — off-canvas on mobile, static on desktop */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        bg-[var(--bg-primary)] border-r border-[var(--border-subtle)]
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {sidebarContent}
      </aside>

      {/* Main area */}
      <div className="flex-1 min-w-0 bg-[var(--bg-primary)] flex flex-col">
        {/* Mobile header bar */}
        <div className="lg:hidden flex items-center gap-2 px-3 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
          <button onClick={() => setSidebarOpen(true)} className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            <svg className="w-5 h-5" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1 2.75A.75.75 0 0 1 1.75 2h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 2.75Zm0 5A.75.75 0 0 1 1.75 7h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 7.75ZM1.75 12a.75.75 0 0 0 0 1.5h12.5a.75.75 0 0 0 0-1.5H1.75Z"/>
            </svg>
          </button>
          <span className="text-sm font-semibold text-[var(--text-primary)]">仿真培训</span>
          {sessions.length > 0 && <span className="text-[10px] text-[var(--text-placeholder)]">{sessions.length} 个会话</span>}
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
                  {initialCustomerId ? '选择一个训练会话或创建新的训练' : '从左侧选择一个训练会话，或创建新的数字人开始训练'}
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
