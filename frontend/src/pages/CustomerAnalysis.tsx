import { useEffect, useState, useCallback } from 'react';
import { getCustomers, deleteCustomer, getCustomer } from '../services/api';
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

  const loadData = useCallback(async () => {
    const res = await getCustomers(search || undefined);
    setCustomers(res.items);
  }, [search]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSelect = async (id: string) => {
    setSelectedId(id);
    const cust = await getCustomer(id);
    setSelectedCustomer(cust);
  };

  const handleDelete = async (id: string) => {
    if (id === selectedId) { setSelectedId(null); setSelectedCustomer(null); }
    await deleteCustomer(id);
    loadData();
  };

  return (
    <div className="max-w-7xl mx-auto px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 animate-in" style={{ animationDelay: '0ms' }}>
        <div>
          <h2 className="text-xl font-bold text-[#e6edf3]">客户分析</h2>
          <p className="text-sm text-[#8b949e] mt-1">导入客户信息，AI 深度生成客户画像与分析建议</p>
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
        {/* Customer list */}
        <div className="col-span-5 space-y-3 animate-in" style={{ animationDelay: '100ms' }}>
          <SearchBar value={search} onChange={setSearch} placeholder="搜索客户姓名或标签..." />
          <div className="space-y-1.5">
            {customers.length === 0 && (
              <div className="card p-8 text-center">
                <svg className="w-10 h-10 text-[#21262d] mx-auto mb-3" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M10.561 8.073a6.005 6.005 0 0 1 3.432 5.07.75.75 0 0 1-1.497.108 4.505 4.505 0 0 0-8.992 0 .75.75 0 0 1-1.497-.108 6.004 6.004 0 0 1 3.431-5.07 4 4 0 1 1 5.123 0ZM12 4.5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"/>
                </svg>
                <p className="text-sm text-[#484f58]">暂无客户数据</p>
                <p className="text-xs text-[#30363d] mt-1">点击右上角"新增客户"开始</p>
              </div>
            )}
            {customers.map(cust => (
              <div key={cust.id}
                onClick={() => handleSelect(cust.id)}
                className={`card card-hover p-4 cursor-pointer transition-all duration-100 ${
                  selectedId === cust.id
                    ? 'border-[#58a6ff] shadow-[0_0_0_1px_#58a6ff] bg-[#1c2128]'
                    : ''
                }`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[#21262d] border border-[#30363d] flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-medium text-[#8b949e]">
                        {cust.name.charAt(0)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-[#e6edf3] truncate">{cust.name}</h4>
                      <p className="text-[11px] text-[#6e7681] mt-0.5">
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
                  <p className="text-xs text-[#484f58] mt-2.5 truncate font-mono">
                    {cust.raw_input.slice(0, 80)}{cust.raw_input.length > 80 ? '...' : ''}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Detail panel */}
        <div className="col-span-7 animate-in" style={{ animationDelay: '150ms' }}>
          {selectedCustomer ? (
            <div className="card p-6">
              <CustomerProfile customer={selectedCustomer} />
              {selectedCustomer.raw_input && (
                <>
                  <div className="hr" />
                  <div>
                    <h4 className="text-[11px] font-semibold text-[#6e7681] uppercase tracking-wider mb-2">原始输入</h4>
                    <pre className="text-xs text-[#8b949e] font-mono whitespace-pre-wrap bg-[#0d1117] rounded-md p-3 border border-[#21262d] max-h-32 overflow-y-auto">
                      {selectedCustomer.raw_input}
                    </pre>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="card p-12 text-center">
              <svg className="w-12 h-12 text-[#21262d] mx-auto mb-4" viewBox="0 0 16 16" fill="currentColor">
                <path d="M10.561 8.073a6.005 6.005 0 0 1 3.432 5.07.75.75 0 0 1-1.497.108 4.505 4.505 0 0 0-8.992 0 .75.75 0 0 1-1.497-.108 6.004 6.004 0 0 1 3.431-5.07 4 4 0 1 1 5.123 0ZM12 4.5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"/>
              </svg>
              <p className="text-sm text-[#484f58]">选择左侧客户查看画像分析</p>
              <p className="text-xs text-[#30363d] mt-1">AI 将自动生成客户画像、财务需求分析与沟通建议</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
