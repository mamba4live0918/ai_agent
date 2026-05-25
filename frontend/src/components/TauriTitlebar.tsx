import { useTauri } from '../hooks/useTauri';

export default function TauriTitlebar() {
  const tauri = useTauri();
  if (!tauri.isTauri) return null;

  return (
    <div
      data-tauri-drag-region
      className="sticky top-0 z-50 flex items-center justify-between h-9 bg-[#0d1117] border-b border-[#21262d] select-none flex-shrink-0"
    >
      <div className="flex items-center gap-2 px-3">
        <div className="w-3 h-3 rounded-sm bg-[#3fb950]" />
        <span className="text-[11px] font-semibold text-[#e6edf3]">SalesMate</span>
        <span className="text-[9px] text-[#484f58] ml-1">Docker · DeepSeek</span>
      </div>
      <div className="flex h-full">
        <button
          onClick={tauri.minimize}
          className="w-11 h-full flex items-center justify-center text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors"
          title="最小化"
        >
          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
            <rect x="3" y="7.5" width="10" height="1.5" rx="0.5" />
          </svg>
        </button>
        <button
          onClick={tauri.toggleMaximize}
          className="w-11 h-full flex items-center justify-center text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors"
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
          className="w-11 h-full flex items-center justify-center text-[#8b949e] hover:text-white hover:bg-[#f85149] transition-colors"
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
