import { useState, useEffect, useRef, useCallback } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import type { TrainingSessionDetail, CoachTip, SendMessageResult, TrainingReview as TrainingReviewType } from '../types';
import { sendTrainingMessage, getQuickReplies, endTrainingSession, getTrainingSession } from '../services/api';
import TrainingReviewComponent from './TrainingReview';

const TIP_CONFIG: { key: keyof CoachTip; label: string; icon: string; color: string; borderColor: string }[] = [
  { key: 'strategy', label: '策略建议', icon: '💡', color: 'var(--accent-blue)', borderColor: 'var(--accent-blue)' },
  { key: 'phrasing', label: '话术矫正', icon: '🔧', color: 'var(--accent-green)', borderColor: 'var(--accent-green)' },
  { key: 'golden_quote', label: '销售金句', icon: '⭐', color: 'var(--accent-orange)', borderColor: 'var(--accent-orange)' },
  { key: 'emotion', label: '情绪感知', icon: '🎯', color: 'var(--accent-orange)', borderColor: 'var(--accent-orange)' },
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
  const [showPersonaPopover, setShowPersonaPopover] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfExporting, setPdfExporting] = useState(false);
  const pdfBlobRef = useRef<Blob | null>(null);
  const [coachOpen, setCoachOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reviewRef = useRef<HTMLDivElement>(null);
  const personaRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setDetail(initialSession); }, [initialSession]);

  // Close persona popover on outside click
  useEffect(() => {
    if (!showPersonaPopover) return;
    const handler = (e: MouseEvent) => {
      if (personaRef.current && !personaRef.current.contains(e.target as Node)) {
        setShowPersonaPopover(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPersonaPopover]);

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [detail.messages, scrollToBottom]);

  // Cleanup blob URL
  useEffect(() => {
    return () => { if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl); };
  }, [pdfPreviewUrl]);

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
    setPdfExporting(true);
    try {
      const canvas = await html2canvas(reviewRef.current, { scale: 3, useCORS: true, backgroundColor: 'var(--color-white)' });
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
      const blob = pdf.output('blob');
      pdfBlobRef.current = blob;
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(URL.createObjectURL(blob));
    } catch (e) {
      console.error('PDF export failed:', e);
      setError('PDF导出失败');
    } finally {
      setPdfExporting(false);
    }
  };

  const handleDownloadPDF = () => {
    if (!pdfBlobRef.current) return;
    const a = document.createElement('a');
    const url = URL.createObjectURL(pdfBlobRef.current);
    a.href = url;
    a.download = `训练复盘_${detail.persona?.name || '未知'}_${new Date().toLocaleDateString('zh-CN')}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
      <div className="flex items-center justify-center h-full bg-[var(--bg-primary)]">
        <div className="text-center max-w-sm">
          <div className="text-3xl mb-4">📊</div>
          <p className="text-sm text-[var(--text-primary)] font-medium mb-2">正在生成复盘报告...</p>
          <p className="text-xs text-[var(--text-placeholder)] mb-5">AI 教练正在分析你的全部对话记录，预计需要 30-60 秒</p>
          <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-2 overflow-hidden mb-2">
            <div className="h-full rounded-full bg-gradient-to-r from-[var(--accent-blue)] via-[var(--accent-purple)] to-[var(--accent-green)] animate-loading-bar" style={{ width: '100%' }} />
          </div>
          <p className="text-[10px] text-[var(--text-placeholder)]">请耐心等待，不要关闭页面</p>
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
      <div className="flex-1 flex flex-col bg-[var(--bg-primary)] min-w-0 shadow-[0_0_20px_rgba(0,0,0,0.06)]">
        {/* Persona header */}
        <div className="flex items-center gap-2.5 px-4 py-3 bg-[var(--bg-secondary)] shadow-sm flex-shrink-0">
          <div ref={personaRef} className="relative flex-shrink-0">
            <button
              onClick={() => setShowPersonaPopover(v => !v)}
              className="w-8 h-8 rounded-full bg-[var(--border-default)] border-2 border-[var(--accent-orange)] flex items-center justify-center text-sm hover:border-[var(--accent-orange)] hover:bg-[var(--border-default)] transition-colors cursor-pointer"
              title="点击查看客户信息"
            >
              👤
            </button>
            {showPersonaPopover && (
              <div className="absolute top-full left-0 mt-2 w-72 bg-[var(--bg-secondary)] rounded-xl shadow-2xl z-50 overflow-hidden">
                <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-[var(--border-default)] border border-[var(--accent-orange)] flex items-center justify-center text-xs">
                      👤
                    </div>
                    <span className="text-sm font-semibold text-[var(--text-primary)]">{detail.persona?.name || '未知'}</span>
                  </div>
                  <button
                    onClick={() => setShowPersonaPopover(false)}
                    className="text-[var(--text-placeholder)] hover:text-[var(--text-primary)] text-sm leading-none"
                  >
                    ✕
                  </button>
                </div>
                <div className="px-3.5 py-3 space-y-2.5 max-h-80 overflow-y-auto">
                  {detail.persona?.age != null && (
                    <div>
                      <div className="text-[9px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">年龄</div>
                      <div className="text-xs text-[var(--text-primary)]">{detail.persona.age}岁</div>
                    </div>
                  )}
                  {detail.persona?.gender && (
                    <div>
                      <div className="text-[9px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">性别</div>
                      <div className="text-xs text-[var(--text-primary)]">{detail.persona.gender}</div>
                    </div>
                  )}
                  {detail.persona?.occupation && (
                    <div>
                      <div className="text-[9px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">职业</div>
                      <div className="text-xs text-[var(--text-primary)]">{detail.persona.occupation}</div>
                    </div>
                  )}
                  {detail.persona?.investment_experience && (
                    <div>
                      <div className="text-[9px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">投资经验</div>
                      <div className="text-xs text-[var(--text-primary)]">{detail.persona.investment_experience}</div>
                    </div>
                  )}
                  {detail.persona?.wealth_level && (
                    <div>
                      <div className="text-[9px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">资产状况</div>
                      <div className="text-xs text-[var(--text-primary)]">{detail.persona.wealth_level}</div>
                    </div>
                  )}
                  {detail.persona?.risk_preference && (
                    <div>
                      <div className="text-[9px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">风险偏好</div>
                      <div className="text-xs text-[var(--text-primary)]">{detail.persona.risk_preference}</div>
                    </div>
                  )}
                  {detail.persona?.goals && (
                    <div>
                      <div className="text-[9px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">理财目标</div>
                      <div className="text-xs text-[var(--text-primary)]">{detail.persona.goals}</div>
                    </div>
                  )}
                  {detail.persona?.personality && (
                    <div>
                      <div className="text-[9px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">性格特征</div>
                      <div className="text-xs text-[var(--text-primary)] leading-relaxed">{detail.persona.personality}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-[var(--text-primary)] font-semibold truncate">
              {detail.persona?.name || '未知'} · {detail.persona?.age || '?'}岁 · {detail.persona?.occupation || '未知'} · {detail.persona?.risk_preference || ''}
            </div>
            <div className="text-[10px] text-[var(--text-placeholder)] truncate mt-0.5">
              场景：{detail.scenario}{detail.scenario_context ? ` — "${detail.scenario_context.slice(0, 40)}..."` : ''}
            </div>
          </div>
          <span className={`text-[10px] rounded-full px-2 py-0.5 border flex-shrink-0 ${
            detail.status === 'completed' ? 'bg-[var(--bg-overlay)] border-[var(--accent-green)] text-[var(--accent-green)]' :
            detail.status === 'active' ? 'bg-[var(--bg-overlay)] border-[var(--accent-orange)] text-[var(--accent-orange)]' :
            'bg-[var(--bg-overlay)] border-[var(--text-placeholder)] text-[var(--text-placeholder)]'
          }`}>
            {detail.status === 'completed' ? '已完成' : detail.status === 'active' ? '进行中' : '未开始'}
          </span>
          <button
            onClick={() => setCoachOpen(v => !v)}
            className="lg:hidden px-2 py-1 text-[10px] rounded-full border border-[var(--border-default)] text-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/10 transition-all duration-200 flex items-center gap-1"
            title={coachOpen ? '收起教练' : '展开教练'}
          >
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1.5a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5ZM5.75 8a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5ZM12.5 6a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 0 1 3.5 0ZM10.25 10.5a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z"/>
            </svg>
            教练
          </button>
        </div>

        {/* Scenario briefing banner (shown when no messages yet) */}
        {messages.length === 0 && detail.scenario_context && (
          <div className="mx-3 mt-3 p-4 bg-[var(--bg-secondary)] rounded-xl shadow-sm">
            <div className="text-[10px] font-semibold text-[var(--accent-blue)] uppercase tracking-wider mb-1.5">训练简报</div>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{detail.scenario_context}</p>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {messages.map(m => (
            <div key={m.id} className={`flex gap-2.5 ${m.role === 'user' ? 'flex-row-reverse' : 'items-flex-start'}`}>
              <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs ${
                m.role === 'user' ? 'bg-[var(--btn-blue)]' : 'bg-[var(--border-default)]'
              }`}>
                {m.role === 'user' ? '🧑' : '👤'}
              </div>
              <div className={`max-w-[70%] ${m.role === 'user' ? 'items-end' : ''}`}>
                <div className={`rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-[var(--btn-blue)] text-white shadow-md'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-sm'
                }`}>
                  {m.content}
                </div>
                <div className={`text-[9px] text-[var(--text-placeholder)] mt-1 ${m.role === 'user' ? 'text-right' : ''}`}>
                  {m.role === 'user' ? '我' : '数字人客户'} · {new Date(m.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}

          {/* AI ending hint */}
          {showEndingHint && detail.status !== 'completed' && (
            <div className="flex justify-center">
              <div className="bg-[var(--bg-secondary)] rounded-xl shadow-sm px-4 py-3 text-center border border-[var(--accent-orange)]/20">
                <p className="text-[11px] text-[var(--accent-orange)] mb-1.5">对话似乎已自然结束，是否生成复盘？</p>
                <button onClick={handleEnd} disabled={ending} className="px-4 py-1.5 bg-[var(--accent-orange)] text-black text-[10px] rounded-full font-medium hover:bg-[var(--accent-orange)] disabled:opacity-50 transition-all duration-200">
                  {ending ? '生成中...' : '生成复盘报告'}
                </button>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input bar */}
        <div className="p-3 shadow-[0_-2px_8px_rgba(0,0,0,0.04)] bg-[var(--bg-secondary)] flex gap-2 items-center flex-shrink-0">
          <input
            ref={inputRef}
            type="text"
            placeholder={detail.status === 'completed' ? '训练已结束' : '输入你的回应...'}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={detail.status === 'completed'}
            className="flex-1 bg-[var(--bg-primary)] rounded-full px-4 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/30 disabled:opacity-50 shadow-sm transition-all duration-200"
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim() || detail.status === 'completed'}
            className="px-5 py-2 bg-[var(--btn-blue)] rounded-full text-white text-[11px] font-medium hover:bg-[var(--btn-blue-hover)] disabled:opacity-50 transition-all duration-200 flex-shrink-0 shadow-md"
          >
            {sending ? '发送中...' : '发送'}
          </button>
          {detail.status === 'completed' && detail.review ? (
            <button
              onClick={() => setReview(detail.review)}
              className="px-4 py-2 bg-[var(--bg-tertiary)] rounded-full text-[var(--accent-purple)] text-[11px] hover:bg-[var(--bg-overlay)] transition-all duration-200 flex-shrink-0 shadow-sm"
            >
              查看复盘
            </button>
          ) : (
            <button
              onClick={handleEnd}
              disabled={ending || detail.status === 'completed'}
              className="px-4 py-2 bg-[var(--bg-tertiary)] rounded-full text-[var(--accent-red)] text-[11px] hover:bg-[var(--color-danger-hover-bg)] disabled:opacity-50 transition-all duration-200 flex-shrink-0 shadow-sm"
            >
              {ending ? '生成中...' : '结束训练'}
            </button>
          )}
        </div>
      </div>

      {/* Coach sidebar — overlay on mobile, static on desktop */}
      {/* Mobile coach overlay backdrop */}
      {coachOpen && <div className="lg:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setCoachOpen(false)} />}
      <div className={`
        ${coachOpen ? 'fixed inset-y-0 right-0 z-50 w-[260px]' : 'hidden'}
        lg:static lg:block lg:w-[260px] lg:flex-shrink-0
        bg-[var(--bg-primary)] shadow-[0_0_20px_rgba(0,0,0,0.06)] flex flex-col
      `}>
        <div className="px-3 py-2.5 text-[10px] font-semibold text-[var(--accent-purple)] uppercase tracking-wider border-b border-[var(--border-subtle)] flex items-center justify-between">
          <span>教练实时提示</span>
          <button
            onClick={() => setCoachOpen(false)}
            className="lg:hidden text-[var(--text-placeholder)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
          {lastCoachTip ? (
            TIP_CONFIG.map(({ key, label, icon, color, borderColor }) => {
              const content = lastCoachTip[key];
              if (!content) return null;
              return (
                <div key={key} className="bg-[var(--bg-secondary)] rounded-xl p-3 shadow-sm transition-all duration-200" style={{ borderLeft: `3px solid ${borderColor}` }}>
                  <div className="text-[9px] font-semibold uppercase mb-1" style={{ color }}>{icon} {label}</div>
                  <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{content}</p>
                </div>
              );
            })
          ) : (
            <div className="text-center py-6">
              <p className="text-[11px] text-[var(--text-placeholder)]">
                {messages.length === 0 ? '开始对话后，教练提示将在这里显示' : '发送消息以获取教练提示'}
              </p>
            </div>
          )}

          {/* Quick replies */}
          {quickReplies.length > 0 && detail.status !== 'completed' && (
            <div className="bg-[var(--bg-secondary)] rounded-xl p-3 mt-2 shadow-sm transition-all duration-200">
              <div className="text-[9px] font-semibold text-[var(--accent-purple)] uppercase mb-2">💭 回复思路建议</div>
              {quickReplies.map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(suggestion); inputRef.current?.focus(); setQuickReplies([]); }}
                  className="w-full text-left text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded px-2 py-1 mb-1 last:mb-0 transition-colors"
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
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 bg-[var(--accent-red)]/90 backdrop-blur-sm text-white text-xs px-4 py-2 rounded-xl shadow-lg flex items-center gap-2">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-white/80 hover:text-white font-bold">✕</button>
        </div>
      )}

      {/* PDF Preview Modal */}
      {pdfPreviewUrl && (
        <div className="absolute inset-0 z-50 flex flex-col bg-black/80">
          <div className="flex items-center justify-between px-5 py-3 bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] flex-shrink-0">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">PDF 预览</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadPDF}
                className="px-4 py-1.5 text-xs rounded-full bg-[var(--btn-primary)] text-white hover:bg-[var(--btn-primary-hover)] transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                  <path fillRule="evenodd" d="M8 1.75a.75.75 0 0 1 .75.75v6.69l1.97-1.97a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0l-3.25-3.25a.75.75 0 1 1 1.06-1.06L7.25 9.19V2.5A.75.75 0 0 1 8 1.75ZM2.5 12.5a.75.75 0 0 1 .75-.75h9.5a.75.75 0 0 1 0 1.5h-9.5a.75.75 0 0 1-.75-.75Z"/>
                </svg>
                下载 PDF
              </button>
              <button
                onClick={() => setPdfPreviewUrl(null)}
                className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-full transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>
                </svg>
              </button>
            </div>
          </div>
          <iframe
            src={pdfPreviewUrl}
            className="flex-1 w-full border-0"
            title="PDF Preview"
          />
        </div>
      )}

      {/* Review modal overlay */}
      {review && (
        <div className="absolute inset-0 z-40 flex items-start justify-center bg-black/70 overflow-y-auto py-8">
          <div className="relative w-full max-w-4xl mx-4">
            {/* Modal toolbar */}
            <div className="sticky top-0 z-10 flex items-center justify-between bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-t-lg px-4 py-2.5">
              <span className="text-sm text-[var(--text-primary)] font-semibold">训练复盘报告</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportPDF}
                  disabled={pdfExporting}
                  className="btn btn-primary text-xs"
                >
                  {pdfExporting ? '生成中...' : '预览 PDF'}
                </button>
                <button
                  onClick={handleCloseReview}
                  className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-lg leading-none px-1"
                >
                  ✕
                </button>
              </div>
            </div>
            {/* Modal body */}
            <div ref={reviewRef} className="bg-[var(--bg-primary)] border-x border-b border-[var(--border-default)] rounded-b-lg overflow-hidden pdf-export">
              <TrainingReviewComponent review={review} session={detail} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
