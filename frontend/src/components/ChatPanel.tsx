import { useState, useRef, useEffect } from 'react';
import { sendMessage } from '../services/api';
import type { ChatResponse } from '../types';

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
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const res: ChatResponse = await sendMessage(input, conversationId);
      setConversationId(res.conversation_id);
      setMessages(prev => [...prev, { role: 'assistant', content: res.answer, sources: res.sources }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '请求失败，请检查后端服务是否运行。' }]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="card flex flex-col" style={{ height: '480px' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#21262d] bg-[#0d1117] rounded-t-md">
        <span className="w-2 h-2 rounded-full bg-[#3fb950]" />
        <span className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider">知识库问答 · RAG</span>
        <span className="text-[10px] text-[#484f58] font-mono ml-auto">
          {messages.length} 条消息
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-12 h-12 rounded-full bg-[#21262d] border border-[#30363d] flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-[#484f58]" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Z"/>
                <path d="M5.5 5.5a.75.75 0 0 1 1.5 0v.75h.75a.75.75 0 0 1 0 1.5H7v.75a.75.75 0 0 1-1.5 0v-.75h-.75a.75.75 0 0 1 0-1.5h.75v-.75ZM11 7.5a.5.5 0 0 1 1 0 .5.5 0 0 1-1 0Zm-.25 2.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0Z"/>
              </svg>
            </div>
            <p className="text-sm text-[#484f58] mb-1">基于知识库文档的智能问答</p>
            <p className="text-xs text-[#30363d]">输入问题，AI 将从已上传的文档中检索并回答</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[82%] rounded-md px-4 py-2.5 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-[#1f6feb] text-white border border-[#388bfd]/40'
                : 'bg-[#0d1117] text-[#e6edf3] border border-[#21262d]'
            }`}>
              <div className="whitespace-pre-wrap">{msg.content}</div>
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-2.5 pt-2.5 border-t border-[#30363d]/40">
                  <p className="text-[10px] font-semibold text-[#6e7681] uppercase tracking-wider mb-1.5">参考来源</p>
                  <div className="flex flex-wrap gap-1">
                    {msg.sources.map((s, j) => (
                      <span key={j} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-[#161b22] text-[#8b949e] border border-[#21262d] font-mono" title={s.preview}>
                        <svg className="w-3 h-3 text-[#484f58]" viewBox="0 0 16 16" fill="currentColor">
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
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-[#484f58] text-xs font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-[#d29922] animate-pulse" />
            思考中...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-[#21262d] bg-[#0d1117] rounded-b-md">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入问题，Enter 发送..."
            className="flex-1 bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-1.5 text-sm text-[#e6edf3] placeholder-[#484f58] focus:border-[#58a6ff] focus:shadow-[0_0_0_3px_rgba(88,166,255,0.15)] outline-none transition-all"
          />
          <button onClick={handleSend} disabled={loading || !input.trim()} className="btn btn-primary text-sm px-4">
            {loading ? '...' : '发送'}
          </button>
        </div>
      </div>
    </div>
  );
}
