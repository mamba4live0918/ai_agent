import { useState, useRef, useEffect, useCallback } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import type { PostSalesSessionDetail, PostSalesMessage, Customer } from '../types';
import { uploadPostSalesAudio, endPostSalesSession, updatePostSalesSession, getCustomers } from '../services/api';
import PostSalesReport from './PostSalesReport';

interface Props {
  session: PostSalesSessionDetail;
  onSessionUpdated: () => void;
}

const ROLE_LABEL: Record<string, { label: string; color: string }> = {
  salesperson: { label: '销售', color: 'bg-[var(--btn-blue)]' },
  customer: { label: '客户', color: 'bg-[var(--btn-primary)]' },
  system: { label: '系统', color: 'bg-[var(--text-secondary)]' },
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function PostSalesSession({ session, onSessionUpdated }: Props) {
  const [messages, setMessages] = useState<PostSalesMessage[]>(session.messages || []);
  const [uploading, setUploading] = useState(false);
  const [ending, setEnding] = useState(false);
  const [report, setReport] = useState<Record<string, unknown> | null>(session.report as unknown as Record<string, unknown> | null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [customerName, setCustomerName] = useState(session.customer_name || null);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerList, setCustomerList] = useState<Customer[]>([]);
  const [linkingCustomer, setLinkingCustomer] = useState(false);
  const [customerError, setCustomerError] = useState('');
  const [pdfExporting, setPdfExporting] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setMessages(session.messages || []);
    setReport(session.report as unknown as Record<string, unknown> | null);
    setCustomerName(session.customer_name || null);
  }, [session]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Cleanup recorder on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Close picker on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowCustomerPicker(false);
      }
    };
    if (showCustomerPicker) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [showCustomerPicker]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (showReportModal) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [showReportModal]);

  const searchCustomers = useCallback(async (q: string) => {
    setCustomerError('');
    try {
      const result = await getCustomers(q || undefined, 1, 20);
      setCustomerList(result.items);
    } catch (e) {
      setCustomerError(e instanceof Error ? e.message : '加载失败');
      setCustomerList([]);
    }
  }, []);

  const openCustomerPicker = useCallback(() => {
    setShowCustomerPicker(true);
    setCustomerSearch('');
    setCustomerError('');
    searchCustomers('');
  }, [searchCustomers]);

  const linkCustomer = useCallback(async (customer: Customer) => {
    setLinkingCustomer(true);
    try {
      await updatePostSalesSession(session.id, { customer_id: customer.id });
      setCustomerName(customer.name);
      setShowCustomerPicker(false);
      onSessionUpdated();
    } catch (e) { console.error('Link customer failed:', e); }
    finally { setLinkingCustomer(false); }
  }, [session.id, onSessionUpdated]);

  const unlinkCustomer = useCallback(async () => {
    setLinkingCustomer(true);
    try {
      await updatePostSalesSession(session.id, { customer_id: null });
      setCustomerName(null);
      setShowCustomerPicker(false);
      onSessionUpdated();
    } catch (e) { console.error('Unlink customer failed:', e); }
    finally { setLinkingCustomer(false); }
  }, [session.id, onSessionUpdated]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        chunksRef.current = [];
        if (blob.size === 0) return;

        setUploading(true);
        try {
          const file = new File([blob], `recording_${Date.now()}.webm`, { type: recorder.mimeType });
          const results = await uploadPostSalesAudio(session.id, file);
          setMessages(prev => [...prev, ...results]);
        } catch (err) { console.error('Recording upload failed:', err); }
        finally { setUploading(false); }
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone access denied:', err);
      alert('无法访问麦克风，请检查浏览器权限设置');
    }
  }, [session.id]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const results = await uploadPostSalesAudio(session.id, file);
      setMessages(prev => [...prev, ...results]);
    } catch (err) { console.error('Audio upload failed:', err); }
    finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleEnd = async () => {
    if (!confirm('确定结束通话并生成分析报告吗？')) return;
    setEnding(true);
    try {
      const detail = await endPostSalesSession(session.id);
      setReport(detail.report as unknown as Record<string, unknown> | null);
      setShowReportModal(true);
      onSessionUpdated();
    } catch (e) { console.error('End session failed:', e); }
    finally { setEnding(false); }
  };

  const handleExportPDF = async () => {
    if (!reportRef.current) return;
    setPdfExporting(true);
    try {
      const canvas = await html2canvas(reportRef.current, { scale: 3, useCORS: true, backgroundColor: 'var(--bg-primary)' });
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
      pdf.save(`售后分析_${customerName || '未关联'}_${new Date().toLocaleDateString('zh-CN')}.pdf`);
    } catch (e) {
      console.error('PDF export failed:', e);
    } finally {
      setPdfExporting(false);
    }
  };

  const isCompleted = session.status === 'completed' || !!report;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-[var(--text-secondary)]" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM3 8.25a.5.5 0 0 0 .5.5h2.69l-1.72 1.72a.5.5 0 0 0 .78.78l2.5-2.5a.5.5 0 0 0 0-.78l-2.5-2.5a.5.5 0 0 0-.78.78L6.19 7.75H3.5a.5.5 0 0 0-.5.5Z"/>
            </svg>
            <div className="relative" ref={pickerRef}>
              <button
                onClick={openCustomerPicker}
                disabled={isCompleted}
                className="flex items-center gap-1 text-sm font-medium text-[var(--text-primary)] hover:text-[var(--accent-blue)] disabled:hover:text-[var(--text-primary)] disabled:cursor-default transition-colors group"
              >
                <span>{customerName || '未关联客户'}</span>
                {!isCompleted && (
                  <svg className="w-3 h-3 text-[var(--text-placeholder)] group-hover:text-[var(--accent-blue)] transition-colors" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M11.28 6.78a.75.75 0 0 0-1.06-1.06L7.25 8.69 5.78 7.22a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l3.5-3.5Z"/>
                    <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0ZM1.5 8a6.5 6.5 0 1 1 13 0 6.5 6.5 0 0 1-13 0Z"/>
                  </svg>
                )}
              </button>
              {showCustomerPicker && (
                <div className="absolute top-full left-0 mt-1 w-64 bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-lg shadow-xl z-50">
                  <div className="p-2">
                    <input
                      type="text"
                      value={customerSearch}
                      onChange={e => { setCustomerSearch(e.target.value); searchCustomers(e.target.value); }}
                      placeholder="搜索客户..."
                      autoFocus
                      className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-md px-2.5 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-placeholder)] focus:outline-none focus:border-[var(--accent-blue)]"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {customerName && (
                      <button
                        onClick={unlinkCustomer}
                        className="w-full px-3 py-2 text-left text-xs text-[var(--accent-red)] hover:bg-[var(--bg-tertiary)] transition-colors border-b border-[var(--border-subtle)]"
                      >
                        解除关联
                      </button>
                    )}
                    {customerError ? (
                      <p className="px-3 py-3 text-xs text-[var(--accent-red)] text-center">{customerError}</p>
                    ) : customerList.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-[var(--text-placeholder)] text-center">
                        {linkingCustomer ? '关联中...' : '暂无客户，请先在客户分析中创建'}
                      </p>
                    ) : (
                      customerList.map(c => (
                        <button
                          key={c.id}
                          onClick={() => linkCustomer(c)}
                          disabled={linkingCustomer}
                          className="w-full px-3 py-2 text-left hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-50"
                        >
                          <span className="text-xs text-[var(--text-primary)]">{c.name}</span>
                          {c.ai_profile && (
                            <span className="text-[10px] text-[var(--text-placeholder)] ml-2">
                              {(c.ai_profile as Record<string, unknown>).age ? `${(c.ai_profile as Record<string, unknown>).age}岁` : ''}
                              {(c.ai_profile as Record<string, unknown>).occupation ? ` · ${(c.ai_profile as Record<string, unknown>).occupation}` : ''}
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
            isCompleted ? 'bg-[var(--btn-primary)] text-white' :
            session.status === 'processing' ? 'bg-[var(--accent-orange)] text-black' :
            'bg-[var(--btn-blue)] text-white'
          }`}>
            {isCompleted ? '已完成' : session.status === 'processing' ? '处理中' : '记录中'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!isCompleted && (
            <>
              {isRecording ? (
                <button
                  onClick={stopRecording}
                  className="px-3 py-1.5 text-xs rounded-md bg-[var(--btn-danger)] text-white hover:bg-[var(--accent-red)] transition-colors flex items-center gap-1.5 animate-pulse"
                >
                  <span className="w-2 h-2 rounded-full bg-white" />
                  <span className="font-mono tabular-nums">{formatDuration(recordingTime)}</span>
                  <span>停止</span>
                </button>
              ) : (
                <button
                  onClick={startRecording}
                  disabled={uploading}
                  className="px-3 py-1.5 text-xs rounded-md border border-[var(--btn-danger)] text-[var(--accent-red)] hover:bg-[var(--btn-danger)]/10 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm0 1.5a4 4 0 0 1-4-4V5a4 4 0 0 1 8 0v3.5a4 4 0 0 1-4 4Z"/>
                    <path d="M3.25 6.75a.75.75 0 0 1 1.5 0V8a3.25 3.25 0 0 0 6.5 0V6.75a.75.75 0 0 1 1.5 0V8a4.75 4.75 0 0 1-4 4.7v1.55h1.75a.75.75 0 0 1 0 1.5h-5a.75.75 0 0 1 0-1.5h1.75v-1.55A4.75 4.75 0 0 1 3.25 8V6.75Z"/>
                  </svg>
                  录音
                </button>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || isRecording}
                className="px-3 py-1.5 text-xs rounded-md border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"/>
                </svg>
                {uploading ? '上传中...' : '上传录音'}
              </button>
              <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" />
              <button
                onClick={handleEnd}
                disabled={ending || messages.length === 0}
                className="px-3 py-1.5 text-xs rounded-md bg-[var(--btn-danger)] text-white hover:bg-[var(--accent-red)] disabled:opacity-50 transition-colors"
              >
                {ending ? '生成中...' : '结束通话'}
              </button>
            </>
          )}
          {isCompleted && (
            <button
              onClick={() => setShowReportModal(true)}
              className="px-3 py-1.5 text-xs rounded-md bg-[var(--btn-blue)] text-white hover:bg-[var(--btn-blue-hover)] transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                <path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25v-9.5ZM1.75 1.5a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25H1.75Z"/>
              </svg>
              查看报告
            </button>
          )}
        </div>
      </div>

      {/* Messages — always visible */}
      <div className="flex-1 relative">
        <div ref={scrollRef} className="absolute inset-0 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && !uploading && (
          <div className="flex items-center justify-center h-full text-[var(--text-placeholder)] text-sm">
            <div className="text-center">
              <svg className="w-8 h-8 mx-auto mb-2 text-[var(--border-default)]" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM3 8.25a.5.5 0 0 0 .5.5h2.69l-1.72 1.72a.5.5 0 0 0 .78.78l2.5-2.5a.5.5 0 0 0 0-.78l-2.5-2.5a.5.5 0 0 0-.78.78L6.19 7.75H3.5a.5.5 0 0 0-.5.5Z"/>
              </svg>
              <p>点击「录音」开始录制通话，或「上传录音」导入音频文件</p>
            </div>
          </div>
        )}
        {messages.map(msg => {
          const roleInfo = ROLE_LABEL[msg.role] || { label: msg.role, color: 'bg-[var(--text-placeholder)]' };
          const isTranscribed = /^【(?:销售|客户|其他[\d]*)】\[[\d.]+s-[\d.]+s\]|^\[[\d.]+s-[\d.]+s\]/.test(msg.content);
          const isAudio = msg.content.startsWith('[Audio uploaded');
          // Clean display text: strip speaker tag and timestamp
          const displayText = isAudio
            ? msg.content.replace('[Audio uploaded: ', '录音文件: ').replace(']', '')
            : isTranscribed
            ? msg.content.replace(/^(?:【.+?】)?\[[\d.]+s-[\d.]+s\]\s*/, '')
            : msg.content;
          return (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'salesperson' ? 'justify-end' : ''}`}>
              {msg.role !== 'salesperson' && (
                <span className={`flex-shrink-0 w-7 h-7 rounded-full ${roleInfo.color} flex items-center justify-center text-[10px] font-bold text-white`}>
                  {roleInfo.label[0]}
                </span>
              )}
              <div className={`max-w-[75%] ${msg.role === 'salesperson' ? 'order-[-1]' : ''}`}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] text-[var(--text-secondary)]">{roleInfo.label}</span>
                  {isAudio && (
                    <svg className="w-3 h-3 text-[var(--accent-orange)]" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"/>
                    </svg>
                  )}
                  {isTranscribed && (
                    <svg className="w-3 h-3 text-[var(--btn-blue)]" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5Z"/>
                    </svg>
                  )}
                </div>
                <div className={`px-3 py-2 rounded-lg text-sm leading-relaxed ${
                  msg.role === 'salesperson'
                    ? 'bg-[var(--btn-blue)] text-white rounded-tr-sm'
                    : isAudio
                    ? 'bg-[var(--bg-tertiary)] border border-[var(--accent-orange)] text-[var(--text-primary)] rounded-tl-sm'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-tl-sm'
                }`}>
                  {displayText}
                </div>
                <span className="text-[9px] text-[var(--text-placeholder)] mt-0.5 block">
                  {new Date(msg.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          );
        })}
        {messages.length > 0 && !isCompleted && !uploading && (
          <p className="text-[10px] text-[var(--text-placeholder)] text-center pt-2">
            录音将自动转为对话记录，点击「结束通话」生成 AI 分析报告
          </p>
        )}
        </div>

        {/* Uploading overlay */}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-primary)]/80 z-10">
            <div className="text-center">
              <div className="animate-spin w-10 h-10 border-3 border-[var(--accent-blue)] border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-sm text-[var(--text-primary)] font-medium mb-1">正在处理录音</p>
              <p className="text-xs text-[var(--text-placeholder)]">音频上传中，转录完成后将自动显示对话记录</p>
            </div>
          </div>
        )}
      </div>

      {/* Report Modal */}
      {showReportModal && report && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 pt-8 pb-8">
          <div className="relative w-full max-w-4xl mx-4">
            {/* Modal header */}
            <div className="sticky top-0 z-10 bg-[var(--bg-secondary)] border border-b-0 border-[var(--border-default)] rounded-t-lg px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">AI 分析报告</h2>
                <span className="text-[10px] text-[var(--text-secondary)]">{customerName || '未关联客户'}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportPDF}
                  disabled={pdfExporting}
                  className="px-3 py-1.5 text-xs rounded-md border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-50 transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                    <path fillRule="evenodd" d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5ZM10 2H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5a.5.5 0 0 0-.5-.5H11a1 1 0 0 1-1-1V2Z"/>
                  </svg>
                  {pdfExporting ? '导出中...' : '导出 PDF'}
                </button>
                <button
                  onClick={() => setShowReportModal(false)}
                  className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-md transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>
                  </svg>
                </button>
              </div>
            </div>
            {/* Modal body */}
            <div ref={reportRef} className="bg-[var(--bg-primary)] border border-t-0 border-[var(--border-default)] rounded-b-lg overflow-hidden pdf-export">
              <PostSalesReport report={report} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
