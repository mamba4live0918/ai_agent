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
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-white">客户分析</h2>
        <button onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          {showForm ? '关闭' : '+ 新增客户'}
        </button>
      </div>

      {showForm && (
        <div className="mb-6 bg-gray-900 border border-gray-800 rounded-xl p-6">
          <CustomerForm onCreated={() => { loadData(); setShowForm(false); }} />
        </div>
      )}

      <div className="grid grid-cols-12 gap-6">
        {/* Customer list */}
        <div className="col-span-5 space-y-3">
          <SearchBar value={search} onChange={setSearch} placeholder="搜索客户姓名..." />
          <div className="space-y-2">
            {customers.length === 0 && (
              <p className="text-gray-600 text-sm text-center py-8">暂无客户数据</p>
            )}
            {customers.map(cust => (
              <div key={cust.id}
                onClick={() => handleSelect(cust.id)}
                className={`bg-gray-900 border rounded-xl p-4 cursor-pointer transition-colors ${
                  selectedId === cust.id ? 'border-blue-600' : 'border-gray-800 hover:border-gray-700'
                }`}>
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-sm font-semibold text-white">{cust.name}</h4>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(cust.updated_at).toLocaleDateString('zh-CN')}
                    </p>
                  </div>
                  <button onClick={e => { e.stopPropagation(); handleDelete(cust.id); }}
                    className="text-red-400 hover:text-red-300 text-xs transition-colors">删除</button>
                </div>
                {cust.raw_input && (
                  <p className="text-xs text-gray-600 mt-2 truncate">{cust.raw_input}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Detail */}
        <div className="col-span-7">
          {selectedCustomer ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <CustomerProfile customer={selectedCustomer} />
              {selectedCustomer.raw_input && (
                <div className="mt-4 pt-4 border-t border-gray-800">
                  <h4 className="text-xs text-gray-500 mb-1">原始输入</h4>
                  <p className="text-sm text-gray-600">{selectedCustomer.raw_input}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-gray-600">
              选择左侧客户查看画像分析
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
