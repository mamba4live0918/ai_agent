import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { TrainingSession, TrainingSessionDetail, Persona } from '../types';
import {
  getTrainingSessions, getTrainingSession, createTrainingSession, deleteTrainingSession,
} from '../services/api';
import SessionList from '../components/SessionList';
import PersonaForm from '../components/PersonaForm';
import TrainingSessionComponent from '../components/TrainingSession';
import { useRealtimeASR } from '../hooks/useRealtimeASR';
import RealtimeTranscript from '../components/RealtimeTranscript';

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
  const [showRealtime, setShowRealtime] = useState(false);

  const autoCreatedRef = useRef(false);
  const restoredRef = useRef(false);

  // Real-time ASR hook (always called, only rendered when showRealtime is true)
  const realtimeASR = useRealtimeASR();

  // Always fetch all sessions — don't filter by customerId so manual personas appear
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

    // Persist to URL (survives browser back/forward) and sessionStorage (survives sidebar nav)
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

  // Restore session on mount — URL param first, then sessionStorage
  useEffect(() => {
    if (restoredRef.current) return;
    const idToRestore = sessionIdParam || sessionStorage.getItem(STORAGE_KEY);
    if (idToRestore) {
      restoredRef.current = true;
      selectSession(idToRestore);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-create session from customer when customerId is in URL
  useEffect(() => {
    if (!initialCustomerId || autoCreatedRef.current || sessionIdParam) return;
    autoCreatedRef.current = true;

    (async () => {
      // Always create a new session when coming from customer profile
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
    <div className="flex h-full">
      {/* Left: Session list */}
      <div className="w-[268px] flex-shrink-0 border-r-2 border-[#30363d] flex flex-col bg-[#0d1117]">
        <SessionList
          sessions={sessions}
          selectedId={selectedId}
          onSelect={handleSelect}
          onDelete={handleDelete}
          onNewPersona={() => setShowPersonaForm(true)}
        />
      </div>

      {/* Right: Chat area or empty state */}
      <div className="flex-1 min-w-0 bg-[#0d1117]">
        {creating ? (
          <div className="flex items-center justify-center h-full text-[#8b949e] text-sm">
            <div className="text-center">
              <div className="animate-spin w-6 h-6 border-2 border-[#58a6ff] border-t-transparent rounded-full mx-auto mb-3" />
              <p>正在创建训练场景...</p>
            </div>
          </div>
        ) : detailLoading ? (
          <div className="flex items-center justify-center h-full text-[#484f58] text-sm">加载中...</div>
        ) : detail ? (
          <TrainingSessionComponent
            key={detail.id}
            session={detail}
            onSessionUpdated={handleSessionUpdated}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-4xl mb-4">🎯</div>
              <p className="text-sm text-[#e6edf3] font-medium mb-1">仿真培训 — AI 数字人对练</p>
              <p className="text-xs text-[#484f58] mb-4">
                {initialCustomerId ? '选择一个训练会话或创建新的训练' : '从左侧选择一个训练会话，或创建新的数字人开始训练'}
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => setShowPersonaForm(true)}
                  className="px-4 py-2 bg-[#238636] text-white text-xs rounded-md hover:bg-[#2ea043] transition-colors"
                >
                  + 新建训练
                </button>
                <button
                  onClick={() => setShowRealtime((v) => !v)}
                  className={`px-4 py-2 text-xs rounded-md transition-colors border ${
                    showRealtime
                      ? 'bg-[#1c2128] border-[#58a6ff] text-[#58a6ff]'
                      : 'bg-[#21262d] border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] hover:border-[#58a6ff]/50'
                  }`}
                >
                  实验：实时语音
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <PersonaForm
        visible={showPersonaForm}
        onClose={() => setShowPersonaForm(false)}
        onSubmit={handleCreateFromPersona}
        loading={creating}
      />

      {/* Real-time ASR Transcript Panel */}
      {showRealtime && (
        <RealtimeTranscript
          segments={realtimeASR.transcript}
          partialText={realtimeASR.partialText}
          isRecording={realtimeASR.isRecording}
          connectionState={realtimeASR.connectionState}
          error={realtimeASR.error}
          onStart={realtimeASR.start}
          onStop={realtimeASR.stop}
        />
      )}
    </div>
  );
}
