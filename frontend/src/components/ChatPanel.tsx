import { useState, useRef, useEffect, useCallback } from 'react';
import { sendMessage, getConversations, getConversation, deleteConversation } from '../services/api';
import type { ChatResponse, ConversationItem, MessageItem } from '../types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: { filename: string; page: string; preview: string }[];
}

export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [convLoading, setConvLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const loadConversations = useCallback(async () => {
    try {
      const list = await getConversations();
      setConversations(list);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const res: ChatResponse = await sendMessage(input, conversationId);
      if (!conversationId) setConversationId(res.conversation_id);
      setMessages(prev => [...prev, { role: 'assistant', content: res.answer, sources: res.sources }]);
      loadConversations();
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '请求失败，请检查后端服务是否运行。' }]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleSelectConversation = async (id: string) => {
    setConvLoading(true);
    try {
      const msgs: MessageItem[] = await getConversation(id);
      setConversationId(id);
      setMessages(msgs.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        sources: m.sources || undefined,
      })));
      setSidebarOpen(false);
    } catch { /* ignore */ }
    setConvLoading(false);
  };

  const handleNewChat = () => {
    setConversationId(undefined);
    setMessages([]);
    setSidebarOpen(false);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteConversation(id);
      if (conversationId === id) {
        setConversationId(undefined);
        setMessages([]);
      }
      loadConversations();
    } catch { /* ignore */ }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex flex-row h-[60vh] sm:h-[65vh] overflow-hidden relative">
      {/* Sliding container: card + tab move together */}
      <div className={`absolute left-0 top-0 bottom-0 z-20 flex flex-row
        transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-[calc(100%-20px)]'}`}>

        {/* Sidebar card */}
        <div className="w-[260px] sm:w-[280px] h-full flex flex-col
          bg-[var(--bg-primary)] border-r border-[var(--border-subtle)]
          shadow-[4px_0_24px_rgba(0,0,0,0.12)] rounded-r-2xl">
          {/* Sidebar header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
            <span className="text-xs font-semibold text-[var(--text-secondary)] tracking-wide">历史对话</span>
            <div className="flex items-center gap-1">
              <button onClick={handleNewChat} className="text-[10px] text-[var(--accent-blue)] hover:opacity-80 transition-opacity font-medium px-2 py-0.5">
                + 新对话
              </button>
            </div>
          </div>
          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <p className="text-xs text-[var(--text-placeholder)] text-center py-8 px-3">暂无历史对话</p>
            ) : (
              conversations.map(c => (
                <button
                  key={c.id}
                  onClick={() => handleSelectConversation(c.id)}
                  className={`w-full text-left px-4 py-3 border-b border-[var(--border-subtle)]/50 hover:bg-[var(--bg-overlay)] transition-colors group ${
                    conversationId === c.id ? 'bg-[var(--bg-overlay)]' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-xs text-[var(--text-primary)] truncate flex-1 leading-relaxed">{c.title}</span>
                    <button
                      onClick={(e) => handleDelete(e, c.id)}
                      className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-[var(--text-placeholder)] hover:text-[var(--accent-red)] transition-all p-0.5"
                      title="删除"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>
                      </svg>
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-[var(--text-placeholder)]">{c.message_count} 条消息</span>
                    <span className="text-[10px] text-[var(--text-placeholder)]">{formatDate(c.updated_at)}</span>
                  </div>
                </button>
              ))
            )}
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

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)] rounded-t-xl flex-shrink-0">
          <span className="w-2 h-2 rounded-full bg-[var(--accent-green)]" />
          <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">知识库问答 · RAG</span>
          <span className="text-[10px] text-[var(--text-placeholder)] font-mono ml-auto">
            {messages.length} 条消息
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {convLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="w-5 h-5 border-2 border-[var(--accent-blue)] border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-[var(--text-secondary)]">加载对话...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="w-12 h-12 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-default)] flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-[var(--text-placeholder)]" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Z"/>
                  <path d="M5.5 5.5a.75.75 0 0 1 1.5 0v.75h.75a.75.75 0 0 1 0 1.5H7v.75a.75.75 0 0 1-1.5 0v-.75h-.75a.75.75 0 0 1 0-1.5h.75v-.75ZM11 7.5a.5.5 0 0 1 1 0 .5.5 0 0 1-1 0Zm-.25 2.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0Z"/>
                </svg>
              </div>
              <p className="text-sm text-[var(--text-placeholder)] mb-1">基于知识库文档的智能问答</p>
              <p className="text-xs text-[var(--border-default)]">输入问题，AI 将从已上传的文档中检索并回答</p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-[var(--btn-blue)] text-white'
                    : 'bg-[var(--bg-primary)] text-[var(--text-primary)]'
                }`}>
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2.5 pt-2.5 border-t border-[var(--border-default)]/40">
                      <p className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5">参考来源</p>
                      <div className="flex flex-wrap gap-1">
                        {msg.sources.map((s, j) => (
                          <span key={j} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-mono" title={s.preview}>
                            <svg className="w-3 h-3 text-[var(--text-placeholder)]" viewBox="0 0 16 16" fill="currentColor">
                              <path d="M3 1.75A1.75 1.75 0 0 1 4.75 0h6.086a1.75 1.75 0 0 1 1.238.513l3.414 3.414a1.75 1.75 0 0 1 .512 1.238V14.25A1.75 1.75 0 0 1 14.25 16H4.75A1.75 1.75 0 0 1 3 14.25Z"/>
                            </svg>
                            {s.filename}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="flex items-center gap-2 text-[var(--text-placeholder)] text-xs font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-orange)] animate-pulse" />
              思考中...
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t border-[var(--border-subtle)] bg-[var(--bg-primary)] rounded-b-xl">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入问题，Enter 发送..."
              className="flex-1 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-4 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-placeholder)] focus:border-[var(--accent-blue)] focus:shadow-[0_0_0_3px_rgba(88,166,255,0.15)] outline-none transition-all duration-200"
            />
            <button onClick={handleSend} disabled={loading || !input.trim()} className="btn btn-primary text-sm px-4">
              {loading ? '...' : '发送'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
