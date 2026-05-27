import type { Category } from '../types';

interface CategoryNavProps {
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export default function CategoryNav({ categories, selectedId, onSelect }: CategoryNavProps) {
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
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 border ${
            selectedId === cat.id
              ? 'bg-[var(--btn-blue)] text-white border-[var(--btn-blue-hover)]'
              : 'bg-transparent text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
          }`}
        >
          {cat.icon && <span className="mr-1">{cat.icon}</span>}
          {cat.name}
          <span className={`ml-1.5 font-mono text-[10px] tabular-nums ${
            selectedId === cat.id ? 'text-white/70' : 'text-[var(--text-placeholder)]'
          }`}>{cat.document_count}</span>
        </button>
      ))}
    </div>
  );
}
