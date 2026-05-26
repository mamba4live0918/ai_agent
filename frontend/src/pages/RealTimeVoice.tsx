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
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
      }))
    : transcript;

  return (
    <div className="flex h-full">
      {/* Left: Session History Sidebar */}
      {sidebarOpen && (
        <div className="w-[260px] flex-shrink-0">
          <SessionSidebar
            refreshTrigger={refreshTrigger}
            onSelectSession={handleSelectSession}
            selectedSessionId={selectedSessionId}
          />
        </div>
      )}

      {/* Center: Main content — transcript + controls */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            {/* Sidebar toggle */}
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="text-[var(--text-placeholder)] hover:text-[var(--text-secondary)] transition-colors"
              title={sidebarOpen ? '收起历史' : '展开历史'}
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                <path fillRule="evenodd" d="M7.78 12.53a.75.75 0 0 1-1.06 0L2.47 8.28a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 1.06L4.06 7.75h9.19a.75.75 0 0 1 0 1.5H4.06l3.72 3.72a.75.75 0 0 1 0 1.06Z" />
              </svg>
            </button>

            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                {historyDetail ? '历史回放' : '实时语音陪跑'}
              </h2>
              <p className="text-[11px] text-[var(--text-placeholder)] mt-0.5">
                {historyDetail
                  ? `${historyDetail.segments.length} 条片段 · ${historyDetail.session.speaker_count} 人`
                  : 'AI 实时转录 + 教练提示'}
              </p>
            </div>
          </div>

          {/* Status + Controls */}
          <div className="flex items-center gap-3">
            {/* Back to live button */}
            {historyDetail && (
              <button
                onClick={handleBackToLive}
                className="px-3 py-1.5 text-xs rounded-md border border-[var(--border-default)] text-[var(--accent-blue)] hover:bg-[var(--btn-blue)]/10 transition-colors"
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
                className="px-3 py-1.5 text-xs rounded-md border border-[var(--accent-orange)] text-[var(--accent-orange)] bg-[var(--accent-orange)]/10 hover:bg-[var(--accent-orange)]/20 transition-colors"
                title="打断 AI 语音回应"
              >
                打断
              </button>
            )}

            {/* Start / Stop */}
            {!isRecording ? (
              <button
                onClick={start}
                disabled={connectionState === 'connecting'}
                className="px-4 py-1.5 text-xs font-medium rounded-md bg-[var(--btn-danger)] text-white hover:bg-[var(--accent-red)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 1.5a5.25 5.25 0 1 0 0 10.5A5.25 5.25 0 0 0 8 1.5ZM8 0a6.75 6.75 0 1 1 0 13.5A6.75 6.75 0 0 1 8 0Zm-.75 4.5a.75.75 0 0 1 1.5 0v3a.75.75 0 0 1-1.5 0v-3ZM8 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
                </svg>
                开始录音
              </button>
            ) : (
              <button
                onClick={stop}
                className="px-4 py-1.5 text-xs font-medium rounded-md border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-red)]/50 transition-colors flex items-center gap-1.5"
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
          <div className="mx-4 mt-3 px-3 py-2 bg-[var(--btn-danger)]/10 border border-[var(--btn-danger)]/30 rounded-md text-xs text-[var(--accent-red)]">
            {error}
          </div>
        )}

        {/* Transcript area */}
        <TranscriptList
          segments={displaySegments}
          partialText={historyDetail ? '' : partialText}
        />
      </div>

      {/* Right: Coach panel */}
      <div className="w-[320px] flex-shrink-0 border-l border-[var(--border-subtle)]">
        <RealtimeCoach
          connected={coachConnected}
          onConnect={() => setCoachConnected(true)}
          onDisconnect={() => setCoachConnected(false)}
        />
      </div>
    </div>
  );
}
