import type { ConnectionState } from '../hooks/useRealtimeASR';

interface RecordingBarProps {
  isRecording: boolean;
  connectionState: ConnectionState;
  elapsed: number;
  onStart: () => void;
  onStop: () => void;
}

const STATUS_LABELS: Record<ConnectionState, string> = {
  idle: '就绪',
  connecting: '连接中...',
  streaming: '录制中',
  disconnected: '已断开',
};

const STATUS_DOT: Record<ConnectionState, string> = {
  idle: 'var(--text-placeholder)',
  connecting: 'var(--accent-orange)',
  streaming: 'var(--accent-green)',
  disconnected: 'var(--accent-red)',
};

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function RecordingBar({ isRecording, connectionState, elapsed, onStart, onStop }: RecordingBarProps) {
  return (
    <div className="px-4 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-primary)] flex items-center justify-center gap-4 flex-shrink-0">
      <div className="flex items-center gap-2">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: STATUS_DOT[connectionState] }}
        />
        <span className="text-[10px] text-[var(--text-secondary)] hidden sm:inline">
          {STATUS_LABELS[connectionState]}
        </span>
      </div>

      {!isRecording ? (
        <button
          onClick={onStart}
          disabled={connectionState === 'connecting'}
          className="px-6 py-2.5 text-sm font-medium rounded-full bg-[var(--btn-danger)] text-white
            hover:bg-[var(--accent-red)] disabled:opacity-50 disabled:cursor-not-allowed
            transition-all duration-200 flex items-center gap-2
            shadow-lg shadow-[var(--btn-danger)]/20 active:scale-95"
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1.5a5.25 5.25 0 1 0 0 10.5A5.25 5.25 0 0 0 8 1.5ZM8 0a6.75 6.75 0 1 1 0 13.5A6.75 6.75 0 0 1 8 0Zm-.75 4.5a.75.75 0 0 1 1.5 0v3a.75.75 0 0 1-1.5 0v-3ZM8 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
          </svg>
          开始录音
        </button>
      ) : (
        <>
          <span className="text-sm text-[var(--text-primary)] font-mono tabular-nums font-medium">
            {formatTimer(elapsed)}
          </span>
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-red)] opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--accent-red)]" />
          </span>
          <button
            onClick={onStop}
            className="px-6 py-2.5 text-sm font-medium rounded-full border-2 border-[var(--border-default)]
              text-[var(--text-primary)] hover:border-[var(--accent-red)]/50 hover:text-[var(--accent-red)]
              transition-all duration-200 flex items-center gap-2 active:scale-95"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
              <rect x="4.5" y="3" width="7" height="10" rx="1.5" />
            </svg>
            停止录音
          </button>
        </>
      )}
    </div>
  );
}
