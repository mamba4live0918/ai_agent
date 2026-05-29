import { useEffect, useState, useCallback } from 'react';
import { getCustomers, deleteCustomer, getCustomer, generatePresalesPrep } from '../services/api';
import type { Customer } from '../types';
import CustomerForm from '../components/CustomerForm';
import CustomerProfile from '../components/CustomerProfile';
import SearchBar from '../components/SearchBar';

export default function CustomerAnalysis() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [jumpPage, setJumpPage] = useState('');

  const loadData = useCallback(async () => {
    const res = await getCustomers(search || undefined, page);
    setCustomers(res.items);
    setTotalPages(res.total_pages);
    // If current page is beyond total, go to last page
    if (page > res.total_pages && res.total_pages > 0) {
      setPage(res.total_pages);
    }
  }, [search, page]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSearch = (q: string) => {
    setSearch(q);
    setPage(1);
  };

  const handlePageChange = (p: number) => {
    if (p < 1 || p > totalPages) return;
    setSelectedId(null);
    setSelectedCustomer(null);
    setPage(p);
  };

  const handleJumpPage = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && jumpPage.trim()) {
      const n = parseInt(jumpPage, 10);
      if (!isNaN(n)) handlePageChange(n);
      setJumpPage('');
    }
  };

  const handleSelect = async (id: string) => {
    if (selectedId === id) {
      setSelectedId(null);
      setSelectedCustomer(null);
      return;
    }
    setSelectedId(id);
    const cust = await getCustomer(id);
    setSelectedCustomer(cust);
  };

  const handleDelete = async (id: string) => {
    if (id === selectedId) { setSelectedId(null); setSelectedCustomer(null); }
    await deleteCustomer(id);
    loadData();
  };

  const handlePresalesPrep = async () => {
    if (!selectedId) return;
    const updated = await generatePresalesPrep(selectedId);
    setSelectedCustomer(updated);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between mb-6 animate-in" style={{ animationDelay: '0ms' }}>
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">客户分析</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">导入客户信息，AI 深度生成客户画像与分析建议</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z"/>
          </svg>
          {showForm ? '关闭' : '新增客户'}
        </button>
      </div>

      {showForm && (
        <div className="card p-6 mb-6 animate-in" style={{ animationDelay: '50ms' }}>
          <CustomerForm onCreated={() => { loadData(); setShowForm(false); }} />
        </div>
      )}

      <div className="grid grid-cols-12 gap-5">
        {/* Customer list — full width */}
        <div className="col-span-12 space-y-3 animate-in" style={{ animationDelay: '100ms' }}>
          <SearchBar value={search} onChange={handleSearch} placeholder="搜索客户姓名或标签..." />
          <div className="space-y-1.5">
            {customers.length === 0 && (
              <div className="card p-8 text-center">
                <svg className="w-10 h-10 text-[var(--text-placeholder)] mx-auto mb-3" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M10.561 8.073a6.005 6.005 0 0 1 3.432 5.07.75.75 0 0 1-1.497.108 4.505 4.505 0 0 0-8.992 0 .75.75 0 0 1-1.497-.108 6.004 6.004 0 0 1 3.431-5.07 4 4 0 1 1 5.123 0ZM12 4.5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"/>
                </svg>
                <p className="text-sm text-[var(--text-placeholder)]">暂无客户数据</p>
                <p className="text-xs text-[var(--border-default)] mt-1">点击右上角"新增客户"开始</p>
              </div>
            )}
            {customers.map(cust => (
              <div
                key={cust.id}
                onClick={() => handleSelect(cust.id)}
                className={`card card-hover p-4 cursor-pointer transition-all duration-200 ${
                  selectedId === cust.id
                    ? 'shadow-[var(--shadow-card-hover)] ring-1 ring-inset ring-[var(--accent-blue)] bg-[var(--bg-overlay)]'
                    : ''
                }`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-medium text-[var(--text-secondary)]">
                        {cust.name.charAt(0)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-[var(--text-primary)] truncate">{cust.name}</h4>
                      <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                        {new Date(cust.updated_at).toLocaleDateString('zh-CN')}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(cust.id); }}
                    className="btn btn-danger text-xs px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ opacity: selectedId === cust.id ? 1 : undefined }}
                  >
                    删除
                  </button>
                </div>
                {cust.raw_input && (
                  <p className="text-xs text-[var(--text-placeholder)] mt-2.5 truncate font-mono">
                    {cust.raw_input.slice(0, 80)}{cust.raw_input.length > 80 ? '...' : ''}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1 pt-1 flex-wrap">
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1}
                className="px-2 py-1 text-xs rounded-full border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
              >
                &laquo;
              </button>
              {(() => {
                const pages: (number | string)[] = [];
                const delta = 1;
                for (let i = 1; i <= totalPages; i++) {
                  if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
                    pages.push(i);
                  } else if (pages[pages.length - 1] !== '...') {
                    pages.push('...');
                  }
                }
                return pages.map((p, idx) =>
                  typeof p === 'number' ? (
                    <button
                      key={p}
                      onClick={() => handlePageChange(p)}
                      className={`w-7 h-7 text-xs rounded-full transition-all duration-200 ${
                        p === page
                          ? 'bg-[var(--btn-blue)] text-white shadow-[var(--shadow-btn)]'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                      }`}
                    >
                      {p}
                    </button>
                  ) : (
                    <span key={`dots-${idx}`} className="px-0.5 text-[10px] text-[var(--text-placeholder)] select-none">&hellip;</span>
                  )
                );
              })()}
              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages}
                className="px-2 py-1 text-xs rounded-full border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
              >
                &raquo;
              </button>
              <span className="text-[10px] text-[var(--text-placeholder)] ml-2">
                {page}/{totalPages} 页
              </span>
              <input
                type="text"
                value={jumpPage}
                onChange={e => setJumpPage(e.target.value.replace(/\D/g, ''))}
                onKeyDown={handleJumpPage}
                placeholder="跳转"
                className="hidden sm:block ml-1 w-12 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-1.5 py-0.5 text-[11px] text-[var(--text-primary)] placeholder-[var(--text-placeholder)] focus:border-[var(--accent-blue)] outline-none transition-all duration-200"
              />
            </div>
          )}
        </div>
      </div>

      {/* Customer detail floating panel */}
      {selectedCustomer && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" onClick={() => { setSelectedId(null); setSelectedCustomer(null); }} />
          <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none p-4">
            <div className="pointer-events-auto w-full max-w-3xl max-h-[90vh] bg-[var(--bg-secondary)] rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.16)] border border-[var(--border-subtle)] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-subtle)] flex-shrink-0 bg-[var(--bg-secondary)]">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">{selectedCustomer.name} · 客户画像</h3>
                <button
                  onClick={() => { setSelectedId(null); setSelectedCustomer(null); }}
                  className="w-7 h-7 flex items-center justify-center rounded-full text-[var(--text-placeholder)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/></svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                <CustomerProfile customer={selectedCustomer} onPresalesPrep={handlePresalesPrep} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
