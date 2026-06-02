import React from 'react';

export interface ChatBubbleProps {
  text: string;
  timestamp: number;    // seconds offset in recording
  speaker: string;      // "销售" | "客户" | other
  isSelf: boolean;      // true = right-aligned blue, false = left-aligned gray
  confidence?: number;  // ASR confidence 0-1
}

/** Format seconds to MM:SS */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function ChatBubble({ text, timestamp, speaker, isSelf, confidence }: ChatBubbleProps) {
  return (
    <div className={`flex ${isSelf ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] ${isSelf ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
        {/* Speaker label */}
        <span className={`text-[10px] font-medium px-1 ${
          isSelf ? 'text-[var(--accent-blue)] self-end' : 'text-[var(--accent-green)] self-start'
        }`}>
          {speaker}
          {confidence != null && confidence < 0.7 && (
            <span className="ml-1 text-[var(--text-placeholder)]" title="低置信度">~</span>
          )}
        </span>

        {/* Bubble body */}
        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          isSelf
            ? 'bg-[var(--btn-blue)] text-white rounded-br-md'
            : 'bg-[var(--bg-primary)] text-[var(--text-primary)] rounded-bl-md border border-[var(--border-subtle)]'
        }`}>
          {text}
        </div>

        {/* Timestamp */}
        <span className={`text-[10px] text-[var(--text-placeholder)] px-1 ${isSelf ? 'self-end' : 'self-start'}`}>
          {formatTime(timestamp)}
        </span>
      </div>
    </div>
  );
}
