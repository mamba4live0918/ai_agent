import { useState, useEffect, useCallback, useRef } from 'react';
import { useRealtimeASR } from '../hooks/useRealtimeASR';
import type { TranscriptSegment } from '../hooks/useRealtimeASR';
import { useCoachTips } from '../hooks/useCoachTips';
import SessionSidebar from '../components/SessionSidebar';
import ChatBubble from '../components/ChatBubble';
import CoachBubble from '../components/CoachBubble';
import RecordingBar from '../components/RecordingBar';
import CustomerPicker from '../components/CustomerPicker';
import type { RealtimeSessionDetail, Customer } from '../types';

// ─── Speaker role helpers ───

function getSpeakerInfo(seg: TranscriptSegment): { label: string; isSelf: boolean } {
  const name = seg.speaker_name || seg.speaker || '';
  if (name === '销售' || seg.speaker === 'speaker_0') {
    return { label: '销售', isSelf: true };
  }
  if (name === '客户' || seg.speaker?.startsWith('speaker_')) {
    return { label: name || '客户', isSelf: false };
  }
  return { label: name || '未知', isSelf: false };
}

function buildProfileText(customer: Customer): string {
  const parts: string[] = [];
  parts.push(`姓名: ${customer.name}`);
  if (customer.ai_profile) {
    const p = customer.ai_profile as Record<string, unknown>;
    if (p.personality_summary) parts.push(`性格: ${p.personality_summary}`);
    if (p.disc_type) parts.push(`DISC类型: ${p.disc_type}`);
    if (p.profile_summary) parts.push(`画像: ${p.profile_summary}`);
  }
  if (customer.scores) {
    const s = customer.scores as Record<string, unknown>;
    if (s.wealth_scale !== undefined) parts.push(`资产等级: ${s.wealth_scale}/10`);
    if (s.risk_tolerance !== undefined) parts.push(`风险偏好: ${s.risk_tolerance}/10`);
  }
  return parts.join(' | ');
}

// ─── Main page ───

