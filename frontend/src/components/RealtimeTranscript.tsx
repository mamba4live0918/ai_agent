import { useState, useRef, useEffect } from 'react';
import type { TranscriptSegment, ConnectionState } from '../hooks/useRealtimeASR';

interface RealtimeTranscriptProps {
  segments: TranscriptSegment[];
  partialText: string;
  isRecording: boolean;
  connectionState: ConnectionState;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
}

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

// Distinct colors for speaker roles to make conversation flow easy to follow
const SPEAKER_COLORS: Record<string, string> = {
  '销售': 'var(--accent-green)',
  '客户': 'var(--accent-blue)',
  '其他': 'var(--accent-purple)',
};

function getSpeakerColor(speakerName: string): string {
  return SPEAKER_COLORS[speakerName] || 'var(--text-secondary)';
}

function getSpeakerLabel(seg: TranscriptSegment): string {
  if (seg.speaker_name && seg.speaker_name !== seg.speaker) {
    return seg.speaker_name;
  }
  return seg.speaker.replace('speaker_', '说话人');
}

export default function RealtimeTranscript({
  segments,
  partialText,
  isRecording,
  connectionState,
  error,
  onStart,
  onStop,
}: RealtimeTranscriptProps) {
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [segments, partialText]);

  const hasContent = segments.length > 0 || partialText.length > 0;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[380px] max-w-[calc(100vw-2rem)] bg-[var(--bg-secondary)] rounded-xl shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)] flex-shrink-0">
        <div className="flex items-center gap-2">
          {/* Recording indicator */}
          {isRecording && (
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-red)] opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--accent-red)]" />
            </span>
          )}
          <span className="text-xs font-semibold text-[var(--text-primary)]">
            实验：实时语音
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Connection status */}
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full border"
            style={{
              color: STATUS_COLORS[connectionState],
              borderColor: STATUS_COLORS[connectionState],
            }}
          >
            {STATUS_LABELS[connectionState]}
          </span>

          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm leading-none px-1 transition-colors"
            title={collapsed ? '展开' : '收起'}
          >
            {collapsed ? '▸' : '▾'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Transcript area */}
          <div
            ref={scrollRef}
            className="flex-1 min-h-[120px] max-h-[280px] overflow-y-auto px-3 py-2 space-y-1.5 bg-[var(--bg-primary)]"
          >
            {error && (
              <div className="text-[11px] text-[var(--accent-red)] bg-[var(--color-danger-hover-bg)] border border-[var(--accent-red)] rounded-xl px-2 py-1.5">
                {error}
              </div>
            )}

            {!hasContent && !error && (
              <div className="text-[11px] text-[var(--text-placeholder)] text-center py-6">
                {isRecording
                  ? '等待语音输入...'
                  : '点击下方按钮开始实时语音转录'}
              </div>
            )}

            {/* Completed segments */}
            {segments.map((seg, i) => (
              <p
                key={`${seg.start}-${i}`}
                className="text-[12px] text-[var(--text-primary)] leading-relaxed"
              >
                {seg.speaker && (
                  <span
                    className="font-medium mr-1"
                    style={{ color: getSpeakerColor(seg.speaker_name || seg.speaker) }}
                  >
                    [{getSpeakerLabel(seg)}]
                  </span>
                )}
                {seg.text}
              </p>
            ))}

            {/* Partial text */}
            {partialText && (
              <p className="text-[12px] text-[var(--text-secondary)] italic leading-relaxed">
                {partialText}
              </p>
            )}

            {/* Invisible spacer so last line is never clipped */}
            <div className="h-1" />
          </div>

          {/* Bottom bar */}
          <div className="px-3 py-2 border-t border-[var(--border-subtle)] bg-[var(--bg-primary)] flex items-center gap-2 flex-shrink-0">
            {isRecording ? (
              <button
                onClick={onStop}
                className="flex-1 px-3 py-1.5 bg-[var(--color-danger-hover-bg)] border border-[var(--accent-red)] rounded-full text-[var(--accent-red)] text-[11px] font-medium hover:bg-[var(--color-danger-hover-bg)] transition-all duration-200"
              >
                停止录制
              </button>
            ) : (
              <button
                onClick={onStart}
                disabled={connectionState === 'connecting'}
                className="flex-1 px-3 py-1.5 bg-[var(--btn-primary)] rounded-full text-white text-[11px] font-medium hover:bg-[var(--btn-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {connectionState === 'connecting' ? '连接中...' : '开始录制'}
              </button>
            )}

            {/* Segment counter */}
            {segments.length > 0 && (
              <span className="text-[10px] text-[var(--text-placeholder)] flex-shrink-0">
                {segments.length} 段
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
