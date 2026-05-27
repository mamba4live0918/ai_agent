import React, { useState, useEffect, useCallback } from 'react';
import { useRealtimeASR } from '../hooks/useRealtimeASR';
import type { TranscriptSegment, ConnectionState } from '../hooks/useRealtimeASR';
import RealtimeCoach from '../components/RealtimeCoach';
import SessionSidebar from '../components/SessionSidebar';
import type { RealtimeSessionDetail } from '../types';

// ─── Status helpers ───

const STATUS_LABELS: Record<ConnectionState, string> = {
  idle: '就绪',
  connecting: '连接中...',
  streaming: '录制中',
  disconnected: '已断开',
};

const STATUS_COLORS: Record<ConnectionState, string> = {
  idle: 'var(--text-placeholder)',
  connecting: 'var(--accent-orange)',
  streaming: 'var(--accent-green)',
  disconnected: 'var(--accent-red)',
};

// ─── Segment display ───

function TranscriptList({
  segments,
  partialText,
}: {
  segments: TranscriptSegment[];
  partialText: string;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [segments, partialText]);

  if (segments.length === 0 && !partialText) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-placeholder)] text-sm">
        <div className="text-center">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
          </svg>
          <p>点击下方按钮开始实时语音记录</p>
          <p className="text-[11px] mt-1 text-[var(--text-placeholder)]">转录内容将实时显示在此处</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
      {segments.map((seg, i) => (
        <div key={i} className="group">
          {seg.speaker && (
            <span className="text-[11px] text-[var(--accent-blue)] font-medium">
              [{seg.speaker.replace('speaker_', '说话人')}]
            </span>
          )}
          <span className="text-[var(--text-primary)] text-sm ml-1">{seg.text}</span>
          <span className="text-[10px] text-[var(--text-placeholder)] ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
            {seg.start.toFixed(1)}s - {seg.end.toFixed(1)}s
          </span>
        </div>
      ))}
      {partialText && (
        <div className="text-sm text-[var(--text-secondary)] italic border-l-2 border-[var(--accent-orange)] pl-3 animate-pulse">
          {partialText}
        </div>
      )}
    </div>
  );
}

// ─── Main page ───