export default function RealTimeVoice() {
  const {
    isRecording,
    connectionState,
    transcript,
    error: asrError,
    start,
    stop,
    sendCustomerProfile,
    coachTip,
  } = useRealtimeASR();

  const { activeTips, pinnedTips, addTip, pinTip, dismissTip } = useCoachTips();

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Timer ──
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isRecording) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((n) => n + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  // ── Customer selection ──
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const handleSelectCustomer = useCallback((customer: Customer) => {
    setSelectedCustomer(customer);
    sendCustomerProfile(buildProfileText(customer));
  }, [sendCustomerProfile]);

  const handleClearCustomer = useCallback(() => {
    setSelectedCustomer(null);
    sendCustomerProfile('');
  }, [sendCustomerProfile]);

  // ── Coach tip → hook ──
  const prevCoachTipRef = useRef<typeof coachTip>(null);
  useEffect(() => {
    if (coachTip && coachTip !== prevCoachTipRef.current) {
      prevCoachTipRef.current = coachTip;
      addTip(coachTip.trigger, coachTip.action, coachTip.content);
    }
  }, [coachTip, addTip]);

  // ── Session history ──
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [historyDetail, setHistoryDetail] = useState<RealtimeSessionDetail | null>(null);

  const prevRecordingRef = useRef(isRecording);
  useEffect(() => {
    if (prevRecordingRef.current && !isRecording) {
      setRefreshTrigger((n) => n + 1);
    }
    prevRecordingRef.current = isRecording;
  }, [isRecording]);

  const handleSelectSession = useCallback((detail: RealtimeSessionDetail) => {
    if (detail.session) {
      setHistoryDetail(detail);
      setSelectedSessionId(detail.session.id);
    } else {
      setHistoryDetail(null);
      setSelectedSessionId(null);
    }
    setSidebarOpen(false);
  }, []);

  const handleBackToLive = useCallback(() => {
    setHistoryDetail(null);
    setSelectedSessionId(null);
  }, []);

  // ── Determine segments to display ──
  const displaySegments: TranscriptSegment[] = historyDetail
    ? historyDetail.segments.map((seg) => ({
        start: seg.start,
        end: seg.end,
        text: seg.text,
        confidence: seg.confidence,
        isPartial: false,
        speaker: seg.speaker,
        speaker_name: seg.speaker,
      }))
    : transcript;

  const isHistory = !!historyDetail;
  const allVisibleTips = [...activeTips, ...pinnedTips];

  return (
    <div className="flex h-full relative overflow-hidden">
      {/* ── Left: Session history sidebar ── */}
      <div className={`absolute left-0 top-0 bottom-0 z-20 flex flex-row
        transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-[calc(100%-4px)]'}`}>
        <div className="w-[220px] sm:w-[240px] h-full flex flex-col sidebar-glass relative">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-12 rounded-r-lg sidebar-toggle
              flex items-center justify-center hover:bg-[var(--bg-overlay)] hover:shadow-[0_0_8px_rgba(88,166,255,0.15)]
              transition-all duration-200 z-10 group/toggle"
            title={sidebarOpen ? '收起' : '展开'}
          >
            <svg className="w-3 h-3 text-[var(--text-placeholder)] group-hover/toggle:text-[var(--accent-blue)] transition-colors" viewBox="0 0 16 16" fill="currentColor">
              {sidebarOpen ? (
                <path fillRule="evenodd" d="M5.646 3.646a.5.5 0 0 1 .708 0l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L9.293 8 5.646 4.354a.5.5 0 0 1 0-.708Z" clipRule="evenodd"/>
              ) : (
                <path fillRule="evenodd" d="M10.354 3.646a.5.5 0 0 1 0 .708L6.707 8l3.647 3.646a.5.5 0 0 1-.708.708l-4-4a.5.5 0 0 1 0-.708l4-4a.5.5 0 0 1 .708 0Z" clipRule="evenodd"/>
              )}
            </svg>
          </button>
          <div className="flex-1 overflow-hidden">
            <SessionSidebar
              refreshTrigger={refreshTrigger}
              onSelectSession={handleSelectSession}
              selectedSessionId={selectedSessionId}
            />
          </div>
        </div>
      </div>

      {/* Sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="absolute inset-0 z-[15] bg-black/40 backdrop-blur-[2px] transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Main chat area ── */}
      <div className="flex-1 flex flex-col min-w-0 bg-[var(--bg-secondary)]">
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)] flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {/* History toggle */}
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0"
              title="录音历史"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                <path fillRule="evenodd" d="M2 3.75A.75.75 0 0 1 2.75 3h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 3.75Zm0 4a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 7.75Zm0 4a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1-.75-.75Z" clipRule="evenodd"/>
              </svg>
            </button>

            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-[var(--text-primary)] truncate">
                {isHistory ? '历史回放' : '实时语音陪跑'}
              </h2>
              {isHistory && historyDetail && (
                <p className="text-[10px] text-[var(--text-placeholder)] truncate">
                  {historyDetail.segments.length} 条片段 · {historyDetail.session.speaker_count} 人
                </p>
              )}
            </div>

            {/* Customer selector (live mode only) */}
            {!isHistory && (
              <CustomerPicker
                selected={selectedCustomer}
                onSelect={handleSelectCustomer}
                onClear={handleClearCustomer}
              />
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {isHistory && (
              <button
                onClick={handleBackToLive}
                className="px-3 py-1.5 text-xs rounded-full border border-[var(--accent-blue)] text-[var(--accent-blue)] hover:bg-[var(--btn-blue)]/10 transition-all duration-200"
              >
                返回实时
              </button>
            )}
          </div>
        </div>

        {/* Chat transcript + coach bubbles */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {/* Empty state */}
          {displaySegments.length === 0 && !isRecording && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center px-4">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center">
                  <svg className="w-8 h-8 text-[var(--text-placeholder)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                  </svg>
                </div>
                <p className="text-sm text-[var(--text-secondary)] font-medium">实时语音陪跑</p>
                <p className="text-xs text-[var(--text-placeholder)] mt-1">点击下方按钮开始录音，AI 将实时转录并生成教练提示</p>
              </div>
            </div>
          )}

          {/* Recording waiting indicator */}
          {displaySegments.length === 0 && isRecording && (
            <div className="flex justify-center">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--bg-secondary)] text-xs text-[var(--text-secondary)]">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-red)] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--accent-red)]" />
                </span>
                等待语音输入...
              </div>
            </div>
          )}

          {/* Error banner */}
          {asrError && (
            <div className="mx-auto max-w-md px-3 py-2 bg-[var(--btn-danger)]/10 border border-[var(--btn-danger)]/30 rounded-xl text-xs text-[var(--accent-red)] text-center">
              {asrError}
            </div>
          )}

          {/* System start message */}
          {isRecording && displaySegments.length > 0 && (
            <div className="flex justify-center">
              <span className="text-[10px] text-[var(--text-placeholder)] bg-[var(--bg-secondary)] px-3 py-1 rounded-full">
                🎙️ 录音开始{selectedCustomer ? ` · 已关联客户：${selectedCustomer.name}` : ''}
              </span>
            </div>
          )}

          {/* Chat bubbles */}
          {displaySegments.map((seg, i) => {
            const { label, isSelf } = getSpeakerInfo(seg);
            return (
              <ChatBubble
                key={`seg-${seg.segment_id || i}`}
                text={seg.text}
                timestamp={seg.start}
                speaker={label}
                isSelf={isSelf}
                confidence={seg.confidence}
                isPartial={seg.isPartial}
                calibrated={seg.calibrated}
              />
            );
          })}

          {/* Coach tips — inline after the latest segment */}
          {allVisibleTips.map((tip) => (
            <CoachBubble
              key={tip.id}
              tip={tip}
              onPin={pinTip}
              onDismiss={dismissTip}
            />
          ))}

          {/* Recording indicator */}
          {isRecording && displaySegments.length > 0 && (
            <div className="flex justify-center pt-1">
              <span className="text-[10px] text-[var(--text-placeholder)] flex items-center gap-1">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-red)] opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[var(--accent-red)]" />
                </span>
                录制中...
              </span>
            </div>
          )}
        </div>

        {/* Bottom recording bar (live mode only) */}
        {!isHistory && (
          <RecordingBar
            isRecording={isRecording}
            connectionState={connectionState}
            elapsed={elapsed}
            onStart={start}
            onStop={stop}
          />
        )}
      </div>
    </div>
  );
}
