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

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

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
      setMessages(prev => [...prev, { role: 'assistant', content: '抱歉，请求失败，请检查后端是否运行。' }]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl flex flex-col h-[500px]">
      <div className="px-4 py-3 border-b border-gray-800">
        <h3 className="text-sm font-semibold text-gray-300">知识库问答</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-gray-500 text-sm text-center mt-20">
            在下方输入问题，基于知识库文档获取答案
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-200'
            }`}>
              <div className="whitespace-pre-wrap">{msg.content}</div>
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-700 text-xs text-gray-500">
                  参考来源: {msg.sources.map((s, j) => (
                    <span key={j} className="mr-2" title={s.preview}>📄 {s.filename}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && <div className="text-gray-500 text-sm">思考中...</div>}
        <div ref={bottomRef} />
      </div>
      <div className="p-3 border-t border-gray-800 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入问题..."
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200
                     placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <button onClick={handleSend} disabled={loading || !input.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium
                     hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          发送
        </button>
      </div>
    </div>
  );
}
