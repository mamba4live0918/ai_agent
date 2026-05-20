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

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-white">知识库</h2>
        <button onClick={() => setShowChat(!showChat)}
          className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700 transition-colors">
          {showChat ? '隐藏问答' : '💬 知识库问答'}
        </button>
      </div>

      {showChat && (
        <div className="mb-6">
          <ChatPanel />
        </div>
      )}

      <div className="space-y-4">
        <DocumentUpload categories={categories} onUpload={handleUpload} />
        <SearchBar value={search} onChange={setSearch} placeholder="搜索文档标题..." />
        <CategoryNav categories={categories} selectedId={selectedCat} onSelect={setSelectedCat} />

        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase">
                <th className="text-left px-4 py-3">文档名称</th>
                <th className="text-left px-4 py-3">分类</th>
                <th className="text-left px-4 py-3">类型</th>
                <th className="text-left px-4 py-3">分块数</th>
                <th className="text-left px-4 py-3">上传时间</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {documents.length === 0 && (
                <tr><td colSpan={6} className="text-center text-gray-600 py-8">暂无文档</td></tr>
              )}
              {documents.map(doc => (
                <tr key={doc.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3 text-gray-200 font-medium">{doc.title}</td>
                  <td className="px-4 py-3 text-gray-400">{doc.category_name}</td>
                  <td className="px-4 py-3">
                    <span className="bg-gray-800 text-gray-400 px-2 py-0.5 rounded text-xs">{doc.file_type}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{doc.chunk_count}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{new Date(doc.created_at).toLocaleDateString('zh-CN')}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(doc.id)}
                      className="text-red-400 hover:text-red-300 text-xs transition-colors">删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
