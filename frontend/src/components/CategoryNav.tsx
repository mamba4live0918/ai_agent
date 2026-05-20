import type { Category } from '../types';

interface CategoryNavProps {
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export default function CategoryNav({ categories, selectedId, onSelect }: CategoryNavProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      <button
        onClick={() => onSelect(null)}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          selectedId === null
            ? 'bg-blue-600 text-white'
            : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
        }`}
      >
        全部 ({categories.reduce((s, c) => s + c.document_count, 0)})
      </button>
      {categories.map(cat => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            selectedId === cat.id
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
          }`}
        >
          {cat.icon && <span className="mr-1">{cat.icon}</span>}
          {cat.name} ({cat.document_count})
        </button>
      ))}
    </div>
  );
}
