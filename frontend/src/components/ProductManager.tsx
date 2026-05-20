import { useEffect, useState, useCallback, useRef } from 'react';
import { getProducts, createProduct, importProductsCsv, deleteProduct } from '../services/api';
import type { Product } from '../types';
import ProductNavChart from './ProductNavChart';

const PRODUCT_TYPES = ['保险', '基金', '理财', '信托', '结构化', '其他'];
const RISK_LEVELS = [1, 2, 3, 4, 5];

export default function ProductManager() {
  const [products, setProducts] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [jumpPage, setJumpPage] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', type: '基金', risk_level: 3, expected_return: '', min_investment: '', description: '', issuer: '', target_tags: '', lock_period: '', fund_code: '' });
  const [importError, setImportError] = useState('');
  const [importProgress, setImportProgress] = useState(0);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await getProducts(typeFilter || undefined, riskFilter ? Number(riskFilter) : undefined, search || undefined, page);
    setProducts(res.items);
    setTotalPages(res.total_pages);
  }, [page, search, typeFilter, riskFilter]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (q: string) => { setSearch(q); setPage(1); };

  const handlePageChange = (p: number) => {
    if (p < 1 || p > totalPages) return;
    setPage(p);
  };

  const handleJumpPage = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && jumpPage.trim()) {
      const n = parseInt(jumpPage, 10);
      if (!isNaN(n)) handlePageChange(n);
      setJumpPage('');
    }
  };

  const handleAdd = async () => {
    await createProduct({
      name: form.name,
      type: form.type,
      risk_level: form.risk_level,
      expected_return: parseFloat(form.expected_return),
      min_investment: parseFloat(form.min_investment),
      description: form.description || null,
      issuer: form.issuer || null,
      target_tags: form.target_tags ? form.target_tags.split(',').map(t => t.trim()).filter(Boolean) : null,
      lock_period: form.lock_period || null,
      fund_code: form.fund_code || null,
    });
    setShowAddModal(false);
    setForm({ name: '', type: '基金', risk_level: 3, expected_return: '', min_investment: '', description: '', issuer: '', target_tags: '', lock_period: '', fund_code: '' });
    load();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    setImportProgress(0);
    setImporting(true);
    try {
      await importProductsCsv(file, setImportProgress);
      setShowCsvModal(false);
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (err: any) {
      setImportError(err.message);
    }
    setImporting(false);
  };

  const getRiskLabel = (level: number): { text: string; color: string } => {
    const map: Record<number, { text: string; color: string }> = {
      1: { text: 'R1', color: '#3fb950' },
      2: { text: 'R2', color: '#3fb950' },
      3: { text: 'R3', color: '#d29922' },
      4: { text: 'R4', color: '#f0883e' },
      5: { text: 'R5', color: '#f85149' },
    };
    return map[level] || { text: `R${level}`, color: '#8b949e' };
  };

  const renderPagination = () => {
    if (totalPages <= 1) return null;
    return (
      <div className="flex items-center gap-1 pt-2">
        <button onClick={() => handlePageChange(page - 1)} disabled={page <= 1}
          className="px-2 py-1 text-xs rounded border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
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
              <button key={p} onClick={() => handlePageChange(p)}
                className={`w-7 h-7 text-xs rounded transition-colors ${p === page ? 'bg-[#1f6feb] text-white border border-[#388bfd]' : 'border border-transparent text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22]'}`}>
                {p}
              </button>
            ) : (
              <span key={`dots-${idx}`} className="px-0.5 text-[10px] text-[#484f58] select-none">&hellip;</span>
            )
          );
        })()}
        <button onClick={() => handlePageChange(page + 1)} disabled={page >= totalPages}
          className="px-2 py-1 text-xs rounded border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          &raquo;
        </button>
        <span className="text-[10px] text-[#484f58] ml-2">{page}/{totalPages} 页</span>
        <input type="text" value={jumpPage}
          onChange={e => setJumpPage(e.target.value.replace(/\D/g, ''))}
          onKeyDown={handleJumpPage} placeholder="跳转"
          className="ml-1 w-12 bg-[#0d1117] border border-[#30363d] rounded px-1.5 py-0.5 text-[11px] text-[#e6edf3] placeholder-[#484f58] focus:border-[#58a6ff] outline-none" />
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input type="text" value={search} onChange={e => handleSearch(e.target.value)}
          placeholder="搜索产品名称..." className="bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#e6edf3] placeholder-[#484f58] focus:border-[#58a6ff] outline-none flex-1" />
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          className="bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-xs text-[#e6edf3] outline-none focus:border-[#58a6ff]">
          <option value="">全部类型</option>
          {PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={riskFilter} onChange={e => { setRiskFilter(e.target.value); setPage(1); }}
          className="bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-xs text-[#e6edf3] outline-none focus:border-[#58a6ff]">
          <option value="">全部风险</option>
          {RISK_LEVELS.map(r => <option key={r} value={r}>R{r}</option>)}
        </select>
        <button onClick={() => setShowAddModal(true)} className="btn btn-primary text-xs whitespace-nowrap">新增产品</button>
        <button onClick={() => setShowCsvModal(true)} className="btn btn-secondary text-xs whitespace-nowrap">CSV导入</button>
      </div>

      {/* Product list */}
      <div className="space-y-1.5">
        {products.length === 0 && (
          <div className="text-center py-6">
            <p className="text-sm text-[#484f58]">暂无产品数据</p>
            <p className="text-xs text-[#30363d] mt-1">点击"新增产品"或"CSV导入"添加</p>
          </div>
        )}
        {products.map(p => {
          const risk = getRiskLabel(p.risk_level);
          const expanded = expandedId === p.id;
          return (
            <div key={p.id} className="bg-[#0d1117] border border-[#21262d] rounded-md overflow-hidden">
              <div
                onClick={() => setExpandedId(expanded ? null : p.id)}
                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-[#161b22] transition-colors"
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: risk.color }} />
                <span className="text-sm text-[#e6edf3] flex-1 truncate">{p.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-[#30363d]" style={{ color: risk.color }}>{risk.text}</span>
                <span className="text-[10px] text-[#3fb950] font-mono tabular-nums">+{p.expected_return}%</span>
                <span className="text-[10px] text-[#484f58]">{expanded ? '收起 ▴' : '展开 ▾'}</span>
                <button
                  onClick={e => { e.stopPropagation(); deleteProduct(p.id).then(load); }}
                  className="text-[10px] text-[#f85149] hover:text-[#ff7b72] ml-1"
                >删除</button>
              </div>
              {expanded && (
                <div className="border-t border-[#21262d] px-3 py-3 space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div><span className="text-[#6e7681]">类型</span><br/><span className="text-[#e6edf3]">{p.type}</span></div>
                    <div><span className="text-[#6e7681]">预期收益</span><br/><span className="text-[#3fb950] font-mono">{p.expected_return}%</span></div>
                    <div><span className="text-[#6e7681]">起投金额</span><br/><span className="text-[#e6edf3]">{p.min_investment.toLocaleString()} 元</span></div>
                    <div><span className="text-[#6e7681]">锁定期</span><br/><span className="text-[#e6edf3]">{p.lock_period || '无'}</span></div>
                    {p.issuer && <div><span className="text-[#6e7681]">发行机构</span><br/><span className="text-[#e6edf3]">{p.issuer}</span></div>}
                    {p.description && <div className="col-span-2"><span className="text-[#6e7681]">描述</span><br/><span className="text-[#8b949e]">{p.description}</span></div>}
                  </div>
                  {p.nav_history && p.nav_history.length > 0 && (
                    <div>
                      <p className="text-[10px] font-medium text-[#6e7681] uppercase tracking-wider mb-1">近12个月净值走势</p>
                      <ProductNavChart data={p.nav_history!} source={p.source} productType={p.type} />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {renderPagination()}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowAddModal(false)}>
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5 w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-[#e6edf3] mb-4">新增金融产品</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-[#6e7681] uppercase tracking-wider block mb-1">产品名称 *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1.5 text-xs text-[#e6edf3] focus:border-[#58a6ff] outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-[#6e7681] uppercase tracking-wider block mb-1">类型</label>
                  <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-xs text-[#e6edf3] outline-none">
                    {PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-[#6e7681] uppercase tracking-wider block mb-1">风险等级 (1-5)</label>
                  <select value={form.risk_level} onChange={e => setForm({ ...form, risk_level: Number(e.target.value) })}
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-xs text-[#e6edf3] outline-none">
                    {RISK_LEVELS.map(r => <option key={r} value={r}>R{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-[#6e7681] uppercase tracking-wider block mb-1">预期年化收益率 (%) *</label>
                  <input type="number" step="0.1" value={form.expected_return} onChange={e => setForm({ ...form, expected_return: e.target.value })}
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1.5 text-xs text-[#e6edf3] focus:border-[#58a6ff] outline-none" />
                </div>
                <div>
                  <label className="text-[10px] text-[#6e7681] uppercase tracking-wider block mb-1">起投金额 (元) *</label>
                  <input type="number" value={form.min_investment} onChange={e => setForm({ ...form, min_investment: e.target.value })}
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1.5 text-xs text-[#e6edf3] focus:border-[#58a6ff] outline-none" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-[#6e7681] uppercase tracking-wider block mb-1">发行机构</label>
                <input value={form.issuer} onChange={e => setForm({ ...form, issuer: e.target.value })}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1.5 text-xs text-[#e6edf3] focus:border-[#58a6ff] outline-none" />
              </div>
              <div>
                <label className="text-[10px] text-[#6e7681] uppercase tracking-wider block mb-1">锁定期限</label>
                <input value={form.lock_period} onChange={e => setForm({ ...form, lock_period: e.target.value })}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1.5 text-xs text-[#e6edf3] focus:border-[#58a6ff] outline-none" placeholder="如: T+1、30天、1年" />
              </div>
              <div>
                <label className="text-[10px] text-[#6e7681] uppercase tracking-wider block mb-1">基金代码 (仅基金类)</label>
                <input value={form.fund_code} onChange={e => setForm({ ...form, fund_code: e.target.value })}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1.5 text-xs text-[#e6edf3] focus:border-[#58a6ff] outline-none" placeholder="如: 005827，填后自动拉取真实净值" />
              </div>
              <div>
                <label className="text-[10px] text-[#6e7681] uppercase tracking-wider block mb-1">适合人群标签 (逗号分隔)</label>
                <input value={form.target_tags} onChange={e => setForm({ ...form, target_tags: e.target.value })}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1.5 text-xs text-[#e6edf3] focus:border-[#58a6ff] outline-none" placeholder="如: 保守,稳健,长期投资" />
              </div>
              <div>
                <label className="text-[10px] text-[#6e7681] uppercase tracking-wider block mb-1">产品描述</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={2} className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2.5 py-1.5 text-xs text-[#e6edf3] focus:border-[#58a6ff] outline-none resize-none" />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button onClick={() => setShowAddModal(false)} className="btn btn-secondary text-xs">取消</button>
                <button onClick={handleAdd} disabled={!form.name || !form.expected_return || !form.min_investment}
                  className="btn btn-primary text-xs disabled:opacity-50">创建</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {showCsvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { setShowCsvModal(false); setImportError(''); }}>
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-[#e6edf3] mb-2">CSV 批量导入</h3>
            <p className="text-xs text-[#8b949e] mb-3">列: name,type,risk_level,expected_return,min_investment,description,issuer,target_tags,lock_period,fund_code</p>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFileChange} disabled={importing}
              className="block w-full text-xs text-[#e6edf3] file:mr-2 file:py-1 file:px-3 file:text-xs file:rounded file:border-0 file:bg-[#1f6feb] file:text-white hover:file:bg-[#388bfd] disabled:opacity-50" />
            {importing && (
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 h-1.5 bg-[#0d1117] rounded-full overflow-hidden">
                  <div className="h-full bg-[#1f6feb] rounded-full transition-all duration-150" style={{ width: `${importProgress}%` }} />
                </div>
                <span className="text-[10px] text-[#6e7681] font-mono">{importProgress}%</span>
              </div>
            )}
            {importError && <p className="text-xs text-[#f85149] mt-2">{importError}</p>}
            <div className="flex gap-2 justify-end mt-3">
              <button onClick={() => { setShowCsvModal(false); setImportError(''); }} className="btn btn-secondary text-xs">关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
