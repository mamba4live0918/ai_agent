import { NavLink } from 'react-router-dom';

export default function Layout({ children }: { children: React.ReactNode }) {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `block px-4 py-2 rounded-lg transition-colors ${
      isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
    }`;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-lg font-bold text-white">AI 销售助手</h1>
          <p className="text-xs text-gray-500 mt-1">陪跑助手 · 知识库</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          <NavLink to="/" className={linkClass} end>首页</NavLink>
          <NavLink to="/knowledge" className={linkClass}>知识库</NavLink>
          <NavLink to="/customers" className={linkClass}>客户分析</NavLink>
        </nav>
        <div className="p-3 border-t border-gray-800 text-xs text-gray-600">
          v0.1.0 · 文字版
        </div>
      </aside>
      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
