import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Customer } from '../types';
import { getCustomers } from '../services/api';

interface CustomerPickerProps {
  selected: Customer | null;
  onSelect: (customer: Customer) => void;
  onClear: () => void;
}

export default function CustomerPicker({ selected, onSelect, onClear }: CustomerPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [list, setList] = useState<Customer[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const searchCustomers = useCallback(async (q: string) => {
    try {
      const result = await getCustomers(q || undefined, 1, 10);
      setList(result.items);
    } catch {
      setList([]);
    }
  }, []);

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      {selected ? (
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
            bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]
            border border-[var(--accent-blue)]/30 hover:bg-[var(--accent-blue)]/20
            transition-all duration-200"
          title="切换客户"
        >
          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1.5a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5ZM3.25 14a4.75 4.75 0 0 1 9.5 0 .75.75 0 0 1-1.5 0 3.25 3.25 0 0 0-6.5 0 .75.75 0 0 1-1.5 0Z"/>
          </svg>
          {selected.name}
          <span
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="ml-0.5 text-[var(--text-placeholder)] hover:text-[var(--accent-red)] transition-colors"
          >×</span>
        </button>
      ) : (
        <button
          onClick={() => { setOpen(true); searchCustomers(''); }}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs
            text-[var(--text-placeholder)] border border-dashed border-[var(--border-subtle)]
            hover:text-[var(--text-secondary)] hover:border-[var(--border-default)]
            transition-all duration-200"
          title="关联客户（可选）"
        >
          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1.5a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5ZM3.25 14a4.75 4.75 0 0 1 9.5 0 .75.75 0 0 1-1.5 0 3.25 3.25 0 0 0-6.5 0 .75.75 0 0 1-1.5 0Z M13.25 7a.75.75 0 0 1 .75.75v2.5h2.5a.75.75 0 0 1 0 1.5H14v2.5a.75.75 0 0 1-1.5 0v-2.5H10a.75.75 0 0 1 0-1.5h2.5v-2.5a.75.75 0 0 1 .75-.75Z"/>
          </svg>
          关联客户
        </button>
      )}

      {open && (
        <div className="absolute top-full mt-1 left-0 w-64 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-xl shadow-xl z-30 overflow-hidden">
          <div className="p-2 border-b border-[var(--border-subtle)]">
            <input
              type="text"
              placeholder="搜索客户..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); searchCustomers(e.target.value); }}
              className="w-full bg-[var(--bg-secondary)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-placeholder)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)]/30"
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {list.length === 0 ? (
              <p className="px-3 py-4 text-[11px] text-[var(--text-placeholder)] text-center">暂无匹配客户</p>
            ) : (
              list.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { onSelect(c); setOpen(false); }}
                  className="w-full text-left px-3 py-2 hover:bg-[var(--bg-secondary)] transition-colors text-xs text-[var(--text-primary)] border-b border-[var(--border-subtle)] last:border-0"
                >
                  <span className="font-medium">{c.name}</span>
                  {c.ai_profile && (
                    <span className="text-[var(--text-placeholder)] ml-2">
                      {(c.ai_profile as Record<string, unknown>).disc_type || ''}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
