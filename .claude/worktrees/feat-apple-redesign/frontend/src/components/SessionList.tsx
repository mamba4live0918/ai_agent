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
    <div className="flex flex-col h-full bg-[var(--bg-primary)]">
      <div className="px-3 py-2.5 text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider border-b border-[var(--border-subtle)]">
        训练记录
      </div>
      <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
        {sessions.map(s => (
          <div
            key={s.id}
            onClick={() => onSelect(s)}
            className={`group relative rounded-xl border p-2.5 cursor-pointer transition-colors ${
              selectedId === s.id
                ? 'border-[var(--accent-blue)] bg-[var(--bg-overlay)]'
                : s.status === 'pending' || s.status === 'active'
                  ? 'border-[var(--accent-orange)]/60 bg-[var(--bg-overlay)]/50 hover:bg-[var(--bg-overlay)]'
                  : 'border-transparent bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)]'
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: s.status === 'completed' ? 'var(--accent-green)' : 'var(--accent-orange)' }}
              />
              <span className="text-xs text-[var(--text-primary)] font-medium truncate">
                {s.persona?.name || '未知'} · {s.scenario}
              </span>
            </div>
            <div className="text-[10px] mt-1.5 ml-[14px]" style={{ color: s.status === 'completed' ? 'var(--accent-green)' : 'var(--accent-orange)' }}>
              {s.status === 'completed'
                ? `✓ 已完成${s.has_review ? ' · 📊 复盘' : ''}`
                : s.status === 'active'
                  ? '⏳ 进行中 — 点击继续'
                  : '⏳ 未开始 — 点击开始'}
            </div>
            <div className="text-[9px] text-[var(--text-placeholder)] mt-1 ml-[14px]">{formatTime(s.started_at)}</div>
            <button
              onClick={e => { e.stopPropagation(); onDelete(s.id); }}
              className="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 text-[var(--text-placeholder)] hover:text-[var(--accent-red)] text-xs transition-opacity"
              title="删除"
            >
              ✕
            </button>
          </div>
        ))}
        {sessions.length === 0 && (
          <div className="text-center py-6">
            <p className="text-[11px] text-[var(--text-placeholder)]">暂无训练记录</p>
          </div>
        )}
      </div>
      <div className="p-2 border-t border-[var(--border-subtle)]">
        <button
          onClick={onNewPersona}
          className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-full py-1.5 text-[10px] transition-colors"
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
