import { useState, useEffect, useCallback } from 'react';
import { getSalesConversations, getSalesConversation, processConversation, deleteSalesConversation } from '../services/api';
import VoiceRecorder from '../components/VoiceRecorder';
import ConversationViewer from '../components/ConversationViewer';
import type { SalesConversation, SalesConversationDetail } from '../types';

export default function SalesAssistance() {
  const [conversations, setConversations] = useState<SalesConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SalesConversationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);

  const loadList = useCallback(async () => {
    try {
      const res = await getSalesConversations(undefined, undefined, 1, 50);
      setConversations(res.items);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  const loadDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setShowRecorder(false);
    try {
      const d = await getSalesConversation(id);
      setDetail(d);
    } catch { setDetail(null); }
  }, []);

  const handleProcess = useCallback(async (id: string) => {
    try {
      const d = await processConversation(id);
      setDetail(d);
      loadList();
    } catch { /* ignore */ }
  }, [loadList]);

  const handleDelete = useCallback(async (id: string) => {
    if (!window.confirm('确定删除此录音和分析？')) return;
    try {
      await deleteSalesConversation(id);
      if (selectedId === id) { setSelectedId(null); setDetail(null); }
      loadList();
    } catch { /* ignore */ }
  }, [selectedId, loadList]);

  const handleUploadComplete = useCallback((conv: SalesConversation) => {
    setShowRecorder(false);
    loadList();
    handleProcess(conv.id);
    setSelectedId(conv.id);
  }, [loadList, handleProcess]);

  return (
    <div className="flex h-full">
      {/* Conversation List — 268px sidebar */}
      <div className="w-[268px] flex-shrink-0 border-r border-[#21262d] bg-[#0d1117] flex flex-col">
        <div className="px-4 py-3 border-b border-[#21262d] flex items-center justify-between">
          <span className="text-sm font-semibold text-[#e6edf3]">销售录音</span>
          <button onClick={() => { setShowRecorder(true); setSelectedId(null); setDetail(null); }}
            className="p-1.5 rounded-md bg-[#238636] hover:bg-[#2ea043] text-white transition-colors"
            title="新建录音">
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5Z"/><path d="M10 8a2 2 0 1 1-4 0V3a2 2 0 1 1 4 0v5Z"/></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="p-4 text-center text-xs text-[#484f58]">加载中...</div>}
          {!loading && conversations.length === 0 && (
            <div className="p-4 text-center text-xs text-[#484f58]">暂无录音</div>
          )}
          {conversations.map((c) => (
            <button key={c.id} onClick={() => loadDetail(c.id)}
              className={`w-full text-left px-4 py-3 border-b border-[#21262d] transition-colors ${
                selectedId === c.id ? 'bg-[#1f2937]' : 'hover:bg-[#161b22]'
              }`}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs text-[#e6edf3] font-medium truncate max-w-[160px]">
                  {c.customer_name || '未关联客户'}
                </span>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  c.status === 'completed' ? 'bg-[#3fb950]' : c.status === 'processing' ? 'bg-[#d29922]' : c.status === 'failed' ? 'bg-[#f85149]' : 'bg-[#484f58]'
                }`} />
              </div>
              <div className="flex items-center justify-between text-[10px] text-[#484f58]">
                <span>{new Date(c.started_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                <span>{c.message_count} 条消息</span>
              </div>
              <div className="flex items-center justify-end mt-1 gap-1">
                {c.status === 'uploaded' && (
                  <button onClick={(e) => { e.stopPropagation(); handleProcess(c.id); }}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-[#1f6feb]/15 text-[#58a6ff] hover:bg-[#1f6feb]/30">处理</button>
                )}
                {c.status === 'failed' && (
                  <button onClick={(e) => { e.stopPropagation(); handleProcess(c.id); }}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-[#d29922]/15 text-[#d29922] hover:bg-[#d29922]/30">重试</button>
                )}
                <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}
                  className="text-[10px] px-1.5 py-0.5 rounded text-[#484f58] hover:text-[#f85149] hover:bg-[#f85149]/10">删除</button>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {showRecorder && (
          <div className="flex-1 flex flex-col">
            <div className="px-4 py-3 border-b border-[#21262d] flex items-center justify-between">
              <span className="text-sm font-medium text-[#e6edf3]">新建录音</span>
              <button onClick={() => setShowRecorder(false)} className="p-1 text-[#8b949e] hover:text-[#e6edf3]">
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/></svg>
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <VoiceRecorder onUploadComplete={handleUploadComplete} />
            </div>
          </div>
        )}

        {!showRecorder && detail && (
          <ConversationViewer detail={detail} />
        )}

        {!showRecorder && !detail && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <svg className="w-16 h-16 text-[#21262d]" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5Z"/>
              <path d="M10 8a2 2 0 1 1-4 0V3a2 2 0 1 1 4 0v5Z"/>
            </svg>
            <p className="text-sm text-[#8b949e]">选择左侧录音查看详情，或新建录音</p>
            <button onClick={() => setShowRecorder(true)}
              className="px-4 py-2 rounded-md bg-[#238636] hover:bg-[#2ea043] text-white text-sm font-medium transition-colors">
              开始录音
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
