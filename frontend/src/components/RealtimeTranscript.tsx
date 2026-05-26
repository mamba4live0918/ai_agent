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
  idle: '#484f58',
  connecting: '#d29922',
  streaming: '#3fb950',
  disconnected: '#f85149',
};

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
    <div className="fixed bottom-4 right-4 z-50 w-[380px] max-w-[calc(100vw-2rem)] bg-[#161b22] border border-[#30363d] rounded-lg shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#21262d] bg-[#0d1117] flex-shrink-0">
        <div className="flex items-center gap-2">
          {/* Recording indicator */}
          {isRecording && (
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#f85149] opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#f85149]" />
            </span>
          )}
          <span className="text-xs font-semibold text-[#e6edf3]">
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
            className="text-[#8b949e] hover:text-[#e6edf3] text-sm leading-none px-1 transition-colors"
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
            className="flex-1 min-h-[120px] max-h-[280px] overflow-y-auto px-3 py-2 space-y-1.5 bg-[#0d1117]"
          >
            {error && (
              <div className="text-[11px] text-[#f85149] bg-[#2a1f1f] border border-[#f85149]/30 rounded px-2 py-1.5">
                {error}
              </div>
            )}

            {!hasContent && !error && (
              <div className="text-[11px] text-[#484f58] text-center py-6">
                {isRecording
                  ? '等待语音输入...'
                  : '点击下方按钮开始实时语音转录'}
              </div>
            )}

            {/* Completed segments */}
            {segments.map((seg, i) => (
              <p
                key={`${seg.start}-${i}`}
                className="text-[12px] text-[#e6edf3] leading-relaxed"
              >
                {seg.text}
              </p>
            ))}

            {/* Partial text */}
            {partialText && (
              <p className="text-[12px] text-[#8b949e] italic leading-relaxed">
                {partialText}
              </p>
            )}

            {/* Invisible spacer so last line is never clipped */}
            <div className="h-1" />
          </div>

          {/* Bottom bar */}
          <div className="px-3 py-2 border-t border-[#21262d] bg-[#0d1117] flex items-center gap-2 flex-shrink-0">
            {isRecording ? (
              <button
                onClick={onStop}
                className="flex-1 px-3 py-1.5 bg-[#2a1f1f] border border-[#f85149] rounded-md text-[#f85149] text-[11px] font-medium hover:bg-[#3a2222] transition-colors"
              >
                停止录制
              </button>
            ) : (
              <button
                onClick={onStart}
                disabled={connectionState === 'connecting'}
                className="flex-1 px-3 py-1.5 bg-[#238636] border border-[#2ea043] rounded-md text-white text-[11px] font-medium hover:bg-[#2ea043] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {connectionState === 'connecting' ? '连接中...' : '开始录制'}
              </button>
            )}

            {/* Segment counter */}
            {segments.length > 0 && (
              <span className="text-[10px] text-[#484f58] flex-shrink-0">
                {segments.length} 段
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
