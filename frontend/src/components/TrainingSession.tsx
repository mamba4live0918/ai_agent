import { useState, useEffect, useRef, useCallback } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import type { TrainingSessionDetail, CoachTip, SendMessageResult, TrainingReview as TrainingReviewType } from '../types';
import { sendTrainingMessage, getQuickReplies, endTrainingSession, getTrainingSession } from '../services/api';
import TrainingReviewComponent from './TrainingReview';

const TIP_CONFIG: { key: keyof CoachTip; label: string; icon: string; color: string; borderColor: string }[] = [
  { key: 'strategy', label: '策略建议', icon: '💡', color: '#58a6ff', borderColor: '#58a6ff' },
  { key: 'phrasing', label: '话术矫正', icon: '🔧', color: '#3fb950', borderColor: '#3fb950' },
  { key: 'golden_quote', label: '销售金句', icon: '⭐', color: '#d29922', borderColor: '#d29922' },
  { key: 'emotion', label: '情绪感知', icon: '🎯', color: '#f0883e', borderColor: '#f0883e' },
];

interface Props {
  session: TrainingSessionDetail;
  onSessionUpdated: () => void;
}

export default function TrainingSession({ session: initialSession, onSessionUpdated }: Props) {
  const [detail, setDetail] = useState<TrainingSessionDetail>(initialSession);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [ending, setEnding] = useState(false);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [showEndingHint, setShowEndingHint] = useState(false);
  const [review, setReview] = useState<TrainingReviewType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reviewRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setDetail(initialSession); }, [initialSession]);

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [detail.messages, scrollToBottom]);

  // 60s idle detection
  useEffect(() => {
    if (detail.status === 'completed') return;
    const resetTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      setQuickReplies([]);
      idleTimerRef.current = setTimeout(async () => {
        try {
          const result = await getQuickReplies(detail.id);
          setQuickReplies(result.suggestions || []);
        } catch (e) {
          console.error('Quick replies failed:', e);
        }
      }, 60000);
    };
    resetTimer();
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current); };
  }, [detail.id, detail.messages.length, detail.status]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending || detail.status === 'completed') return;
    setInput('');
    setSending(true);
    setQuickReplies([]);
    setError(null);
    try {
      const result: SendMessageResult = await sendTrainingMessage(detail.id, text);
      setDetail(prev => ({
        ...prev,
        status: 'active',
        messages: [...prev.messages, result.user_message, result.customer_message],
      }));
      if (result.conversation_ending) {
        setShowEndingHint(true);
      }
      onSessionUpdated();
      scrollToBottom();
    } catch (e) {
      console.error('Send message failed:', e);
      setError('发送消息失败，请稍后重试');
    } finally {
      setSending(false);
    }
  };

  const handleEnd = async () => {
    if (ending) return;
    setEnding(true);
    setError(null);
    try {
      const r = await endTrainingSession(detail.id);
      setDetail(prev => ({ ...prev, status: 'completed' as const }));
      setReview(r);
      onSessionUpdated();
    } catch (e) {
      console.error('End training failed:', e);
      setError('结束训练失败，请稍后重试');
    } finally {
      setEnding(false);
    }
  };

  const handleExportPDF = async () => {
    if (!reviewRef.current) return;
    try {
      const canvas = await html2canvas(reviewRef.current, { scale: 3, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 10;
      pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
      heightLeft -= (pageHeight - 20);
      while (heightLeft > 0) {
        position = heightLeft - imgHeight + 10;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
        heightLeft -= (pageHeight - 20);
      }
      pdf.save(`训练复盘_${detail.persona?.name || '未知'}_${new Date().toLocaleDateString('zh-CN')}.pdf`);
    } catch (e) {
      console.error('PDF export failed:', e);
      setError('PDF导出失败');
    }
  };

  const handleCloseReview = async () => {
    setReview(null);
    try {
      const updated = await getTrainingSession(detail.id);
      setDetail(updated);
    } catch (e) {
      console.error('Refresh session after review failed:', e);
    }
    onSessionUpdated();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  if (ending && !review) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0d1117]">
        <div className="text-center max-w-sm">
          <div className="text-3xl mb-4">📊</div>
          <p className="text-sm text-[#e6edf3] font-medium mb-2">正在生成复盘报告...</p>
          <p className="text-xs text-[#484f58] mb-5">AI 教练正在分析你的全部对话记录，预计需要 30-60 秒</p>
          <div className="w-full bg-[#21262d] rounded-full h-2 overflow-hidden mb-2">
            <div className="h-full rounded-full bg-gradient-to-r from-[#58a6ff] via-[#a371f7] to-[#3fb950] animate-loading-bar" style={{ width: '100%' }} />
          </div>
          <p className="text-[10px] text-[#484f58]">请耐心等待，不要关闭页面</p>
        </div>
      </div>
    );
  }

  const messages = detail.messages || [];
  const lastCoachTip: CoachTip | null = messages.length > 0
    ? messages.filter(m => m.role === 'user').slice(-1)[0]?.coach_tip || null
    : null;

  return (
    <div className="flex h-full relative">
      {/* Chat area */}
      <div className="flex-1 flex flex-col bg-[#0d1117] border-r-2 border-[#30363d] min-w-0">
        {/* Persona header */}
        <div className="flex items-center gap-2.5 px-3 py-2.5 bg-[#161b22] border-b-2 border-[#21262d] flex-shrink-0">
          <div className="w-8 h-8 rounded-full bg-[#30363d] border-2 border-[#d29922] flex items-center justify-center text-sm flex-shrink-0">
            👤
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-[#e6edf3] font-semibold truncate">
              {detail.persona?.name || '未知'} · {detail.persona?.age || '?'}岁 · {detail.persona?.occupation || '未知'} · {detail.persona?.risk_preference || ''}
            </div>
            <div className="text-[10px] text-[#484f58] truncate mt-0.5">
              场景：{detail.scenario}{detail.scenario_context ? ` — "${detail.scenario_context.slice(0, 40)}..."` : ''}
            </div>
          </div>
          <span className={`text-[10px] rounded-full px-2 py-0.5 border flex-shrink-0 ${
            detail.status === 'completed' ? 'bg-[#1c2128] border-[#3fb950] text-[#3fb950]' :
            detail.status === 'active' ? 'bg-[#1c2128] border-[#d29922] text-[#d29922]' :
            'bg-[#1c2128] border-[#484f58] text-[#484f58]'
          }`}>
            {detail.status === 'completed' ? '已完成' : detail.status === 'active' ? '进行中' : '未开始'}
          </span>
        </div>

        {/* Scenario briefing banner (shown when no messages yet) */}
        {messages.length === 0 && detail.scenario_context && (
          <div className="mx-3 mt-3 p-3 bg-[#161b22] border border-[#30363d] rounded-lg">
            <div className="text-[10px] font-semibold text-[#58a6ff] uppercase tracking-wider mb-1.5">训练简报</div>
            <p className="text-[11px] text-[#8b949e] leading-relaxed whitespace-pre-wrap">{detail.scenario_context}</p>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {messages.map(m => (
            <div key={m.id} className={`flex gap-2.5 ${m.role === 'user' ? 'flex-row-reverse' : 'items-flex-start'}`}>
              <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs ${
                m.role === 'user' ? 'bg-[#1f6feb]' : 'bg-[#30363d]'
              }`}>
                {m.role === 'user' ? '🧑' : '👤'}
              </div>
              <div className={`max-w-[70%] ${m.role === 'user' ? 'items-end' : ''}`}>
                <div className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-[#0d419d] border border-[#1f6feb] text-[#e6edf3]'
                    : 'bg-[#161b22] border border-[#30363d] text-[#e6edf3]'
                }`}>
                  {m.content}
                </div>
                <div className={`text-[9px] text-[#484f58] mt-1 ${m.role === 'user' ? 'text-right' : ''}`}>
                  {m.role === 'user' ? '我' : '数字人客户'} · {new Date(m.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}

          {/* AI ending hint */}
          {showEndingHint && detail.status !== 'completed' && (
            <div className="flex justify-center">
              <div className="bg-[#161b22] border border-[#d29922] rounded-lg px-3 py-2 text-center">
                <p className="text-[11px] text-[#d29922] mb-1.5">对话似乎已自然结束，是否生成复盘？</p>
                <button onClick={handleEnd} disabled={ending} className="px-3 py-1 bg-[#d29922] text-black text-[10px] rounded font-medium hover:bg-[#e0a832] disabled:opacity-50">
                  {ending ? '生成中...' : '生成复盘报告'}
                </button>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input bar */}
        <div className="p-2.5 border-t-2 border-[#21262d] bg-[#161b22] flex gap-2 items-center flex-shrink-0">
          <input
            ref={inputRef}
            type="text"
            placeholder={detail.status === 'completed' ? '训练已结束' : '输入你的回应...'}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={detail.status === 'completed'}
            className="flex-1 bg-[#0d1117] border border-[#21262d] rounded-md px-3 py-2 text-xs text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim() || detail.status === 'completed'}
            className="px-4 py-2 bg-[#1f6feb] border border-[#388bfd] rounded-md text-white text-[11px] font-medium hover:bg-[#2569d0] disabled:opacity-50 transition-colors flex-shrink-0"
          >
            {sending ? '发送中...' : '发送'}
          </button>
          {detail.status === 'completed' && detail.review ? (
            <button
              onClick={() => setReview(detail.review)}
              className="px-3 py-2 bg-[#21262d] border border-[#a371f7] rounded-md text-[#a371f7] text-[11px] hover:bg-[#1f1b2e] transition-colors flex-shrink-0"
            >
              查看复盘
            </button>
          ) : (
            <button
              onClick={handleEnd}
              disabled={ending || detail.status === 'completed'}
              className="px-3 py-2 bg-[#21262d] border border-[#f85149] rounded-md text-[#f85149] text-[11px] hover:bg-[#2a1f1f] disabled:opacity-50 transition-colors flex-shrink-0"
            >
              {ending ? '生成中...' : '结束训练'}
            </button>
          )}
        </div>
      </div>

      {/* Coach sidebar */}
      <div className="w-[260px] bg-[#0d1117] border-t-[3px] border-t-[#a371f7] flex flex-col flex-shrink-0">
        <div className="px-3 py-2.5 text-[10px] font-semibold text-[#a371f7] uppercase tracking-wider border-b border-[#21262d]">
          教练实时提示
        </div>
        <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
          {lastCoachTip ? (
            TIP_CONFIG.map(({ key, label, icon, color, borderColor }) => {
              const content = lastCoachTip[key];
              if (!content) return null;
              return (
                <div key={key} className="bg-[#161b22] border border-[#30363d] rounded-md p-2.5" style={{ borderLeft: `3px solid ${borderColor}` }}>
                  <div className="text-[9px] font-semibold uppercase mb-1" style={{ color }}>{icon} {label}</div>
                  <p className="text-[11px] text-[#8b949e] leading-relaxed">{content}</p>
                </div>
              );
            })
          ) : (
            <div className="text-center py-6">
              <p className="text-[11px] text-[#484f58]">
                {messages.length === 0 ? '开始对话后，教练提示将在这里显示' : '发送消息以获取教练提示'}
              </p>
            </div>
          )}

          {/* Quick replies */}
          {quickReplies.length > 0 && detail.status !== 'completed' && (
            <div className="bg-[#161b22] border border-[#a371f7]/40 rounded-md p-2.5 mt-2">
              <div className="text-[9px] font-semibold text-[#a371f7] uppercase mb-2">💭 回复思路建议</div>
              {quickReplies.map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(suggestion); inputRef.current?.focus(); setQuickReplies([]); }}
                  className="w-full text-left text-[10px] text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] rounded px-2 py-1 mb-1 last:mb-0 transition-colors"
                >
                  {i + 1}. {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Error toast */}
      {error && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 bg-[#f85149]/90 text-white text-xs px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-white/80 hover:text-white font-bold">✕</button>
        </div>
      )}

      {/* Review modal overlay */}
      {review && (
        <div className="absolute inset-0 z-40 flex items-start justify-center bg-black/70 overflow-y-auto py-8">
          <div className="relative w-full max-w-4xl mx-4">
            {/* Modal toolbar */}
            <div className="sticky top-0 z-10 flex items-center justify-between bg-[#161b22] border border-[#30363d] rounded-t-lg px-4 py-2.5">
              <span className="text-sm text-[#e6edf3] font-semibold">训练复盘报告</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportPDF}
                  className="btn btn-primary text-xs"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                    <path fillRule="evenodd" d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5ZM10 2H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5a.5.5 0 0 0-.5-.5H11a1 1 0 0 1-1-1V2Z"/>
                  </svg>
                  导出 PDF
                </button>
                <button
                  onClick={handleCloseReview}
                  className="text-[#8b949e] hover:text-[#e6edf3] text-lg leading-none px-1"
                >
                  ✕
                </button>
              </div>
            </div>
            {/* Modal body */}
            <div ref={reviewRef} className="bg-[#010409] border-x border-b border-[#30363d] rounded-b-lg overflow-hidden pdf-export">
              <TrainingReviewComponent review={review} session={detail} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
