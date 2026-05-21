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
      <span className="text-[11px] font-semibold text-[#484f58] uppercase tracking-wider mr-1">分类</span>
      <button
        onClick={() => onSelect(null)}
        className={`px-3 py-1 rounded-md text-xs font-medium transition-all duration-100 border ${
          selectedId === null
            ? 'bg-[#1f6feb] text-white border-[#388bfd]'
            : 'bg-transparent text-[#8b949e] border-transparent hover:text-[#e6edf3] hover:bg-[#161b22]'
        }`}
      >
        全部
        <span className={`ml-1.5 font-mono text-[10px] tabular-nums ${
          selectedId === null ? 'text-white/70' : 'text-[#484f58]'
        }`}>{total}</span>
      </button>
      {categories.map(cat => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-all duration-100 border ${
            selectedId === cat.id
              ? 'bg-[#1f6feb] text-white border-[#388bfd]'
              : 'bg-transparent text-[#8b949e] border-transparent hover:text-[#e6edf3] hover:bg-[#161b22]'
          }`}
        >
          {cat.icon && <span className="mr-1">{cat.icon}</span>}
          {cat.name}
          <span className={`ml-1.5 font-mono text-[10px] tabular-nums ${
            selectedId === cat.id ? 'text-white/70' : 'text-[#484f58]'
          }`}>{cat.document_count}</span>
        </button>
      ))}
    </div>
  );
}
