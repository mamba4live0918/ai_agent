import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { PostSalesSession, PostSalesSessionDetail } from '../types';
import {
  getPostSalesSessions, getPostSalesSession, createPostSalesSession, deletePostSalesSession,
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
  const [deleting, setDeleting] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    setSidebarOpen(false);
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

  useEffect(() => {
    const idToRestore = sessionIdParam || sessionStorage.getItem(STORAGE_KEY);
    if (idToRestore) {
      selectSession(idToRestore);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (deleting) return;
    if (!window.confirm('确定要删除这个售后分析吗？相关数据将无法恢复。')) return;
    setDeleting(id);
    try {
      await deletePostSalesSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (selectedId === id) {
        setDetail(null);
        setSelectedId(null);
        sessionStorage.removeItem(STORAGE_KEY);
        setSearchParams({}, { replace: true });
      }
    } catch (err) {
      console.error('Delete session failed:', err);
    } finally {
      setDeleting(null);
    }
  };

  const handleSessionUpdated = () => {
    fetchSessions();
  };

  return (
    <div className="flex h-full relative">
      {/* Sliding container: card + tab move together */}
      <div className={`absolute left-0 top-0 bottom-0 z-20 flex flex-row
        transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-[calc(100%-20px)]'}`}>
        <div className="w-[260px] sm:w-[280px] h-full flex flex-col
          bg-[var(--bg-primary)] border-r border-[var(--border-subtle)]
          shadow-[4px_0_24px_rgba(0,0,0,0.12)] rounded-r-2xl">
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
          <span className="text-sm font-semibold text-[var(--text-primary)]">售后分析</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { handleCreate(); setSidebarOpen(false); }}
              disabled={creating}
              className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-full transition-colors"
              title="新建分析"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                <path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"/>
              </svg>
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--text-placeholder)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                <path fillRule="evenodd" d="M5.646 3.646a.5.5 0 0 1 .708 0l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L9.293 8 5.646 4.354a.5.5 0 0 1 0-.708Z" clipRule="evenodd"/>
              </svg>
            </button>
          </div>
        </div>
        {/* Session list */}
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <p className="px-4 py-6 text-xs text-[var(--text-placeholder)] text-center">暂无分析记录</p>
          ) : (
            sessions.map(s => (
              <div
                key={s.id}
                onClick={() => selectSession(s.id)}
                className={`relative group px-4 py-3 cursor-pointer border-b border-[var(--border-subtle)] hover:bg-[var(--bg-secondary)] transition-colors ${
                  selectedId === s.id ? 'bg-[var(--bg-secondary)] border-l-2 border-l-[var(--accent-blue)]' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-[var(--text-primary)] truncate max-w-[140px]">
                    {s.customer_name || '未关联客户'}
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 ${
                    s.status === 'completed' ? 'bg-[var(--btn-primary)]/20 text-[var(--accent-green)]' :
                    s.status === 'processing' ? 'bg-[var(--accent-orange)]/20 text-[var(--accent-orange)]' :
                    'bg-[var(--btn-blue)]/20 text-[var(--accent-blue)]'
                  }`}>
                    {s.status === 'completed' ? '已完成' : s.status === 'processing' ? '处理中' : '记录中'}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-[var(--text-placeholder)]">
                  <span>{s.message_count} 条消息</span>
                  <span>{new Date(s.started_at).toLocaleDateString('zh-CN')}</span>
                </div>
                <button
                  onClick={(e) => handleDelete(e, s.id)}
                  className="absolute right-2 bottom-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-[var(--text-placeholder)] hover:text-[var(--accent-red)]"
                  title="删除"
                >
                  {deleting === s.id ? (
                    <span className="text-[9px]">...</span>
                  ) : (
                    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                      <path fillRule="evenodd" d="M6.75 2.75A.75.75 0 0 1 7.5 2h1a.75.75 0 0 1 .75.75V3h-2.5v-.25ZM4.25 3a.75.75 0 0 1 .75-.75h6a.75.75 0 0 1 .75.75V4h1.75a.75.75 0 0 1 0 1.5h-.14l-.67 8.024a1.75 1.75 0 0 1-1.745 1.726H5.055a1.751 1.751 0 0 1-1.745-1.726l-.67-8.024H2.5a.75.75 0 0 1 0-1.5h1.75V3Zm1 1.5v.25h5.5V4.5h-5.5Zm4.22 2.72a.75.75 0 0 1 1.06 0l.97.97.97-.97a.75.75 0 1 1 1.06 1.06l-.97.97.97.97a.75.75 0 1 1-1.06 1.06l-.97-.97-.97.97a.75.75 0 1 1-1.06-1.06l.97-.97-.97-.97a.75.75 0 0 1 0-1.06Z" />
                    </svg>
                  )}
                </button>
              </div>
            ))
          )}
        </div>
        {/* Bottom create button */}
        <div className="px-4 py-2 border-t border-[var(--border-subtle)]">
          <button
            onClick={() => { handleCreate(); setSidebarOpen(false); }}
            disabled={creating}
            className="w-full px-3 py-2 bg-[var(--btn-primary)] text-white text-xs rounded-full hover:bg-[var(--btn-primary-hover)] disabled:opacity-50 transition-colors"
          >
            + 新建分析
          </button>
        </div>
      </div>

      {/* Tab handle — attached to right side of card */}
      <div
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="w-[20px] flex-shrink-0 h-full flex items-center cursor-pointer group
          border-l border-[var(--border-subtle)]/20 rounded-l-lg
          hover:border-[var(--accent-blue)]/60 hover:shadow-[0_0_8px_rgba(88,166,255,0.15)]
          transition-all duration-200"
      >
        <div className="-ml-1 w-5 h-8 rounded-full bg-[var(--bg-secondary)]/60 border border-[var(--border-default)]/30
          flex items-center justify-center
          group-hover:border-[var(--accent-blue)] group-hover:bg-[var(--bg-primary)] group-hover:shadow-sm
          transition-all duration-200">
          <svg className="w-3 h-3 text-[var(--text-placeholder)] group-hover:text-[var(--accent-blue)]" viewBox="0 0 16 16" fill="currentColor">
            {sidebarOpen ? (
              <path fillRule="evenodd" d="M5.646 3.646a.5.5 0 0 1 .708 0l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L9.293 8 5.646 4.354a.5.5 0 0 1 0-.708Z" clipRule="evenodd"/>
            ) : (
              <path fillRule="evenodd" d="M10.354 3.646a.5.5 0 0 1 0 .708L6.707 8l3.647 3.646a.5.5 0 0 1-.708.708l-4-4a.5.5 0 0 1 0-.708l4-4a.5.5 0 0 1 .708 0Z" clipRule="evenodd"/>
            )}
          </svg>
        </div>
      </div>
    </div>

    {/* Backdrop overlay when sidebar is open */}
      {sidebarOpen && (
        <div
          className="absolute inset-0 z-[15] bg-black/20 transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main area */}
      <div className="flex-1 min-w-0 bg-[var(--bg-primary)] flex flex-col">
        {/* Header bar */}
        <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-[var(--border-subtle)]">
          <span className="text-sm font-semibold text-[var(--text-primary)]">售后分析</span>
          <span className="text-[10px] text-[var(--text-placeholder)]">{sessions.length} 个记录</span>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="ml-auto px-3 py-1.5 text-xs rounded-full bg-[var(--btn-primary)] text-white hover:bg-[var(--btn-primary-hover)] transition-all duration-200"
          >
            + 新建
          </button>
        </div>

        <div className="flex-1 min-h-0">
          {creating ? (
            <div className="flex items-center justify-center h-full text-[var(--text-secondary)] text-sm">
              <div className="text-center">
                <div className="animate-spin w-6 h-6 border-2 border-[var(--accent-blue)] border-t-transparent rounded-full mx-auto mb-3" />
                <p>正在创建...</p>
              </div>
            </div>
          ) : detailLoading ? (
            <div className="flex items-center justify-center h-full text-[var(--text-placeholder)] text-sm">加载中...</div>
          ) : detail ? (
            <PostSalesSessionComponent
              key={detail.id}
              session={detail}
              onSessionUpdated={handleSessionUpdated}
            />
          ) : (
            <div className="flex items-center justify-center h-full px-4">
              <div className="text-center">
                <div className="text-4xl mb-4">📊</div>
                <p className="text-sm text-[var(--text-primary)] font-medium mb-1">售后分析 — 通话复盘</p>
                <p className="text-xs text-[var(--text-placeholder)] mb-4">
                  记录销售通话内容，上传录音，AI 自动分析生成可视化报告
                </p>
                <button
                  onClick={handleCreate}
                  className="px-4 py-2 bg-[var(--btn-primary)] text-white text-xs rounded-full hover:bg-[var(--btn-primary-hover)] transition-colors"
                >
                  + 新建分析
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
