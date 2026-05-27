import { useEffect, useState, useCallback } from 'react';
import { getCategories, getDocuments, getDocumentContent, downloadDocument, uploadDocument, deleteDocument } from '../services/api';
import type { Category, Document, DocumentContent } from '../types';
import CategoryNav from '../components/CategoryNav';
import SearchBar from '../components/SearchBar';
import DocumentUpload from '../components/DocumentUpload';
import ChatPanel from '../components/ChatPanel';

export default function KnowledgeBase() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showChat, setShowChat] = useState(false);

  // Preview state
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<DocumentContent | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const pageSize = 20;

  const loadData = useCallback(async () => {
    const cats = await getCategories();
    setCategories(cats);
    const docs = await getDocuments(selectedCat || undefined, search || undefined, page, pageSize);
    setDocuments(docs.items);
    setTotal(docs.total);
    setTotalPages(docs.total_pages);
  }, [selectedCat, search, page]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleUpload = async (file: File, categoryId: string, onProgress?: (pct: number) => void) => {
    await uploadDocument(file, categoryId, onProgress);
    setPage(1);
    loadData();
  };

  const handleDelete = async (id: string) => {
    await deleteDocument(id);
    if (previewId === id) {
      setPreviewId(null);
      setPreviewContent(null);
    }
    loadData();
  };

  const handleSearch = (q: string) => {
    setSearch(q);
    setPage(1);
  };

  const handleCategorySelect = (catId: string | null) => {
    setSelectedCat(catId);
    setPage(1);
  };

  const handlePreview = async (doc: Document) => {
    if (previewId === doc.id) {
      setPreviewId(null);
      setPreviewContent(null);
      return;
    }
    setPreviewId(doc.id);
    setPreviewLoading(true);
    setPreviewError('');
    setPreviewContent(null);
    try {
      const content = await getDocumentContent(doc.id);
      setPreviewContent(content);
    } catch {
      setPreviewError('加载文档内容失败');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownload = (e: React.MouseEvent, doc: Document) => {
    e.stopPropagation();
    downloadDocument(doc.id, doc.title);
  };

  const handlePageChange = (p: number) => {
    if (p < 1 || p > totalPages) return;
    setPage(p);
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
      pdf: 'text-[var(--accent-red)]', docx: 'text-[var(--accent-blue)]', pptx: 'text-[var(--accent-orange)]', md: 'text-[var(--text-secondary)]', txt: 'text-[var(--text-secondary)]',
    };
    return colors[type] || 'text-[var(--text-secondary)]';
  };

  const pageNumbers = () => {
    const pages: (number | string)[] = [];
    const delta = 1;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== '...') {
        pages.push('...');
      }
    }
    return pages;
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">知识库</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">浏览和搜索销售辅助文档，支持预览、下载与 RAG 智能问答</p>
        </div>
        <button onClick={() => setShowChat(!showChat)} className="btn btn-secondary text-sm">
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v3.5A1.75 1.75 0 0 1 14.25 7H8.828l-3.063 2.757A.75.75 0 0 1 4.5 9.25V7h-.25A1.75 1.75 0 0 1 2.5 5.25v-3.5Z"/>
          </svg>
          {showChat ? '关闭问答' : '知识库问答'}
        </button>
      </div>

      {showChat && (
        <div className="mb-6">
          <ChatPanel />
        </div>
      )}

      <div className="space-y-4">
        {/* Upload + Search row */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <SearchBar value={search} onChange={handleSearch} placeholder="搜索文档标题、内容..." />
          </div>
          <DocumentUpload categories={categories} onUpload={handleUpload} />
        </div>

        {/* Category filter */}
        <CategoryNav categories={categories} selectedId={selectedCat} onSelect={handleCategorySelect} />

        {/* Documents table */}
        <div className="card rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th className="w-[35%]">文档名称</th>
                  <th className="hidden sm:table-cell">分类</th>
                  <th className="hidden sm:table-cell">类型</th>
                  <th className="text-right hidden md:table-cell">分块数</th>
                  <th className="text-right hidden md:table-cell">上传时间</th>
                  <th className="w-[120px] text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {documents.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <svg className="w-10 h-10 text-[var(--text-placeholder)] mb-3" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M3 1.75A1.75 1.75 0 0 1 4.75 0h6.086a1.75 1.75 0 0 1 1.238.513l3.414 3.414a1.75 1.75 0 0 1 .512 1.238V14.25A1.75 1.75 0 0 1 14.25 16H4.75A1.75 1.75 0 0 1 3 14.25Z"/>
                        </svg>
                        <p className="text-sm text-[var(--text-placeholder)]">暂无文档</p>
                        <p className="text-xs text-[var(--border-default)] mt-1">上传 PDF、DOCX、TXT、MD 或 PPTX 文件开始构建知识库</p>
                      </div>
                    </td>
                  </tr>
                )}
                {documents.map(doc => (
                  <tr key={doc.id} className={previewId === doc.id ? 'bg-[var(--bg-overlay)]' : ''}>
                    <td>
                      <button
                        onClick={() => handlePreview(doc)}
                        className="flex items-center gap-2.5 text-left hover:opacity-80 transition-opacity"
                      >
                        <svg className={`w-4 h-4 flex-shrink-0 ${typeColor(doc.file_type)}`} viewBox="0 0 16 16" fill="currentColor">
                          <path d={fileIcon(doc.file_type)} />
                        </svg>
                        <span className="text-sm font-medium text-[var(--accent-blue)] truncate max-w-[180px] sm:max-w-[300px] hover:underline">
                          {doc.title}
                        </span>
                      </button>
                    </td>
                    <td className="hidden sm:table-cell">
                      <span className="text-sm text-[var(--text-secondary)]">{doc.category_name || '--'}</span>
                    </td>
                    <td className="hidden sm:table-cell">
                      <span className="badge font-mono text-[10px]">{doc.file_type.toUpperCase()}</span>
                    </td>
                    <td className="text-right hidden md:table-cell">
                      <span className="text-sm text-[var(--text-tertiary)] font-mono tabular-nums">{doc.chunk_count}</span>
                    </td>
                    <td className="text-right hidden md:table-cell">
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {new Date(doc.created_at).toLocaleDateString('zh-CN')}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handlePreview(doc)}
                          className="btn btn-secondary text-[10px] px-2 py-1"
                          title="预览"
                        >
                          {previewId === doc.id ? '收起' : '预览'}
                        </button>
                        <button
                          onClick={(e) => handleDownload(e, doc)}
                          className="btn btn-secondary text-[10px] px-2 py-1"
                          title="下载"
                        >
                          下载
                        </button>
                        <button onClick={() => handleDelete(doc.id)} className="btn btn-danger text-[10px] px-2 py-1">
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Inline preview panel */}
          {previewId && (
            <div className="border-t border-[var(--border-subtle)] p-4 sm:p-5 bg-[var(--bg-secondary)]">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <svg className="w-4 h-4 text-[var(--text-tertiary)]" viewBox="0 0 16 16" fill="currentColor">
                    <path fillRule="evenodd" d="M2 2.5A1.5 1.5 0 0 1 3.5 1h5.086a1.5 1.5 0 0 1 1.06.44l2.122 2.121A1.5 1.5 0 0 1 12.207 5H14.5A1.5 1.5 0 0 1 16 6.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 2 13.5v-11Z"/>
                  </svg>
                  文档预览
                  {previewContent && <span className="text-[10px] text-[var(--text-placeholder)] font-normal">· {previewContent.file_type.toUpperCase()}</span>}
                </h4>
                <button
                  onClick={() => { setPreviewId(null); setPreviewContent(null); }}
                  className="text-[var(--text-placeholder)] hover:text-[var(--text-secondary)] transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>
                  </svg>
                </button>
              </div>
              {previewLoading ? (
                <div className="text-center py-8">
                  <p className="text-sm text-[var(--text-secondary)]">加载中...</p>
                </div>
              ) : previewError ? (
                <div className="text-center py-8">
                  <p className="text-sm text-[var(--accent-red)]">{previewError}</p>
                </div>
              ) : previewContent ? (
                <div className="max-h-[400px] overflow-y-auto bg-[var(--bg-primary)] rounded-xl p-4 border border-[var(--border-subtle)]">
                  <pre className="text-xs text-[var(--text-primary)] whitespace-pre-wrap font-sans leading-relaxed break-words">
                    {previewContent.content}
                  </pre>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-[var(--text-placeholder)]">共 {total} 条文档</span>
            <div className="flex items-center gap-1 flex-wrap">
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1}
                className="px-2 py-1 text-xs rounded-full border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
              >
                &laquo;
              </button>
              {pageNumbers().map((p, idx) =>
                typeof p === 'number' ? (
                  <button
                    key={p}
                    onClick={() => handlePageChange(p)}
                    className={`w-7 h-7 text-xs rounded-full transition-all duration-200 ${
                      p === page
                        ? 'bg-[var(--btn-blue)] text-white shadow-[var(--shadow-btn)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                    }`}
                  >
                    {p}
                  </button>
                ) : (
                  <span key={`dots-${idx}`} className="px-0.5 text-[10px] text-[var(--text-placeholder)] select-none">&hellip;</span>
                )
              )}
              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages}
                className="px-2 py-1 text-xs rounded-full border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
              >
                &raquo;
              </button>
              <span className="text-[10px] text-[var(--text-placeholder)] ml-2">{page}/{totalPages} 页</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
