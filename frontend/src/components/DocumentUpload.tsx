import { useState, useRef, useEffect } from 'react';
import type { Category } from '../types';
import CategoryIcon from './CategoryIcon';

interface DocumentUploadProps {
  categories: Category[];
  onUpload: (file: File, categoryId: string, onProgress?: (pct: number) => void) => Promise<void>;
}

export default function DocumentUpload({ categories, onUpload }: DocumentUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!categoryId && categories.length > 0) {
      setCategoryId(categories[0].id);
    }
  }, [categories, categoryId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !categoryId) return;
    setUploading(true);
    setMessage('');
    setProgress(0);
    try {
      await onUpload(file, categoryId, setProgress);
      setMessage(`"${file.name}" 上传成功`);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setMessage(`上传失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
    setUploading(false);
  };

  return (
    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
      <select
        value={categoryId}
        onChange={e => setCategoryId(e.target.value)}
        className="h-[32px] bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-2.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-blue)] focus:shadow-[0_0_0_3px_rgba(88,166,255,0.15)] outline-none transition-all duration-200"
      >
        {categories.map(cat => (
          <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
        ))}
      </select>
      <label className={`btn btn-secondary text-xs h-[32px] ${uploading ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
          <path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"/>
        </svg>
        {uploading ? `上传中 ${progress}%` : '上传文档'}
        <input ref={fileRef} type="file" className="hidden"
          accept=".pdf,.doc,.docx,.txt,.md,.ppt,.pptx,.xls,.xlsx,.xlsm,.csv"
          onChange={handleUpload} disabled={uploading} />
      </label>
      {uploading && (
        <div className="w-24 h-1.5 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
          <div className="h-full bg-[var(--btn-blue)] rounded-full transition-all duration-150" style={{ width: `${progress}%` }} />
        </div>
      )}
      {message && (
        <span className={`text-xs font-mono ${message.includes('失败') ? 'text-[var(--accent-red)]' : 'text-[var(--accent-green)]'}`}>
          {message}
        </span>
      )}
    </div>
  );
}
