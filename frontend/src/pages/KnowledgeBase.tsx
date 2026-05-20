import { useEffect, useState, useCallback } from 'react';
import { getCategories, getDocuments, uploadDocument, deleteDocument } from '../services/api';
import type { Category, Document } from '../types';
import CategoryNav from '../components/CategoryNav';
import SearchBar from '../components/SearchBar';
import DocumentUpload from '../components/DocumentUpload';
import ChatPanel from '../components/ChatPanel';

export default function KnowledgeBase() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showChat, setShowChat] = useState(false);

  const loadData = useCallback(async () => {
    const cats = await getCategories();
    setCategories(cats);
    const docs = await getDocuments(selectedCat || undefined, search || undefined);
    setDocuments(docs.items);
  }, [selectedCat, search]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleUpload = async (file: File, categoryId: string) => {
    await uploadDocument(file, categoryId);
    loadData();
  };

  const handleDelete = async (id: string) => {
    await deleteDocument(id);
    loadData();
  };

  const fileIcon = (type: string) => {
    const icons: Record<string, string> = {
      pdf: 'M4 4a2 2 0 0 1 2-2h4.172a2 2 0 0 1 1.414.586l2.828 2.828A2 2 0 0 1 15 6.828V12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Z',
      docx: 'M4 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Z',
      pptx: 'M3 2.5A1.5 1.5 0 0 1 4.5 1h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12A1.5 1.5 0 0 1 12 4.622V13.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 2 13.5v-11Z',
      md: 'M3 1.75A1.75 1.75 0 0 1 4.75 0h6.086a1.75 1.75 0 0 1 1.238.513l3.414 3.414a1.75 1.75 0 0 1 .512 1.238V14.25A1.75 1.75 0 0 1 14.25 16H4.75A1.75 1.75 0 0 1 3 14.25Z',
      txt: 'M3 1.75A1.75 1.75 0 0 1 4.75 0h6.086a1.75 1.75 0 0 1 1.238.513l3.414 3.414a1.75 1.75 0 0 1 .512 1.238V14.25A1.75 1.75 0 0 1 14.25 16H4.75A1.75 1.75 0 0 1 3 14.25Z',
    };
    return icons[type] || icons.txt;
  };

  const typeColor = (type: string) => {
    const colors: Record<string, string> = {
      pdf: 'text-[#f85149]', docx: 'text-[#58a6ff]', pptx: 'text-[#d29922]', md: 'text-[#8b949e]', txt: 'text-[#8b949e]',
    };
    return colors[type] || 'text-[#8b949e]';
  };

  return (
    <div className="max-w-6xl mx-auto px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 animate-in" style={{ animationDelay: '0ms' }}>
        <div>
          <h2 className="text-xl font-bold text-[#e6edf3]">知识库</h2>
          <p className="text-sm text-[#8b949e] mt-1">浏览和搜索销售辅助文档，支持 RAG 智能问答</p>
        </div>
        <button onClick={() => setShowChat(!showChat)} className="btn btn-secondary text-sm">
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v3.5A1.75 1.75 0 0 1 14.25 7H8.828l-3.063 2.757A.75.75 0 0 1 4.5 9.25V7h-.25A1.75 1.75 0 0 1 2.5 5.25v-3.5Z"/>
          </svg>
          {showChat ? '关闭问答' : '知识库问答'}
        </button>
      </div>

      {showChat && (
        <div className="mb-6 animate-in" style={{ animationDelay: '50ms' }}>
          <ChatPanel />
        </div>
      )}

      <div className="space-y-4">
        {/* Upload + Search row */}
        <div className="flex gap-3 animate-in" style={{ animationDelay: '80ms' }}>
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="搜索文档标题、内容..." />
          </div>
          <DocumentUpload categories={categories} onUpload={handleUpload} />
        </div>

        {/* Category filter */}
        <div className="animate-in" style={{ animationDelay: '120ms' }}>
          <CategoryNav categories={categories} selectedId={selectedCat} onSelect={setSelectedCat} />
        </div>

        {/* Documents table */}
        <div className="card overflow-hidden animate-in" style={{ animationDelay: '160ms' }}>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th className="w-[40%]">文档名称</th>
                  <th>分类</th>
                  <th>类型</th>
                  <th className="text-right">分块数</th>
                  <th className="text-right">上传时间</th>
                  <th className="w-[60px]"></th>
                </tr>
              </thead>
              <tbody>
                {documents.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <svg className="w-10 h-10 text-[#21262d] mb-3" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M3 1.75A1.75 1.75 0 0 1 4.75 0h6.086a1.75 1.75 0 0 1 1.238.513l3.414 3.414a1.75 1.75 0 0 1 .512 1.238V14.25A1.75 1.75 0 0 1 14.25 16H4.75A1.75 1.75 0 0 1 3 14.25Z"/>
                        </svg>
                        <p className="text-sm text-[#484f58]">暂无文档</p>
                        <p className="text-xs text-[#30363d] mt-1">上传 PDF、DOCX、TXT、MD 或 PPTX 文件开始构建知识库</p>
                      </div>
                    </td>
                  </tr>
                )}
                {documents.map(doc => (
                  <tr key={doc.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <svg className={`w-4 h-4 flex-shrink-0 ${typeColor(doc.file_type)}`} viewBox="0 0 16 16" fill="currentColor">
                          <path d={fileIcon(doc.file_type)} />
                        </svg>
                        <span className="text-sm font-medium text-[#e6edf3] truncate max-w-[300px]">{doc.title}</span>
                      </div>
                    </td>
                    <td>
                      <span className="text-sm text-[#8b949e]">{doc.category_name || '--'}</span>
                    </td>
                    <td>
                      <span className="badge font-mono text-[10px]">{doc.file_type.toUpperCase()}</span>
                    </td>
                    <td className="text-right">
                      <span className="text-sm text-[#6e7681] font-mono tabular-nums">{doc.chunk_count}</span>
                    </td>
                    <td className="text-right">
                      <span className="text-xs text-[#6e7681]">
                        {new Date(doc.created_at).toLocaleDateString('zh-CN')}
                      </span>
                    </td>
                    <td>
                      <button onClick={() => handleDelete(doc.id)} className="btn btn-danger text-xs px-2 py-1">
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
