import { useState } from 'react';
import type { Category } from '../types';
import CategoryIcon from './CategoryIcon';

interface CategoryNavProps {
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDelete?: (id: string, name: string) => void;
}

export default function CategoryNav({ categories, selectedId, onSelect, onDelete }: CategoryNavProps) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const total = categories.reduce((s, c) => s + c.document_count, 0);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[11px] font-semibold text-[var(--text-placeholder)] uppercase tracking-wider mr-1">分类</span>
      <button
        onClick={() => onSelect(null)}
        className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 border ${
          selectedId === null
            ? 'bg-[var(--btn-blue)] text-white border-[var(--btn-blue-hover)]'
            : 'bg-transparent text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
        }`}
      >
        全部
        <span className={`ml-1.5 font-mono text-[10px] tabular-nums ${
          selectedId === null ? 'text-white/70' : 'text-[var(--text-placeholder)]'
        }`}>{total}</span>
      </button>
      {categories.map(cat => (
        <div key={cat.id} className="flex items-center gap-0.5">
          <button
            onClick={() => onSelect(cat.id)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 border ${
              selectedId === cat.id
                ? 'bg-[var(--btn-blue)] text-white border-[var(--btn-blue-hover)]'
                : 'bg-transparent text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
            }`}
          >
            <CategoryIcon icon={cat.icon} className="mr-1" />
            {cat.name}
            <span className={`ml-1.5 font-mono text-[10px] tabular-nums ${
              selectedId === cat.id ? 'text-white/70' : 'text-[var(--text-placeholder)]'
            }`}>{cat.document_count}</span>
          </button>
          {editing && onDelete && (
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setDeleting(deleting === cat.id ? null : cat.id); }}
                className="w-5 h-5 inline-flex items-center justify-center text-[10px] text-[var(--text-placeholder)] hover:text-[var(--accent-red)] rounded-full hover:bg-[var(--accent-red)]/10 transition-colors"
                title="删除分类"
              >
                ✕
              </button>
              {deleting === cat.id && (
                <div className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 z-30 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl shadow-lg p-3 min-w-[180px] text-center">
                  <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-[var(--bg-primary)] border-l border-t border-[var(--border-subtle)]" />
                  <p className="text-xs text-[var(--text-primary)] mb-2.5">
                    确定删除分类「<span className="font-semibold">{cat.name}</span>」？
                  </p>
                  <p className="text-[10px] text-[var(--text-placeholder)] mb-3">其中的文档将移入未分类</p>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(cat.id, cat.name); setDeleting(null); }}
                      className="px-3 py-1 text-[11px] rounded-full bg-[var(--accent-red)] text-white hover:opacity-90 transition-opacity"
                    >
                      确认删除
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleting(null); }}
                      className="px-3 py-1 text-[11px] rounded-full border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      {onDelete && (
        <button
          onClick={() => { setEditing(!editing); setDeleting(null); }}
          className={`w-6 h-6 inline-flex items-center justify-center rounded-full text-xs transition-colors ${
            editing
              ? 'bg-[var(--accent-red)]/10 text-[var(--accent-red)]'
              : 'text-[var(--text-placeholder)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
          }`}
          title={editing ? '完成' : '编辑分类'}
        >
          {editing ? (
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg>
          ) : (
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10Z"/></svg>
          )}
        </button>
      )}
    </div>
  );
}
