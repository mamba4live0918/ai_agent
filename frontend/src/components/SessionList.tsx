import type { TrainingSession } from '../types';

interface Props {
  sessions: TrainingSession[];
  selectedId?: string | null;
  onSelect: (s: TrainingSession) => void;
  onDelete: (id: string) => void;
  onNewPersona: () => void;
}

export default function SessionList({ sessions, selectedId, onSelect, onDelete, onNewPersona }: Props) {
  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      <div className="px-3 py-2.5 text-[10px] font-semibold text-[#6e7681] uppercase tracking-wider border-b border-[#21262d]">
        训练记录
      </div>
      <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
        {sessions.map(s => (
          <div
            key={s.id}
            onClick={() => onSelect(s)}
            className={`group relative rounded-md border p-2.5 cursor-pointer transition-colors ${
              selectedId === s.id
                ? 'border-[#58a6ff] bg-[#1c2128]'
                : s.status === 'pending' || s.status === 'active'
                  ? 'border-[#d29922]/60 bg-[#1c2128]/50 hover:bg-[#1c2128]'
                  : 'border-transparent bg-[#0d1117] hover:bg-[#161b22]'
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: s.status === 'completed' ? '#3fb950' : '#d29922' }}
              />
              <span className="text-xs text-[#e6edf3] font-medium truncate">
                {s.persona?.name || '未知'} · {s.scenario}
              </span>
            </div>
            <div className="text-[10px] mt-1.5 ml-[14px]" style={{ color: s.status === 'completed' ? '#3fb950' : '#d29922' }}>
              {s.status === 'completed'
                ? `✓ 已完成${s.has_review ? ' · 📊 复盘' : ''}`
                : s.status === 'active'
                  ? '⏳ 进行中 — 点击继续'
                  : '⏳ 未开始 — 点击开始'}
            </div>
            <div className="text-[9px] text-[#484f58] mt-1 ml-[14px]">{formatTime(s.started_at)}</div>
            <button
              onClick={e => { e.stopPropagation(); onDelete(s.id); }}
              className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 text-[#484f58] hover:text-[#f85149] text-xs transition-opacity"
              title="删除"
            >
              ✕
            </button>
          </div>
        ))}
        {sessions.length === 0 && (
          <div className="text-center py-6">
            <p className="text-[11px] text-[#484f58]">暂无训练记录</p>
          </div>
        )}
      </div>
      <div className="p-2 border-t border-[#21262d]">
        <button
          onClick={onNewPersona}
          className="w-full bg-[#21262d] border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] rounded-md py-1.5 text-[10px] transition-colors"
        >
          + 手动创建数字人
        </button>
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return '刚刚';
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return d.toLocaleDateString('zh-CN');
}
