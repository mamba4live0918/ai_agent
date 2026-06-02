import { useTauri } from '../hooks/useTauri';

export default function TauriTitlebar() {
  const tauri = useTauri();
  if (!tauri.isTauri) return null;

  return (
    <div
      data-tauri-drag-region
      className="sticky top-0 z-50 flex items-center justify-between h-10 bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] select-none flex-shrink-0 cursor-grab"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center gap-2 px-3">
        <div className="w-3 h-3 rounded-sm bg-[var(--accent-green)]" />
        <span className="text-[11px] font-semibold text-[var(--text-primary)]">SalesMate</span>
        <span className="text-[9px] text-[var(--text-placeholder)] ml-1">Docker · DeepSeek</span>
      </div>
      <div className="flex h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={tauri.minimize}
          className="w-11 h-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer rounded-full"
          title="最小化"
        >
          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
            <rect x="3" y="7.5" width="10" height="1.5" rx="0.5" />
          </svg>
        </button>
        <button
          onClick={tauri.toggleMaximize}
          className="w-11 h-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors rounded-full"
          title="最大化"
        >
          {tauri.isMaximized ? (
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
              <rect x="2.5" y="4.5" width="8" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <rect x="5.5" y="2.5" width="8" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          ) : (
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
              <rect x="3" y="3" width="10" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          )}
        </button>
        <button
          onClick={tauri.close}
          className="w-11 h-full flex items-center justify-center text-[var(--text-secondary)] hover:text-white hover:bg-[var(--accent-red)] transition-colors rounded-full"
          title="关闭"
        >
          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.28 3.22a.75.75 0 0 0-1.06 1.06L6.94 8l-3.72 3.72a.75.75 0 1 0 1.06 1.06L8 9.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L9.06 8l3.72-3.72a.75.75 0 0 0-1.06-1.06L8 6.94 4.28 3.22Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
