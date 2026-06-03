import { useState, useEffect, useCallback } from 'react';
import { listMarketFunds, searchMarketFunds, saveMarketProduct } from '../services/api';
import type { MarketFundBrowseItem, MarketFundItem } from '../types';

interface Props {
  onClose: () => void;
  onImported: () => void;  // refresh product list
}

const CATEGORIES = [
  { key: 'all', label: '全部' },
  { key: 'stock', label: '股票型' },
  { key: 'mix', label: '混合型' },
  { key: 'bond', label: '债券型' },
  { key: 'index', label: '指数型' },
  { key: 'qdii', label: 'QDII' },
  { key: 'money', label: '货币型' },
];

export default function MarketFundPicker({ onClose, onImported }: Props) {
  const [mode, setMode] = useState<'browse' | 'search'>('browse');
  const [category, setCategory] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [items, setItems] = useState<(MarketFundBrowseItem | MarketFundItem)[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);  // fund_code being saved
  const [saved, setSaved] = useState<Set<string>>(new Set());  // successfully saved codes
  const [error, setError] = useState('');

  const loadBrowse = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listMarketFunds(category, page, 20);
      setItems(res.items);
      setTotal(res.total);
      setTotalPages(res.total_pages);
    } catch (err: any) {
      setError(err.message || '加载失败');
    }
    setLoading(false);
  }, [category, page]);

  const loadSearch = useCallback(async () => {
    if (!keyword.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await searchMarketFunds(keyword.trim(), 30);
      setItems(res.items);
      setTotal(res.items.length);
      setTotalPages(1);
    } catch (err: any) {
      setError(err.message || '搜索失败');
    }
    setLoading(false);
  }, [keyword]);

  useEffect(() => {
    if (mode === 'browse') {
      loadBrowse();
    }
  }, [mode, loadBrowse]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode !== 'search') {
      setMode('search');
      setPage(1);
    }
    if (keyword.trim()) {
      loadSearch();
    }
  };

  const handleCategoryChange = (cat: string) => {
    setCategory(cat);
    setMode('browse');
    setPage(1);
    setKeyword('');
  };

  const handleSave = async (fundCode: string) => {
    setSaving(fundCode);
    setError('');
    try {
      await saveMarketProduct(fundCode);
      setSaved(prev => new Set(prev).add(fundCode));
      onImported();
    } catch (err: any) {
      setError(err.message || '导入失败');
    }
    setSaving(null);
  };

  // Filter search results by keyword locally when in search mode
  const displayItems = mode === 'search'
    ? items.filter(item =>
        item.name.toLowerCase().includes(keyword.toLowerCase()) ||
        item.fund_code.includes(keyword)
      )
    : items;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-subtle)] shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">📊</span>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">市场产品导入</h2>
            <span className="text-[10px] text-[var(--text-placeholder)] bg-[var(--bg-tertiary)] px-2 py-0.5 rounded-full">
              数据来源: akshare | 每2小时自动刷新
            </span>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-[var(--text-placeholder)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-all duration-200">
            ✕
          </button>
        </div>

        {/* Search bar */}
        <div className="px-5 py-3 border-b border-[var(--border-subtle)] shrink-0">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              placeholder="搜索基金名称或代码..."
              className="flex-1 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-4 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-placeholder)] focus:border-[var(--accent-blue)] outline-none transition-all duration-200"
            />
            <button type="submit"
              className="btn btn-primary text-xs px-4 rounded-full">
              🔍 搜索
            </button>
          </form>
        </div>

        {/* Category pills */}
        <div className="px-5 py-2.5 flex gap-1.5 overflow-x-auto shrink-0 border-b border-[var(--border-subtle)]">
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              onClick={() => handleCategoryChange(cat.key)}
              className={`px-3 py-1 text-[11px] rounded-full whitespace-nowrap transition-all duration-200 ${
                mode === 'browse' && category === cat.key
                  ? 'bg-[var(--btn-blue)] text-white'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="px-5 py-2 text-[11px] text-[var(--text-placeholder)] shrink-0">
          {mode === 'browse'
            ? `共 ${total.toLocaleString()} 只基金，第 ${page}/${totalPages || 1} 页`
            : `搜索到 ${total} 只基金`}
        </div>

        {/* Fund list */}
        <div className="flex-1 overflow-y-auto px-5 py-2 space-y-1.5">
          {loading && (
            <div className="text-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-[var(--accent-blue)] border-t-transparent rounded-full mx-auto mb-2" />
              <p className="text-xs text-[var(--text-placeholder)]">加载市场数据中...</p>
            </div>
          )}

          {error && (
            <div className="text-center py-4">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {!loading && !error && displayItems.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-[var(--text-placeholder)]">
                {mode === 'search' ? '未找到匹配的基金' : '暂无数据'}
              </p>
            </div>
          )}

          {displayItems.map(item => {
            const isSaving = saving === item.fund_code;
            const isSaved = saved.has(item.fund_code);
            return (
              <div key={item.fund_code}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] hover:border-[var(--border-default)] transition-all duration-200 group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[var(--text-primary)] truncate font-medium">{item.name}</span>
                    {'raw_type' in item && (
                      <span className="text-[10px] text-[var(--text-placeholder)] bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded-full shrink-0">
                        {item.raw_type}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-[var(--text-placeholder)]">
                    <span className="font-mono">{item.fund_code}</span>
                    <span>{item.company}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleSave(item.fund_code)}
                  disabled={isSaving || isSaved}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-all duration-200 ${
                    isSaved
                      ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                      : isSaving
                      ? 'bg-[var(--bg-tertiary)] text-[var(--text-placeholder)]'
                      : 'bg-[var(--btn-blue)] text-white hover:opacity-80'
                  }`}
                >
                  {isSaving ? '⏳ 导入中...' : isSaved ? '✅ 已导入' : '📥 一键导入'}
                </button>
              </div>
            );
          })}
        </div>

        {/* Pagination (browse mode) */}
        {mode === 'browse' && totalPages > 1 && (
          <div className="flex items-center justify-center gap-1 px-5 py-3 border-t border-[var(--border-subtle)] shrink-0">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="px-2 py-1 text-xs rounded-full border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200">
              &laquo;
            </button>
            <span className="text-[11px] text-[var(--text-placeholder)] px-2">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="px-2 py-1 text-xs rounded-full border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200">
              &raquo;
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-[var(--border-subtle)] shrink-0 flex items-center justify-between text-[10px] text-[var(--text-placeholder)]">
          <span>仅展示公募基金产品（保险/信托/结构化产品无公开市场数据）</span>
          <span>数据每2小时缓存刷新</span>
        </div>
      </div>
    </div>
  );
}
