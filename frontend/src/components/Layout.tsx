import { useState, useCallback } from 'react';
import { NavLink } from 'react-router-dom';

export default function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const close = useCallback(() => setSidebarOpen(false), []);

  const baseClass = 'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-100 border border-transparent';

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `${baseClass} ${
      isActive
        ? 'bg-[#1f2937] text-[#e6edf3] border-[#30363d]'
        : 'text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22]'
    }`;

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-4 border-b border-[#21262d] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#238636] flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-[#e6edf3] leading-tight">AI 销售助手</h1>
            <p className="text-[10px] text-[#484f58] leading-tight">陪跑助手 · 知识库</p>
          </div>
        </div>
        <button onClick={close} className="lg:hidden p-1 text-[#8b949e] hover:text-[#e6edf3]">
          <svg className="w-5 h-5" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="px-3 py-1 text-[11px] font-semibold text-[#484f58] uppercase tracking-wider">
          导航
        </p>
        <NavLink to="/" className={linkClass} end onClick={close}>
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6.906.664a1.75 1.75 0 0 1 2.187 0l5.25 4.2c.415.332.657.836.657 1.368V14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V6.232c0-.532.242-1.036.657-1.368l5.25-4.2Zm1.25.874a.25.25 0 0 0-.312 0l-5.25 4.2a.25.25 0 0 0-.094.196V14a.5.5 0 0 0 .5.5H5v-4.25c0-.69.56-1.25 1.25-1.25h3.5c.69 0 1.25.56 1.25 1.25v4.25h2.5a.5.5 0 0 0 .5-.5V5.934a.25.25 0 0 0-.094-.196Z"/>
          </svg>
          首页
        </NavLink>
        <NavLink to="/knowledge" className={linkClass} onClick={close}>
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v3.5A1.75 1.75 0 0 1 14.25 7H8.828l-3.063 2.757A.75.75 0 0 1 4.5 9.25V7h-.25A1.75 1.75 0 0 1 2.5 5.25v-3.5Zm.75 0v3.5c0 .138.112.25.25.25H5v.25c0 .124.06.24.157.31L7.22 7.5H14.25a.25.25 0 0 0 .25-.25v-3.5a.25.25 0 0 0-.25-.25H1.75a.25.25 0 0 0-.25.25Z"/>
          </svg>
          知识库
        </NavLink>
        <NavLink to="/customers" className={linkClass} onClick={close}>
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 2.5A1.5 1.5 0 0 1 3.5 1h2.586a1.5 1.5 0 0 1 1.06.44l1.415 1.414a1.5 1.5 0 0 0 1.06.44h2.879A1.5 1.5 0 0 1 14 4.793V13.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13.5Z"/>
          </svg>
          客户分析
        </NavLink>

        <div className="pt-4 mt-4 border-t border-[#21262d]">
          <p className="px-3 py-1 text-[11px] font-semibold text-[#484f58] uppercase tracking-wider">
            状态
          </p>
        </div>
        <div className="px-3 py-2 flex items-center gap-2 text-xs text-[#8b949e]">
          <span className="w-2 h-2 rounded-full bg-[#3fb950] flex-shrink-0" />
          Ollama · DeepSeek
        </div>
        <div className="px-3 py-1 flex items-center gap-2 text-xs text-[#8b949e]">
          <span className="w-2 h-2 rounded-full bg-[#d29922] flex-shrink-0" />
          PostgreSQL · ChromaDB
        </div>
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[#21262d]">
        <div className="flex items-center justify-between text-[11px] text-[#484f58]">
          <span>v0.1.0 · 文字版</span>
          <span className="font-mono text-[10px] text-[#3fb950]">● online</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/60" onClick={close} />
      )}

      {/* Sidebar — off-canvas on mobile, static on desktop */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-[260px] flex-shrink-0
        bg-[#0d1117] border-r border-[#21262d]
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {sidebarContent}
      </aside>

      {/* Mobile header bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 h-12 bg-[#161b22] border-b border-[#21262d] flex items-center px-3 gap-3">
        <button onClick={() => setSidebarOpen(true)} className="p-1 text-[#8b949e] hover:text-[#e6edf3]">
          <svg className="w-5 h-5" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 2.75A.75.75 0 0 1 1.75 2h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 2.75Zm0 5A.75.75 0 0 1 1.75 7h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 7.75ZM1.75 12a.75.75 0 0 0 0 1.5h12.5a.75.75 0 0 0 0-1.5H1.75Z"/>
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-[#238636] flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-[#e6edf3]">AI 销售助手</span>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto bg-[#0d1117] lg:pt-0 pt-12">
        {children}
      </main>
    </div>
  );
}
