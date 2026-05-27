import { useState, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, isInstructor, isAdmin, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const close = useCallback(() => setSidebarOpen(false), []);

  const baseClass = 'flex items-center gap-3 px-3 py-2 rounded-full text-sm font-medium transition-all duration-200 border border-transparent';

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `${baseClass} ${
      isActive
        ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] border-[var(--border-default)]'
        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
    }`;

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[var(--btn-primary)] flex items-center justify-center flex-shrink-0 shadow-[var(--shadow-btn)]">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-[var(--text-primary)] leading-tight">AI 销售助手</h1>
            <p className="text-[10px] text-[var(--text-placeholder)] leading-tight">陪跑助手 · 知识库</p>
          </div>
        </div>
        <button onClick={close} className="lg:hidden p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          <svg className="w-5 h-5" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="px-3 py-1 text-[11px] font-semibold text-[var(--text-placeholder)] uppercase tracking-wider">
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
        <NavLink to="/products" className={linkClass} onClick={close}>
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1.5 1.75a.75.75 0 0 0-1.5 0v12.5c0 .414.336.75.75.75h14.5a.75.75 0 0 0 0-1.5H1.5V1.75Zm14.28 2.53a.75.75 0 0 0-1.06-1.06L10 7.94 7.53 5.47a.75.75 0 0 0-1.06 0L3.22 8.72a.75.75 0 0 0 1.06 1.06L7 7.06l2.47 2.47a.75.75 0 0 0 1.06 0l5.25-5.25Z"/>
          </svg>
          产品库
        </NavLink>
        <NavLink to="/training" className={linkClass} onClick={close}>
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 16A8 8 0 1 1 8 0a8 8 0 0 1 0 16ZM8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.92 4.5h1.16v3.5H6.92V4.5Zm0 4.5h1.16v1H6.92V9Zm-2.5-4.5a.5.5 0 0 1 .5.5v.5h-.5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5V5a.5.5 0 0 0-.5-.5h-1ZM4.92 5h.5v.5h-.5V5Zm3.5 0h.5v3.5h-.5V5Z"/>
          </svg>
          仿真培训
        </NavLink>
        <NavLink to="/realtime" className={linkClass} onClick={close}>
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM5.5 4.5a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-.5.5.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5Zm3 1.5a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 .5-.5Zm3-1a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.5.5.5.5 0 0 1-.5-.5v-4a.5.5 0 0 1 .5-.5Z" />
          </svg>
          实时语音
        </NavLink>
        <NavLink to="/post-sales" className={linkClass} onClick={close}>
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 2.5A1.5 1.5 0 0 1 1.5 1h11A1.5 1.5 0 0 1 14 2.5v10.528c0 .3-.05.654-.238.972h.004a.75.75 0 0 1-.732.486H1.966a.75.75 0 0 1-.733-.486h-.005A1.87 1.87 0 0 1 1 13V2.5h-.001A1.5 1.5 0 0 1 0 2.5ZM1.966 13h.034ZM3 3.5v7h9v-7H3Zm1.5 1.5h2v2h-2V5Zm3.5 0h2v1.5H8V5Zm0 2.5h2v2H8v-2Zm-3.5 0h2v2h-2v-2Z"/>
          </svg>
          售后分析
        </NavLink>

        <NavLink to="/feedback" className={linkClass} onClick={close}>
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/>
          </svg>
          用户反馈
        </NavLink>

        {isInstructor && (
          <>
            <div className="pt-4 mt-4 border-t border-[var(--border-subtle)]">
              <p className="px-3 py-1 text-[11px] font-semibold text-[var(--text-placeholder)] uppercase tracking-wider">
                讲师
              </p>
            </div>
            <NavLink to="/instructor" className={linkClass} onClick={close}>
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
                <path d="M0 2.5A1.5 1.5 0 0 1 1.5 1h11A1.5 1.5 0 0 1 14 2.5v10.528c0 .3-.05.654-.238.972h.004a.75.75 0 0 1-.732.486H1.966a.75.75 0 0 1-.733-.486h-.005A1.87 1.87 0 0 1 1 13V2.5h-.001A1.5 1.5 0 0 1 0 2.5ZM1.966 13h.034ZM3 3.5v7h9v-7H3Zm1.5 1.5h2v2h-2V5Zm3.5 0h2v1.5H8V5Zm0 2.5h2v2H8v-2Zm-3.5 0h2v2h-2v-2Z"/>
              </svg>
              讲师端口
            </NavLink>
          </>
        )}

        {isAdmin && (
          <>
            <div className="pt-4 mt-4 border-t border-[var(--border-subtle)]">
              <p className="px-3 py-1 text-[11px] font-semibold text-[var(--text-placeholder)] uppercase tracking-wider">
                管理员
              </p>
            </div>
            <NavLink to="/admin/groups" className={linkClass} onClick={close}>
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
                <path d="M7.25 1.75a.75.75 0 0 1 1.5 0v2.5a.75.75 0 0 1-1.5 0v-2.5Zm-5.5 5.5a.75.75 0 0 1 0-1.5h2.5a.75.75 0 0 1 0 1.5h-2.5Zm.97-4.03a.75.75 0 0 1 1.06 0l1.5 1.5a.75.75 0 0 1-1.06 1.06l-1.5-1.5a.75.75 0 0 1 0-1.06Zm9.06 1.06a.75.75 0 0 1 0 1.06l-1.5 1.5a.75.75 0 1 1-1.06-1.06l1.5-1.5a.75.75 0 0 1 1.06 0ZM2.22 13.78a.75.75 0 0 1 0-1.06l1.5-1.5a.75.75 0 0 1 1.06 1.06l-1.5 1.5a.75.75 0 0 1-1.06 0ZM8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm4 2.5h1.25v1.25a.75.75 0 0 0 1.5 0V12H16a.75.75 0 0 0 0-1.5h-1.25V9.25a.75.75 0 0 0-1.5 0v1.25H12a.75.75 0 0 0 0 1.5Z"/>
              </svg>
              分组管理
            </NavLink>
            <NavLink to="/admin/users" className={linkClass} onClick={close}>
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
                <path d="M10.561 8.073a6.005 6.005 0 0 1 3.432 5.142.75.75 0 1 1-1.498.07 4.5 4.5 0 0 0-8.99 0 .75.75 0 0 1-1.498-.07 6.004 6.004 0 0 1 3.431-5.142 3.999 3.999 0 1 1 5.123 0ZM10.5 5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"/>
              </svg>
              用户管理
            </NavLink>
            <NavLink to="/admin/feedback" className={linkClass} onClick={close}>
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/>
              </svg>
              反馈总览
            </NavLink>
          </>
        )}

      </nav>

      {/* Footer with user info */}
      <div className="px-4 py-3 border-t border-[var(--border-subtle)] space-y-2">
        <div className="segmented-control w-full">
          <button
            className={`flex-1 ${theme === 'dark' ? 'active' : ''}`}
            onClick={() => { if (theme !== 'dark') toggleTheme(); }}
            title="深色模式"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          </button>
          <button
            className={`flex-1 ${theme === 'light' ? 'active' : ''}`}
            onClick={() => { if (theme !== 'light') toggleTheme(); }}
            title="浅色模式"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5"/>
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
            </svg>
          </button>
        </div>
        {user && (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[var(--btn-blue)] flex items-center justify-center text-xs font-semibold text-white flex-shrink-0 ring-2 ring-[var(--border-default)]">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-[var(--text-primary)] font-medium truncate">{user.username}</div>
              <div className="text-[10px] text-[var(--text-secondary)]">
                {user.role === 'admin' ? '管理员' : user.role === 'instructor' ? '讲师' : '销售'}
              </div>
            </div>
            <button
              onClick={() => { logout(); navigate('/login'); }}
              className="p-1.5 text-[var(--text-placeholder)] hover:text-[var(--accent-red)] transition-colors rounded-full hover:bg-[var(--bg-tertiary)]"
              title="退出登录"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                <path d="M6.75 2.75a.75.75 0 0 0 0-1.5h-3A1.75 1.75 0 0 0 2 3v10c0 .966.784 1.75 1.75 1.75h3a.75.75 0 0 0 0-1.5h-3a.25.25 0 0 1-.25-.25V3a.25.25 0 0 1 .25-.25h3Zm4.47.22a.75.75 0 0 1 1.06 0l4.5 4.5a.75.75 0 0 1 0 1.06l-4.5 4.5a.75.75 0 0 1-1.06-1.06L14.44 8 11.22 4.78a.75.75 0 0 1 0-1.06Z"/>
              </svg>
            </button>
          </div>
        )}
        <div className="flex items-center justify-between text-[11px] text-[var(--text-placeholder)]">
          <span>v0.1.0 · 文字版</span>
          <span className="font-mono text-[10px] text-[var(--accent-green)]">● online</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/60" onClick={close} />
      )}

      {/* Sidebar — off-canvas on mobile, static on desktop */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-[260px] flex-shrink-0
        bg-[var(--bg-primary)]
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {sidebarContent}
      </aside>

      {/* Mobile header bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 h-12 bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] flex items-center px-3 gap-3">
        <button onClick={() => setSidebarOpen(true)} className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          <svg className="w-5 h-5" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 2.75A.75.75 0 0 1 1.75 2h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 2.75Zm0 5A.75.75 0 0 1 1.75 7h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 7.75ZM1.75 12a.75.75 0 0 0 0 1.5h12.5a.75.75 0 0 0 0-1.5H1.75Z"/>
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-[var(--btn-primary)] flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-[var(--text-primary)]">AI 销售助手</span>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto bg-[var(--bg-primary)] lg:pt-0 pt-12">
        {children}
      </main>
    </div>
  );
}
