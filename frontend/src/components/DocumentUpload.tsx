import { useState, useRef } from 'react';
import type { Category } from '../types';

interface DocumentUploadProps {
  categories: Category[];
  onUpload: (file: File, categoryId: string) => Promise<void>;
}

export default function DocumentUpload({ categories, onUpload }: DocumentUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !categoryId) return;
    setUploading(true);
    setMessage('');
    try {
      await onUpload(file, categoryId);
      setMessage(`"${file.name}" 上传成功`);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setMessage(`上传失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
    setUploading(false);
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">上传文档</h3>
      <div className="flex gap-3 items-center">
        <select
          value={categoryId}
          onChange={e => setCategoryId(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
        >
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
          ))}
        </select>
        <label className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
          uploading ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}>
          {uploading ? '上传中...' : '选择文件'}
          <input ref={fileRef} type="file" className="hidden"
            accept=".pdf,.docx,.txt,.md,.pptx"
            onChange={handleUpload} disabled={uploading} />
        </label>
        <span className="text-xs text-gray-500">支持 PDF, DOCX, TXT, MD, PPTX</span>
      </div>
      {message && (
        <p className={`mt-2 text-sm ${message.includes('失败') ? 'text-red-400' : 'text-green-400'}`}>{message}</p>
      )}
    </div>
  );
}
