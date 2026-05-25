import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { PostSalesSession, PostSalesSessionDetail } from '../types';
import {
  getPostSalesSessions, getPostSalesSession, createPostSalesSession,
} from '../services/api';
import PostSalesSessionComponent from '../components/PostSalesSession';

const STORAGE_KEY = 'postSalesActiveSessionId';

export default function PostSalesAnalysis() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCustomerId = searchParams.get('customerId');
  const sessionIdParam = searchParams.get('sessionId');

  const [sessions, setSessions] = useState<PostSalesSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PostSalesSessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const fetchSessions = useCallback(async () => {
    try {
      const result = await getPostSalesSessions(undefined, undefined, 1, 50);
      setSessions(result.items);
    } catch (e) { console.error('Fetch sessions failed:', e); }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const selectSession = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      newParams.set('sessionId', id);
      return newParams;
    }, { replace: true });
    sessionStorage.setItem(STORAGE_KEY, id);
    try {
      const d = await getPostSalesSession(id);
      setDetail(d);
    } catch (e) {
      console.error('Get session detail failed:', e);
      sessionStorage.removeItem(STORAGE_KEY);
      setSelectedId(null);
    } finally {
      setDetailLoading(false);
    }
  }, [setSearchParams]);

  // Restore session on mount
  useEffect(() => {
    const idToRestore = sessionIdParam || sessionStorage.getItem(STORAGE_KEY);
    if (idToRestore) {
      selectSession(idToRestore);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-create session from customer
  useEffect(() => {
    if (!initialCustomerId || sessionIdParam) return;
    (async () => {
      try {
        setCreating(true);
        const s = await createPostSalesSession(initialCustomerId);
        await fetchSessions();
        await selectSession(s.id);
      } catch (e) {
        console.error('Auto-create session failed:', e);
      } finally {
        setCreating(false);
      }
    })();
  }, [initialCustomerId, sessionIdParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    setCreating(true);
    try {
      const s = await createPostSalesSession();
      await fetchSessions();
      await selectSession(s.id);
    } catch (e) {
      console.error('Create session failed:', e);
    } finally { setCreating(false); }
  };

  const handleSessionUpdated = () => {
    fetchSessions();
  };

  return (
    <div className="flex h-full">
      {/* Left: Session list */}
      <div className="w-[268px] flex-shrink-0 border-r-2 border-[#30363d] flex flex-col bg-[#0d1117]">
        <div className="px-4 py-3 border-b border-[#21262d] flex items-center justify-between">
          <span className="text-sm font-semibold text-[#e6edf3]">售后分析</span>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="p-1.5 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] rounded-md transition-colors"
            title="新建分析"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
              <path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"/>
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <p className="px-4 py-6 text-xs text-[#484f58] text-center">暂无分析记录</p>
          ) : (
            sessions.map(s => (
              <div
                key={s.id}
                onClick={() => selectSession(s.id)}
                className={`px-4 py-3 cursor-pointer border-b border-[#21262d] hover:bg-[#161b22] transition-colors ${
                  selectedId === s.id ? 'bg-[#161b22] border-l-2 border-l-[#58a6ff]' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-[#e6edf3] truncate max-w-[160px]">
                    {s.customer_name || '未关联客户'}
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                    s.status === 'completed' ? 'bg-[#238636]/20 text-[#3fb950]' :
                    s.status === 'processing' ? 'bg-[#d29922]/20 text-[#d29922]' :
                    'bg-[#1f6feb]/20 text-[#58a6ff]'
                  }`}>
                    {s.status === 'completed' ? '已完成' : s.status === 'processing' ? '处理中' : '记录中'}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-[#484f58]">
                  <span>{s.message_count} 条消息</span>
                  <span>{new Date(s.started_at).toLocaleDateString('zh-CN')}</span>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="px-4 py-2 border-t border-[#21262d]">
          <button
            onClick={handleCreate}
            disabled={creating}
            className="w-full px-3 py-2 bg-[#238636] text-white text-xs rounded-md hover:bg-[#2ea043] disabled:opacity-50 transition-colors"
          >
            + 新建分析
          </button>
        </div>
      </div>

      {/* Right: Main area */}
      <div className="flex-1 min-w-0 bg-[#0d1117]">
        {creating ? (
          <div className="flex items-center justify-center h-full text-[#8b949e] text-sm">
            <div className="text-center">
              <div className="animate-spin w-6 h-6 border-2 border-[#58a6ff] border-t-transparent rounded-full mx-auto mb-3" />
              <p>正在创建...</p>
            </div>
          </div>
        ) : detailLoading ? (
          <div className="flex items-center justify-center h-full text-[#484f58] text-sm">加载中...</div>
        ) : detail ? (
          <PostSalesSessionComponent
            key={detail.id}
            session={detail}
            onSessionUpdated={handleSessionUpdated}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-4xl mb-4">📊</div>
              <p className="text-sm text-[#e6edf3] font-medium mb-1">售后分析 — 通话复盘</p>
              <p className="text-xs text-[#484f58] mb-4">
                记录销售通话内容，上传录音，AI 自动分析生成可视化报告
              </p>
              <button
                onClick={handleCreate}
                className="px-4 py-2 bg-[#238636] text-white text-xs rounded-md hover:bg-[#2ea043] transition-colors"
              >
                + 新建分析
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
