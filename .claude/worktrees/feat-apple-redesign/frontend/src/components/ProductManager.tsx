import { useEffect, useState, useCallback, useRef } from 'react';
import { getProducts, getProduct, createProduct, importProductsCsv, deleteProduct } from '../services/api';
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

  const handleExpand = async (p: Product) => {
    if (expandedId === p.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(p.id);
    // Auto-refresh NAV if fund product with stale data
    if (p.fund_code) {
      const fourHours = 4 * 60 * 60 * 1000;
      const lastUpdate = p.nav_updated_at ? new Date(p.nav_updated_at).getTime() : 0;
      if (Date.now() - lastUpdate > fourHours) {
        try {
          const fresh = await getProduct(p.id);
          setProducts(prev => prev.map(item => item.id === p.id ? fresh : item));
        } catch { /* silently skip refresh errors */ }
      }
    }
  };

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
      1: { text: 'R1', color: 'var(--accent-green)' },
      2: { text: 'R2', color: 'var(--accent-green)' },
      3: { text: 'R3', color: 'var(--accent-orange)' },
      4: { text: 'R4', color: 'var(--accent-orange)' },
      5: { text: 'R5', color: 'var(--accent-red)' },
    };
    return map[level] || { text: `R${level}`, color: 'var(--text-secondary)' };
  };

  const renderPagination = () => {
    if (totalPages <= 1) return null;
    return (
      <div className="flex items-center gap-1 pt-2">
        <button onClick={() => handlePageChange(page - 1)} disabled={page <= 1}
          className="px-2 py-1 text-xs rounded-full border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200">
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
                className={`w-7 h-7 text-xs rounded-full transition-all duration-200 ${p === page ? 'bg-[var(--btn-blue)] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'}`}>
                {p}
              </button>
            ) : (
              <span key={`dots-${idx}`} className="px-0.5 text-[10px] text-[var(--text-placeholder)] select-none">&hellip;</span>
            )
          );
        })()}
        <button onClick={() => handlePageChange(page + 1)} disabled={page >= totalPages}
          className="px-2 py-1 text-xs rounded-full border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200">
          &raquo;
        </button>
        <span className="text-[10px] text-[var(--text-placeholder)] ml-2">{page}/{totalPages} 页</span>
        <input type="text" value={jumpPage}
          onChange={e => setJumpPage(e.target.value.replace(/\D/g, ''))}
          onKeyDown={handleJumpPage} placeholder="跳转"
          className="ml-1 w-12 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-1.5 py-0.5 text-[11px] text-[var(--text-primary)] placeholder-[var(--text-placeholder)] focus:border-[var(--accent-blue)] outline-none transition-all duration-200" />
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="搜索产品名称..." className="bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-placeholder)] focus:border-[var(--accent-blue)] outline-none flex-1 transition-all duration-200" />
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          className="bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] transition-all duration-200">
          <option value="">全部类型</option>
          {PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={riskFilter} onChange={e => { setRiskFilter(e.target.value); setPage(1); }}
          className="bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] transition-all duration-200">
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
            <p className="text-sm text-[var(--text-placeholder)]">暂无产品数据</p>
            <p className="text-xs text-[var(--border-default)] mt-1">点击"新增产品"或"CSV导入"添加</p>
          </div>
        )}
        {products.map(p => {
          const risk = getRiskLabel(p.risk_level);
          const expanded = expandedId === p.id;
          return (
            <div key={p.id} className="bg-[var(--bg-primary)] rounded-xl overflow-hidden shadow-sm">
              <div
                onClick={() => handleExpand(p)}
                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors"
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: risk.color }} />
                <span className="text-sm text-[var(--text-primary)] flex-1 truncate">{p.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-[var(--border-default)]" style={{ color: risk.color }}>{risk.text}</span>
                <span className="text-[10px] text-[var(--accent-green)] font-mono tabular-nums hidden sm:inline">+{p.expected_return}%</span>
                <span className="text-[10px] text-[var(--text-placeholder)] hidden sm:inline">{expanded ? '收起 ▴' : '展开 ▾'}</span>
                <span className="text-[10px] text-[var(--text-placeholder)] sm:hidden">{expanded ? '▴' : '▾'}</span>
                <button
                  onClick={e => { e.stopPropagation(); deleteProduct(p.id).then(load); }}
                  className="text-[10px] text-[var(--accent-red)] hover:text-[var(--accent-red)] ml-1 flex-shrink-0"
                >删除</button>
              </div>
              {expanded && (
                <div className="border-t border-[var(--border-subtle)] px-3 py-3 space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div><span className="text-[var(--text-tertiary)]">类型</span><br/><span className="text-[var(--text-primary)]">{p.type}</span></div>
                    <div><span className="text-[var(--text-tertiary)]">预期收益</span><br/><span className="text-[var(--accent-green)] font-mono">{p.expected_return}%</span></div>
                    <div><span className="text-[var(--text-tertiary)]">起投金额</span><br/><span className="text-[var(--text-primary)]">{p.min_investment.toLocaleString()} 元</span></div>
                    <div><span className="text-[var(--text-tertiary)]">锁定期</span><br/><span className="text-[var(--text-primary)]">{p.lock_period || '无'}</span></div>
                    {p.issuer && <div><span className="text-[var(--text-tertiary)]">发行机构</span><br/><span className="text-[var(--text-primary)]">{p.issuer}</span></div>}
                    {p.description && <div className="col-span-2"><span className="text-[var(--text-tertiary)]">描述</span><br/><span className="text-[var(--text-secondary)]">{p.description}</span></div>}
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-1">
                      近12个月净值走势
                      {p.nav_updated_at && <span className="ml-2 font-normal lowercase text-[var(--text-placeholder)]">更新于 {new Date(p.nav_updated_at).toLocaleString('zh-CN')}</span>}
                    </p>
                    <ProductNavChart data={p.nav_history || []} source={p.source} productType={p.type} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {renderPagination()}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowAddModal(false)}>
          <div className="bg-[var(--bg-secondary)] rounded-2xl p-5 w-full max-w-md max-h-[85vh] overflow-y-auto shadow-lg" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">新增金融产品</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider block mb-1">产品名称 *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none transition-all duration-200" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider block mb-1">类型</label>
                  <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none transition-all duration-200">
                    {PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider block mb-1">风险等级 (1-5)</label>
                  <select value={form.risk_level} onChange={e => setForm({ ...form, risk_level: Number(e.target.value) })}
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none transition-all duration-200">
                    {RISK_LEVELS.map(r => <option key={r} value={r}>R{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider block mb-1">预期年化收益率 (%) *</label>
                  <input type="number" step="0.1" value={form.expected_return} onChange={e => setForm({ ...form, expected_return: e.target.value })}
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none transition-all duration-200" />
                </div>
                <div>
                  <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider block mb-1">起投金额 (元) *</label>
                  <input type="number" value={form.min_investment} onChange={e => setForm({ ...form, min_investment: e.target.value })}
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none transition-all duration-200" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider block mb-1">发行机构</label>
                <input value={form.issuer} onChange={e => setForm({ ...form, issuer: e.target.value })}
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none transition-all duration-200" />
              </div>
              <div>
                <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider block mb-1">锁定期限</label>
                <input value={form.lock_period} onChange={e => setForm({ ...form, lock_period: e.target.value })}
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none transition-all duration-200" placeholder="如: T+1、30天、1年" />
              </div>
              <div>
                <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider block mb-1">基金代码 (仅基金类)</label>
                <input value={form.fund_code} onChange={e => setForm({ ...form, fund_code: e.target.value })}
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none transition-all duration-200" placeholder="如: 005827，填后自动拉取真实净值" />
              </div>
              <div>
                <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider block mb-1">适合人群标签 (逗号分隔)</label>
                <input value={form.target_tags} onChange={e => setForm({ ...form, target_tags: e.target.value })}
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none transition-all duration-200" placeholder="如: 保守,稳健,长期投资" />
              </div>
              <div>
                <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider block mb-1">产品描述</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={2} className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-2xl px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none resize-none transition-all duration-200" />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setShowCsvModal(false); setImportError(''); }}>
          <div className="bg-[var(--bg-secondary)] rounded-2xl p-5 w-full max-w-sm shadow-lg" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">CSV 批量导入</h3>
            <p className="text-xs text-[var(--text-secondary)] mb-3">列: name,type,risk_level,expected_return,min_investment,description,issuer,target_tags,lock_period,fund_code</p>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFileChange} disabled={importing}
              className="block w-full text-xs text-[var(--text-primary)] file:mr-2 file:py-1 file:px-3 file:text-xs file:rounded file:border-0 file:bg-[var(--btn-blue)] file:text-white hover:file:bg-[var(--btn-blue-hover)] disabled:opacity-50" />
            {importing && (
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 h-1.5 bg-[var(--bg-primary)] rounded-full overflow-hidden">
                  <div className="h-full bg-[var(--btn-blue)] rounded-full transition-all duration-150" style={{ width: `${importProgress}%` }} />
                </div>
                <span className="text-[10px] text-[var(--text-tertiary)] font-mono">{importProgress}%</span>
              </div>
            )}
            {importError && <p className="text-xs text-[var(--accent-red)] mt-2">{importError}</p>}
            <div className="flex gap-2 justify-end mt-3">
              <button onClick={() => { setShowCsvModal(false); setImportError(''); }} className="btn btn-secondary text-xs">关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