export default function RealTimeVoice() {
  const {
    isRecording,
    connectionState,
    transcript,
    partialText,
    error,
    start,
    stop,
    sendInterrupt,
  } = useRealtimeASR();

  const [coachConnected, setCoachConnected] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);

  // Session history state
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [historyDetail, setHistoryDetail] = useState<RealtimeSessionDetail | null>(null);

  // Detect recording stop → trigger sidebar refresh
  const prevRecordingRef = React.useRef(isRecording);
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

  // Determine which segments to display
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

  return (
    <div className="flex h-full relative">
      {/* Sliding container: card + tab move together */}
      <div className={`absolute left-0 top-0 bottom-0 z-20 flex flex-row
        transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
        ${sidebarOpen ? 'translate-x-0 opacity-100' : '-translate-x-[calc(100%-8px)] opacity-70'}`}>
        <div className="w-[260px] sm:w-[280px] h-full flex flex-col
          bg-[var(--bg-secondary)] rounded-r-2xl">
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--bg-primary)]">
          <span className="text-xs font-semibold text-[var(--text-primary)]">录音历史</span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--text-placeholder)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M5.646 3.646a.5.5 0 0 1 .708 0l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L9.293 8 5.646 4.354a.5.5 0 0 1 0-.708Z" clipRule="evenodd"/>
            </svg>
          </button>
        </div>
        {/* Session list content */}
        <div className="flex-1 overflow-hidden">
          <SessionSidebar
            refreshTrigger={refreshTrigger}
            onSelectSession={handleSelectSession}
            selectedSessionId={selectedSessionId}
          />
        </div>
      </div>

      {/* Tab handle — attached to right side of card */}
      <div
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="w-[8px] flex-shrink-0 h-full flex items-center cursor-pointer group
            hover:shadow-[0_0_8px_rgba(88,166,255,0.15)]
            transition-all duration-200"
          style={{ backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 35%, transparent)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
      >
        <div className="w-2 h-6 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-default)]
          flex items-center justify-center
          group-hover:border-[var(--accent-blue)] group-hover:bg-[var(--bg-primary)] group-hover:shadow-sm
          transition-all duration-200">
          <svg className="w-1.5 h-1.5 text-[var(--text-placeholder)] group-hover:text-[var(--accent-blue)]" viewBox="0 0 16 16" fill="currentColor">
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

      {/* Mobile coach overlay */}
      {coachOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setCoachOpen(false)} />
      )}

      {/* Center: Main content — transcript + controls */}
      <div className={`flex-1 flex flex-col min-w-0 transition-[margin] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${sidebarOpen ? 'ml-[280px] sm:ml-[300px]' : 'ml-0'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-3 sm:px-5 py-3 border-b border-[var(--border-subtle)] flex-wrap gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] truncate">
              {historyDetail ? '历史回放' : '实时语音陪跑'}
            </h2>
            <p className="text-[10px] sm:text-[11px] text-[var(--text-placeholder)] mt-0.5 truncate">
              {historyDetail
                ? `${historyDetail.segments.length} 条片段 · ${historyDetail.session.speaker_count} 人`
                : 'AI 实时转录 + 教练提示'}
            </p>
          </div>

          {/* Status + Controls */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {/* Back to live button */}
            {historyDetail && (
              <button
                onClick={handleBackToLive}
                className="px-3 py-1.5 text-xs rounded-full border border-[var(--border-default)] text-[var(--accent-blue)] hover:bg-[var(--btn-blue)]/10 transition-all duration-200"
              >
                返回实时
              </button>
            )}

            {/* Status indicator */}
            {!historyDetail && (
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS[connectionState] }}
                />
                <span className="text-xs text-[var(--text-secondary)]">{STATUS_LABELS[connectionState]}</span>
              </div>
            )}

            {/* Speak now interrupt button */}
            {isRecording && (
              <button
                onClick={sendInterrupt}
                className="px-3 py-1.5 text-xs rounded-full border border-[var(--accent-orange)] text-[var(--accent-orange)] bg-[var(--accent-orange)]/10 hover:bg-[var(--accent-orange)]/20 transition-all duration-200"
                title="打断 AI 语音回应"
              >
                打断
              </button>
            )}

            {/* Coach toggle — mobile only */}
            <button
              onClick={() => setCoachOpen((v) => !v)}
              className="lg:hidden px-2 py-1.5 text-xs rounded-full border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all duration-200 flex items-center gap-1.5"
              title={coachOpen ? '收起教练' : '展开教练'}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1.5a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5ZM5.75 8a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5ZM12.5 6a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 0 1 3.5 0ZM10.25 10.5a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z"/>
              </svg>
              教练
            </button>

            {/* Start / Stop */}
            {!isRecording ? (
              <button
                onClick={start}
                disabled={connectionState === 'connecting'}
                className="px-4 py-1.5 text-xs font-medium rounded-full bg-[var(--btn-danger)] text-white hover:bg-[var(--accent-red)] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 1.5a5.25 5.25 0 1 0 0 10.5A5.25 5.25 0 0 0 8 1.5ZM8 0a6.75 6.75 0 1 1 0 13.5A6.75 6.75 0 0 1 8 0Zm-.75 4.5a.75.75 0 0 1 1.5 0v3a.75.75 0 0 1-1.5 0v-3ZM8 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
                </svg>
                开始录音
              </button>
            ) : (
              <button
                onClick={stop}
                className="px-4 py-1.5 text-xs font-medium rounded-full border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-red)]/50 transition-all duration-200 flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M5.75 2.5a.75.75 0 0 1 .75.75v9.5a.75.75 0 0 1-1.5 0v-9.5a.75.75 0 0 1 .75-.75Zm4.5 0a.75.75 0 0 1 .75.75v9.5a.75.75 0 0 1-1.5 0v-9.5a.75.75 0 0 1 .75-.75Z" />
                </svg>
                停止录音
              </button>
            )}
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-4 mt-3 px-3 py-2 bg-[var(--btn-danger)]/10 border border-[var(--btn-danger)]/30 rounded-xl text-xs text-[var(--accent-red)]">
            {error}
          </div>
        )}

        {/* Transcript area */}
        <TranscriptList
          segments={displaySegments}
          partialText={historyDetail ? '' : partialText}
        />
      </div>

      {/* Right: Coach panel — overlay on mobile, static on desktop */}
      <div className={`
        ${coachOpen ? 'fixed inset-0 z-50 lg:static' : 'hidden lg:block'}
        lg:w-[320px] lg:flex-shrink-0 bg-[var(--bg-primary)]
      `}>
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-subtle)] lg:hidden">
          <span className="text-sm font-semibold text-[var(--text-primary)]">AI 教练</span>
          <button
            onClick={() => setCoachOpen(false)}
            className="p-1 text-[var(--text-placeholder)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto" style={{ height: coachOpen ? 'calc(100% - 41px)' : '100%' }}>
          <RealtimeCoach
            connected={coachConnected}
            onConnect={() => setCoachConnected(true)}
            onDisconnect={() => setCoachConnected(false)}
          />
        </div>
      </div>
    </div>
  );
}
