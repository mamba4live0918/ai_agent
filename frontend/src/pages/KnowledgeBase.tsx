import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { getCategories, createCategory, deleteCategory, uploadCategoryIcon, getDocuments, getDocumentContent, getDocumentBlobUrl, downloadDocument, uploadDocument, deleteDocument, updateDocumentCategories } from '../services/api';
import type { Category, Document, DocumentContent, CategoryTreeNode } from '../types';
import CategoryIcon from '../components/CategoryIcon';
import SearchBar from '../components/SearchBar';
import DocumentUpload from '../components/DocumentUpload';

import ChatPanel from '../components/ChatPanel';
import PdfPreview from '../components/PdfPreview';
import QuizPanel from '../components/QuizPanel';

export default function KnowledgeBase() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Add category state
  const [showAddCat, setShowAddCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('📁');
  const [newCatParentId, setNewCatParentId] = useState('');
  const [addingCat, setAddingCat] = useState(false);
  const [addCatError, setAddCatError] = useState('');
  const iconFileRef = useRef<HTMLInputElement>(null);
  const [iconUploading, setIconUploading] = useState(false);

  // Folder expand state
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  // Move doc categories state
  const [editingDocCatIds, setEditingDocCatIds] = useState<string[]>([]);
  const [movingDocId, setMovingDocId] = useState<string | null>(null);

  // Preview state
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<DocumentContent | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

  const pageSize = 20;

  const loadData = useCallback(async () => {
    const cats = await getCategories();
    setCategories(cats);
    const docs = await getDocuments(selectedCat || undefined, search || undefined, page, pageSize, false);
    setDocuments(docs.items);
    setTotal(docs.total);
    setTotalPages(docs.total_pages);
  }, [selectedCat, search, page]);

  useEffect(() => { loadData(); }, [loadData]);

  // Recent docs tracking — stored fully in localStorage so available regardless of pagination
  type RecentDoc = { id: string; title: string; file_type: string; category_names: string[]; created_at: string };
  const RECENT_KEY = 'kb_recent_docs';
  const [recentDocs, setRecentDocs] = useState<RecentDoc[]>(() => {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }
    catch { return []; }
  });

  const recordAccess = (doc: RecentDoc) => {
    setRecentDocs(prev => {
      const next = [doc, ...prev.filter(d => d.id !== doc.id)].slice(0, 30);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleUpload = async (file: File, categoryId: string, onProgress?: (pct: number) => void) => {
    const result = await uploadDocument(file, categoryId, onProgress);
    if (result?.id) recordAccess({ id: result.id, title: result.title, file_type: result.file_type, category_names: result.category_names || [], created_at: result.created_at });
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

  const handleAddCategory = async () => {
    if (!newCatName.trim() || addingCat) return;
    setAddingCat(true);
    setAddCatError('');
    try {
      await createCategory({ name: newCatName.trim(), icon: newCatIcon || undefined, parent_id: newCatParentId || undefined });
      setNewCatName('');
      setNewCatIcon('📁');
      setNewCatParentId('');
      setShowAddCat(false);
      const cats = await getCategories();
      setCategories(cats);
    } catch (e: unknown) {
      setAddCatError(e instanceof Error ? e.message : '添加失败');
    } finally {
      setAddingCat(false);
    }
  };

  const handleIconFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!newCatName.trim()) {
      setAddCatError('请先输入分类名称再上传图片');
      if (iconFileRef.current) iconFileRef.current.value = '';
      return;
    }
    setIconUploading(true);
    setAddCatError('');
    try {
      const cat = await createCategory({ name: newCatName.trim(), icon: newCatIcon || undefined, parent_id: newCatParentId || undefined });
      const result = await uploadCategoryIcon(cat.id, file);
      setNewCatIcon(result.icon);
      setNewCatName('');
      setNewCatParentId('');
      setShowAddCat(false);
      const cats = await getCategories();
      setCategories(cats);
    } catch (e: unknown) {
      setAddCatError(e instanceof Error ? e.message : '上传失败');
    } finally {
      setIconUploading(false);
      if (iconFileRef.current) iconFileRef.current.value = '';
    }
  };

  const handleDeleteCategory = async (catId: string) => {
    try {
      await deleteCategory(catId);
      if (selectedCat === catId) setSelectedCat(null);
      const cats = await getCategories();
      setCategories(cats);
      loadData();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '删除失败');
    }
  };

  const handleMoveDocCategories = async () => {
    if (!movingDocId) return;
    try {
      await updateDocumentCategories(movingDocId, editingDocCatIds);
      setMovingDocId(null);
      loadData();
    } catch {
      /* ignore */
    }
  };

  const closePreview = () => {
    setPreviewId(null);
    setPreviewContent(null);
    if (pdfPreviewUrl && pdfPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(pdfPreviewUrl);
    }
    setPdfPreviewUrl(null);
    setPreviewError('');
  };

  const handleDownload = (doc: Document) => {
    downloadDocument(doc.id, doc.title);
  };

  const handlePreview = async (doc: Document) => {
    recordAccess({ id: doc.id, title: doc.title, file_type: doc.file_type, category_names: doc.category_names, created_at: doc.created_at });
    if (previewId === doc.id) {
      closePreview();
      return;
    }
    closePreview();
    setPreviewId(doc.id);

    if (doc.file_type.toLowerCase() === 'pdf') {
      setPreviewLoading(true);
      try {
        const url = await getDocumentBlobUrl(doc.id);
        setPdfPreviewUrl(url);
      } catch {
        setPreviewError('PDF 加载失败');
      } finally {
        setPreviewLoading(false);
      }
      return;
    }

    setPreviewLoading(true);
    setPreviewError('');
    try {
      const content = await getDocumentContent(doc.id);
      setPreviewContent(content);
    } catch {
      setPreviewError('加载文档内容失败');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handlePageChange = (p: number) => {
    if (p < 1 || p > totalPages) return;
    setPage(p);
  };

  const fileIcon = (type: string) => {
    const icons: Record<string, string> = {
      pdf: 'M4 4a2 2 0 0 1 2-2h4.172a2 2 0 0 1 1.414.586l2.828 2.828A2 2 0 0 1 15 6.828V12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Z',
      doc: 'M4 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Z',
      docx: 'M4 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Z',
      ppt: 'M3 2.5A1.5 1.5 0 0 1 4.5 1h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12A1.5 1.5 0 0 1 12 4.622V13.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 2 13.5v-11Z',
      pptx: 'M3 2.5A1.5 1.5 0 0 1 4.5 1h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12A1.5 1.5 0 0 1 12 4.622V13.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 2 13.5v-11Z',
      xls: 'M3 3.5A1.5 1.5 0 0 1 4.5 2h7A1.5 1.5 0 0 1 13 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 12.5v-9Z',
      xlsx: 'M3 3.5A1.5 1.5 0 0 1 4.5 2h7A1.5 1.5 0 0 1 13 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 12.5v-9Z',
      xlsm: 'M3 3.5A1.5 1.5 0 0 1 4.5 2h7A1.5 1.5 0 0 1 13 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 12.5v-9Z',
      csv: 'M3 3.5A1.5 1.5 0 0 1 4.5 2h7A1.5 1.5 0 0 1 13 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 12.5v-9Z',
      md: 'M3 1.75A1.75 1.75 0 0 1 4.75 0h6.086a1.75 1.75 0 0 1 1.238.513l3.414 3.414a1.75 1.75 0 0 1 .512 1.238V14.25A1.75 1.75 0 0 1 14.25 16H4.75A1.75 1.75 0 0 1 3 14.25Z',
      txt: 'M3 1.75A1.75 1.75 0 0 1 4.75 0h6.086a1.75 1.75 0 0 1 1.238.513l3.414 3.414a1.75 1.75 0 0 1 .512 1.238V14.25A1.75 1.75 0 0 1 14.25 16H4.75A1.75 1.75 0 0 1 3 14.25Z',
    };
    return icons[type] || icons.txt;
  };

  const typeColor = (type: string) => {
    const colors: Record<string, string> = {
      pdf: 'text-[var(--accent-red)]',
      doc: 'text-[var(--accent-blue)]',
      docx: 'text-[var(--accent-blue)]',
      ppt: 'text-[var(--accent-orange)]',
      pptx: 'text-[var(--accent-orange)]',
      xls: 'text-[var(--accent-green)]',
      xlsx: 'text-[var(--accent-green)]',
      xlsm: 'text-[var(--accent-green)]',
      csv: 'text-[var(--accent-green)]',
      md: 'text-[var(--text-secondary)]',
      txt: 'text-[var(--text-secondary)]',
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

  // Build category tree and doc index
  const categoryTree = useMemo(() => {
    const map = new Map<string, CategoryTreeNode>();
    const roots: CategoryTreeNode[] = [];
    for (const cat of categories) {
      map.set(cat.id, { ...cat, children: [] });
    }
    for (const cat of categories) {
      const node = map.get(cat.id)!;
      if (cat.parent_id && map.has(cat.parent_id)) {
        map.get(cat.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    const sortRecursive = (nodes: CategoryTreeNode[]) => {
      nodes.sort((a, b) => a.sort_order - b.sort_order);
      nodes.forEach(n => sortRecursive(n.children));
    };
    sortRecursive(roots);
    return roots;
  }, [categories]);

  const docsByCategory = useMemo(() => {
    const map = new Map<string, Document[]>();
    for (const doc of documents) {
      for (const cid of doc.category_ids) {
        if (!map.has(cid)) map.set(cid, []);
        map.get(cid)!.push(doc);
      }
    }
    return map;
  }, [documents]);

  const uncategorized = useMemo(() => documents.filter(d => d.category_ids.length === 0), [documents]);

  const toggleFolder = (cid: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(cid)) next.delete(cid); else next.add(cid);
      return next;
    });
  };

  const collectAllIds = (nodes: CategoryTreeNode[]): string[] => {
    const ids: string[] = [];
    for (const node of nodes) {
      ids.push(node.id);
      ids.push(...collectAllIds(node.children));
    }
    return ids;
  };

  const allIds = useMemo(() => collectAllIds(categoryTree), [categoryTree]);
  const allExpanded = allIds.length > 0 && allIds.every(id => expandedFolders.has(id))
    && (uncategorized.length === 0 || expandedFolders.has('__uncategorized__'));
  const hasAnyExpanded = expandedFolders.size > 0;

  const expandAll = () => {
    const all = new Set(allIds);
    if (uncategorized.length > 0) all.add('__uncategorized__');
    if (recentDocs.length > 0) all.add('__recent__');
    setExpandedFolders(all);
  };

  const collapseAll = () => {
    setExpandedFolders(new Set());
  };

  const handleAddChildCategory = (parentId: string, parentName: string) => {
    setNewCatName('');
    setNewCatIcon('📁');
    setNewCatParentId(parentId);
    setAddCatError('');
    setShowAddCat(true);
  };

  // Recursive category node renderer
  const renderCategoryNode = (node: CategoryTreeNode, depth: number) => {
    const isExpanded = expandedFolders.has(node.id);
    const hasChildren = node.children.length > 0;
    const childDocs = docsByCategory.get(node.id) || [];
    const canExpand = hasChildren || childDocs.length > 0;

    return (
      <div key={node.id}>
        {/* Folder row */}
        <div className="flex items-center gap-0.5 group/tree">
          <button
            onClick={() => toggleFolder(node.id)}
            className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--bg-secondary)]/60 transition-colors min-w-0"
          >
            <svg
              className={`w-3 h-3 text-[var(--text-tertiary)] flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''} ${!canExpand ? 'invisible' : ''}`}
              viewBox="0 0 16 16" fill="currentColor"
            >
              <path d="M6.47 3.47a.75.75 0 0 1 1.06 0l4 4a.75.75 0 0 1 0 1.06l-4 4a.75.75 0 0 1-1.06-1.06L9.94 8 6.47 4.53a.75.75 0 0 1 0-1.06Z"/>
            </svg>
            <CategoryIcon icon={node.icon} className="text-base flex-shrink-0" />
            <span className="text-sm font-semibold text-[var(--text-primary)] truncate">{node.name}</span>
            <span className="text-[11px] font-mono text-[var(--text-placeholder)] tabular-nums flex-shrink-0 ml-auto">
              {node.document_count || childDocs.length}
            </span>
          </button>
          {/* Add child category button */}
          {!editing && (
            <button
              onClick={(e) => { e.stopPropagation(); handleAddChildCategory(node.id, node.name); }}
              className="w-5 h-5 inline-flex items-center justify-center text-[10px] text-[var(--text-placeholder)] hover:text-[var(--accent-blue)] rounded-full hover:bg-[var(--btn-blue)]/10 transition-colors opacity-0 group-hover/tree:opacity-100"
              title={`在「${node.name}」下添加子分类`}
            >
              <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z"/></svg>
            </button>
          )}
          {editing && (
            <div className="relative flex-shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); setDeleting(deleting === node.id ? null : node.id); }}
                className="w-5 h-5 inline-flex items-center justify-center text-[10px] text-[var(--text-placeholder)] hover:text-[var(--accent-red)] rounded-full hover:bg-[var(--accent-red)]/10 transition-colors"
                title="删除分类"
              >
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/></svg>
              </button>
              {deleting === node.id && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 z-30 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl shadow-lg p-3 min-w-[160px] text-center">
                  <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-[var(--bg-primary)] border-l border-t border-[var(--border-subtle)]" />
                  <p className="text-xs text-[var(--text-primary)] mb-2.5">确定删除「<span className="font-semibold">{node.name}</span>」？</p>
                  <p className="text-[10px] text-[var(--text-placeholder)] mb-3">其中的文档将移入未分类{node.children_count > 0 ? '，子分类将提升至上一级' : ''}</p>
                  <div className="flex items-center justify-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteCategory(node.id); setDeleting(null); }} className="px-3 py-1 text-[11px] rounded-full bg-[var(--accent-red)] text-white hover:opacity-90 transition-opacity">确认删除</button>
                    <button onClick={(e) => { e.stopPropagation(); setDeleting(null); }} className="px-3 py-1 text-[11px] rounded-full border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors">取消</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Expanded children: docs + sub-categories */}
        {isExpanded && (
          <div className="ml-4 pl-3 border-l-2 border-[var(--border-subtle)]">
            {childDocs.length === 0 && !hasChildren && (
              <div className="px-2 py-3 text-center">
                <p className="text-[11px] text-[var(--text-placeholder)]">空文件夹</p>
              </div>
            )}
            {/* Document rows */}
            {childDocs.map(doc => (
              <div
                key={`${node.id}-${doc.id}`}
                className={`flex items-center gap-2 pl-2 pr-1 py-1.5 rounded-md hover:bg-[var(--bg-secondary)]/40 transition-colors group/doc ${previewId === doc.id ? 'bg-[var(--bg-overlay)]' : ''}`}
              >
                <svg className={`w-3.5 h-3.5 flex-shrink-0 ${typeColor(doc.file_type)}`} viewBox="0 0 16 16" fill="currentColor">
                  <path d={fileIcon(doc.file_type)} />
                </svg>
                <button onClick={() => handlePreview(doc)} className="flex-1 min-w-0 text-left">
                  <span className="text-[13px] text-[var(--accent-blue)] truncate block hover:underline">{doc.title}</span>
                </button>
                <span className="hidden sm:inline-flex badge font-mono text-[10px] flex-shrink-0">{doc.file_type.toUpperCase()}</span>
                {doc.category_names.length > 1 && (
                  <span className="hidden lg:inline-flex items-center gap-0.5 flex-shrink-0" title={doc.category_names.filter(n => n !== node.name).join(', ')}>
                    {doc.category_names.filter(n => n !== node.name).slice(0, 2).map(name => (
                      <span key={name} className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">{name}</span>
                    ))}
                    {doc.category_names.filter(n => n !== node.name).length > 2 && (
                      <span className="text-[10px] text-[var(--text-placeholder)]">+{doc.category_names.filter(n => n !== node.name).length - 2}</span>
                    )}
                  </span>
                )}
                <span className="hidden md:inline text-[10px] text-[var(--text-tertiary)] flex-shrink-0 tabular-nums">
                  {new Date(doc.created_at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}
                </span>
                <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover/doc:opacity-100 transition-opacity">
                  <button onClick={() => handlePreview(doc)} className="w-5 h-5 inline-flex items-center justify-center rounded text-[var(--text-placeholder)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors" title="预览">
                    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3C4.5 3 1.5 5.5.5 8c1 2.5 4 5 7.5 5s6.5-2.5 7.5-5c-1-2.5-4-5-7.5-5ZM8 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"/><path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/></svg>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleDownload(doc); }} className="w-5 h-5 inline-flex items-center justify-center rounded text-[var(--text-placeholder)] hover:text-[var(--accent-blue)] hover:bg-[var(--btn-blue)]/10 transition-colors" title="下载">
                    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor"><path d="M7.75 2A.75.75 0 0 0 7 2.75v5.69L4.53 5.97a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 1 0-1.06-1.06L8.5 8.44V2.75A.75.75 0 0 0 7.75 2Z"/><path d="M2 10.75a.75.75 0 0 1 1.5 0v1.5a.25.25 0 0 0 .25.25h8.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 1.5 11.75v-1.5Z"/></svg>
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => { setMovingDocId(movingDocId === doc.id ? null : doc.id); setEditingDocCatIds([...doc.category_ids]); }}
                      className={`w-5 h-5 inline-flex items-center justify-center rounded transition-colors ${movingDocId === doc.id ? 'text-[var(--accent-blue)] bg-[var(--btn-blue)]/10' : 'text-[var(--text-placeholder)] hover:text-[var(--accent-blue)] hover:bg-[var(--btn-blue)]/10'}`}
                      title="移动到分类"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10Z"/></svg>
                    </button>
                    {movingDocId === doc.id && (
                      <div className="absolute bottom-full right-0 mb-2 z-20 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl shadow-lg p-3 min-w-[200px]">
                        <p className="text-[11px] font-medium text-[var(--text-primary)] mb-2">移动到分类</p>
                        <div className="max-h-36 overflow-y-auto mb-2 space-y-1">
                          {categories.map(c => (
                            <label key={c.id} className="flex items-center gap-2 px-1 py-0.5 text-xs text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-secondary)] rounded transition-colors">
                              <input type="checkbox" checked={editingDocCatIds.includes(c.id)} onChange={() => { setEditingDocCatIds(prev => prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id]); }} className="w-3 h-3 rounded accent-[var(--accent-blue)]" />
                              <CategoryIcon icon={c.icon} />
                              {c.name}
                            </label>
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button onClick={handleMoveDocCategories} className="flex-1 px-2 py-1 text-[10px] rounded-full bg-[var(--btn-primary)] text-white hover:bg-[var(--btn-primary-hover)] transition-colors">确定</button>
                          <button onClick={() => setMovingDocId(null)} className="px-2 py-1 text-[10px] rounded-full text-[var(--text-placeholder)] hover:text-[var(--text-primary)] transition-colors">取消</button>
                        </div>
                      </div>
                    )}
                  </div>
                  <button onClick={() => handleDelete(doc.id)} className="w-5 h-5 inline-flex items-center justify-center rounded text-[var(--text-placeholder)] hover:text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10 transition-colors" title="删除">
                    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor"><path d="M6.5 1.75a.25.25 0 0 1 .25-.25h2.5a.25.25 0 0 1 .25.25V3h-3V1.75Zm4.5 0V3h3.25a.75.75 0 0 1 0 1.5h-.8l-.75 9.5A1.75 1.75 0 0 1 10.97 15.5H5.03a1.75 1.75 0 0 1-1.73-1.5L2.55 4.5H1.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.06 4.5l.73 9.13a.25.25 0 0 0 .24.22h5.97a.25.25 0 0 0 .24-.22l.73-9.13H4.06Z"/></svg>
                  </button>
                </div>
              </div>
            ))}
            {/* Recursive child categories */}
            {node.children.map(child => renderCategoryNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">知识库</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">浏览和搜索销售辅助文档，支持预览、下载与 RAG 智能问答</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setShowQuiz(!showQuiz); if (!showQuiz) setShowChat(false); }} className="btn btn-secondary text-sm">
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M0 1.5A1.5 1.5 0 0 1 1.5 0h13A1.5 1.5 0 0 1 16 1.5v9a1.5 1.5 0 0 1-1.5 1.5H5.207L2.56 14.522A.75.75 0 0 1 1.25 14V12H1.5A1.5 1.5 0 0 1 0 10.5v-9Zm2.25 1a.25.25 0 0 0-.25.25v.75h.75a.75.75 0 0 1 0 1.5H2v1h.75a.75.75 0 0 1 0 1.5H2v1h.75a.75.75 0 0 1 0 1.5H2v.75c0 .138.112.25.25.25H4.5v-1.25a.75.75 0 0 1 1.5 0V11h1.75a.75.75 0 0 1 0 1.5H6v1.25c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-9a.25.25 0 0 0-.25-.25H2.25Z" clipRule="evenodd"/>
            </svg>
            {showQuiz ? '关闭练习' : '知识库练习'}
          </button>
          <button onClick={() => { setShowChat(!showChat); if (!showChat) setShowQuiz(false); }} className="btn btn-secondary text-sm">
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
              <path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v3.5A1.75 1.75 0 0 1 14.25 7H8.828l-3.063 2.757A.75.75 0 0 1 4.5 9.25V7h-.25A1.75 1.75 0 0 1 2.5 5.25v-3.5Z"/>
            </svg>
            {showChat ? '关闭问答' : '知识库问答'}
          </button>
        </div>
      </div>

      {/* Quiz floating panel */}
      {showQuiz && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" onClick={() => setShowQuiz(false)} />
          <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
            <div className="pointer-events-auto w-[480px] max-w-[calc(100vw-32px)] max-h-[85vh] bg-[var(--bg-primary)] rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.12)] border border-[var(--border-subtle)] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-subtle)] flex-shrink-0 select-none">
            <h3 className="text-xs font-semibold text-[var(--text-primary)]">知识库练习</h3>
            <button
              onClick={() => setShowQuiz(false)}
              className="w-6 h-6 flex items-center justify-center rounded-full text-[var(--text-placeholder)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/></svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <QuizPanel documents={documents} categories={categories} />
          </div>
          </div>
        </div>
        </>
      )}

      {/* Chat floating panel */}
      {showChat && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" onClick={() => setShowChat(false)} />
          <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
            <div className="pointer-events-auto w-[480px] max-w-[calc(100vw-32px)] h-[560px] max-h-[85vh] bg-[var(--bg-primary)] rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.12)] border border-[var(--border-subtle)] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-subtle)] flex-shrink-0 select-none">
            <h3 className="text-xs font-semibold text-[var(--text-primary)]">知识库问答</h3>
            <button
              onClick={() => setShowChat(false)}
              className="w-6 h-6 flex items-center justify-center rounded-full text-[var(--text-placeholder)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/></svg>
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <ChatPanel />
          </div>
          </div>
        </div>
        </>
      )}

      {/* Main framed content */}
      <div className="card rounded-2xl border-2 border-solid border-[var(--border-subtle)] shadow-sm overflow-hidden">
        {/* Toolbar: Search + Upload */}
        <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-0">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <SearchBar value={search} onChange={handleSearch} placeholder="搜索文档标题、内容..." />
            </div>
            <DocumentUpload categories={categories} onUpload={handleUpload} />
          </div>
        </div>

        {/* Tree header */}
        <div className="flex items-center justify-between px-4 sm:px-6 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">文档目录</span>
            <span className="text-[10px] font-mono text-[var(--text-placeholder)] tabular-nums">{total} 个文件</span>
          </div>
          <div className="flex items-center gap-1.5">
            {hasAnyExpanded ? (
              <button onClick={collapseAll} className="text-[10px] text-[var(--text-placeholder)] hover:text-[var(--text-primary)] transition-colors px-1.5 py-0.5">
                全部折叠
              </button>
            ) : (
              <button onClick={expandAll} className="text-[10px] text-[var(--text-placeholder)] hover:text-[var(--text-primary)] transition-colors px-1.5 py-0.5">
                全部展开
              </button>
            )}
            <button
              onClick={() => setEditing(!editing)}
              className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                editing
                  ? 'text-[var(--accent-red)]'
                  : 'text-[var(--text-placeholder)] hover:text-[var(--text-primary)]'
              }`}
            >
              {editing ? '完成编辑' : '编辑分类'}
            </button>
            <button
              onClick={() => { setShowAddCat(!showAddCat); setAddCatError(''); }}
              className="text-[10px] px-2 py-0.5 rounded-full border border-dashed border-[var(--border-default)] text-[var(--text-placeholder)] hover:text-[var(--text-primary)] hover:border-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)] transition-colors"
            >
              + 添加分类
            </button>
          </div>
        </div>

        {/* Add category inline form */}
        {showAddCat && (
          <div className="mx-4 sm:mx-6 mb-2 p-3 rounded-xl border border-dashed border-[var(--accent-blue)]/40 bg-[var(--bg-secondary)]/50">
            <div className="flex flex-col gap-2">
              {/* Row 1: Name + Parent selector */}
              <div className="flex items-center gap-2">
                <span className="text-lg flex-shrink-0">{newCatIcon || '📁'}</span>
                <input
                  type="text"
                  value={newCatName}
                  onChange={e => { setNewCatName(e.target.value); setAddCatError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); if (e.key === 'Escape') { setShowAddCat(false); setNewCatName(''); setNewCatIcon('📁'); setNewCatParentId(''); setAddCatError(''); } }}
                  placeholder="分类名称..."
                  autoFocus
                  className="flex-1 h-9 px-3 py-1 text-sm rounded-full border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)] transition-colors min-w-0"
                />
                <select
                  value={newCatParentId}
                  onChange={e => setNewCatParentId(e.target.value)}
                  className="h-9 pl-3 pr-8 py-1 text-sm rounded-full border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)] transition-colors w-auto"
                >
                  <option value="">无父分类（顶层）</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              {/* Row 2: Icon picker + Actions */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {['📁','📊','💰','💬','📖','🎯','⚖️','📈','🔧','💡','🛡️','🏆','📋','🔍','💼','🎓','⭐','📝'].map(icon => (
                  <button
                    key={icon}
                    onClick={() => setNewCatIcon(icon === newCatIcon ? '' : icon)}
                    className={`w-6 h-6 flex items-center justify-center rounded text-sm transition-colors ${
                      newCatIcon === icon
                        ? 'bg-[var(--accent-blue)]/20 ring-1 ring-[var(--accent-blue)]'
                        : 'hover:bg-[var(--bg-tertiary)]'
                    }`}
                  >
                    {icon}
                  </button>
                ))}
                <label className={`w-6 h-6 flex items-center justify-center rounded text-xs cursor-pointer transition-colors border border-dashed border-[var(--border-default)] hover:border-[var(--accent-blue)] hover:bg-[var(--btn-blue)]/5 ${
                  iconUploading ? 'opacity-50 pointer-events-none' : ''
                }`} title="上传图片">
                  {iconUploading ? (
                    <div className="w-3 h-3 border border-[var(--accent-blue)] border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-3 h-3 text-[var(--text-placeholder)]" viewBox="0 0 16 16" fill="currentColor"><path d="M6.002 5.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z"/><path fillRule="evenodd" d="M1.5 2A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 14.5 2h-13Zm13 1H1.5a.5.5 0 0 0-.5.5v6l.95-.87a2 2 0 0 1 2.72.08l2.06 2.01 1.57-2.99a2 2 0 0 1 3.32-.35L14 9.73V3.5a.5.5 0 0 0-.5-.5Z"/></svg>
                  )}
                  <input ref={iconFileRef} type="file" accept="image/*" className="hidden" onChange={handleIconFileUpload} disabled={iconUploading} />
                </label>
                <div className="flex items-center gap-1.5 ml-auto">
                  <button onClick={handleAddCategory} disabled={!newCatName.trim() || addingCat} className="h-7 px-3 text-xs rounded-full bg-[var(--btn-primary)] text-white hover:bg-[var(--btn-primary-hover)] disabled:opacity-50 transition-colors">
                    {addingCat ? '...' : '确认'}
                  </button>
                  <button onClick={() => { setShowAddCat(false); setNewCatName(''); setNewCatIcon('📁'); setNewCatParentId(''); setAddCatError(''); }} className="h-7 px-2 text-xs rounded-full text-[var(--text-placeholder)] hover:text-[var(--text-primary)] transition-colors">
                    取消
                  </button>
                </div>
              </div>
            </div>
            {addCatError && <p className="text-[10px] text-[var(--accent-red)] mt-1.5">{addCatError}</p>}
          </div>
        )}

        {/* Separator */}
        <div className="mx-4 sm:mx-6 border-t border-[var(--border-subtle)]" />

        {/* File tree */}
        <div className="px-2 sm:px-4 py-2">
          {documents.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <svg className="w-10 h-10 text-[var(--text-placeholder)] mb-3" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3 1.75A1.75 1.75 0 0 1 4.75 0h6.086a1.75 1.75 0 0 1 1.238.513l3.414 3.414a1.75 1.75 0 0 1 .512 1.238V14.25A1.75 1.75 0 0 1 14.25 16H4.75A1.75 1.75 0 0 1 3 14.25Z"/>
              </svg>
              <p className="text-sm text-[var(--text-placeholder)]">暂无文档</p>
              <p className="text-xs text-[var(--border-default)] mt-1">上传 PDF、DOCX、TXT、MD 或 PPTX 文件开始构建知识库</p>
            </div>
          )}

          {/* Recent documents */}
          {recentDocs.length > 0 && (
            <div className="mb-2">
              <button
                onClick={() => toggleFolder('__recent__')}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--bg-secondary)]/60 transition-colors w-full"
              >
                <svg
                  className={`w-3 h-3 text-[var(--text-tertiary)] flex-shrink-0 transition-transform duration-200 ${expandedFolders.has('__recent__') ? 'rotate-90' : ''}`}
                  viewBox="0 0 16 16" fill="currentColor"
                >
                  <path d="M6.47 3.47a.75.75 0 0 1 1.06 0l4 4a.75.75 0 0 1 0 1.06l-4 4a.75.75 0 0 1-1.06-1.06L9.94 8 6.47 4.53a.75.75 0 0 1 0-1.06Z"/>
                </svg>
                <svg className="w-3.5 h-3.5 text-[var(--text-tertiary)] flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14Zm.75-7.75V3.5a.75.75 0 0 0-1.5 0v4a.75.75 0 0 0 .22.53l2.5 2.5a.75.75 0 0 0 1.06-1.06L8.75 7.25Z"/>
                </svg>
                <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">最近文档</span>
                <span className="text-[11px] font-mono text-[var(--text-placeholder)] tabular-nums ml-auto">{recentDocs.length}</span>
              </button>
              {expandedFolders.has('__recent__') && (
              <div className="ml-4 pl-3 border-l-2 border-[var(--border-subtle)]">
                {recentDocs.map(doc => (
                  <div
                    key={`recent-${doc.id}`}
                    className={`flex items-center gap-2 pl-2 pr-1 py-1.5 rounded-md hover:bg-[var(--bg-secondary)]/40 transition-colors group/doc ${previewId === doc.id ? 'bg-[var(--bg-overlay)]' : ''}`}
                  >
                    <svg className={`w-3.5 h-3.5 flex-shrink-0 ${typeColor(doc.file_type)}`} viewBox="0 0 16 16" fill="currentColor">
                      <path d={fileIcon(doc.file_type)} />
                    </svg>
                    <button onClick={() => handlePreview(doc)} className="flex-1 min-w-0 text-left">
                      <span className="text-[13px] text-[var(--accent-blue)] truncate block hover:underline">{doc.title}</span>
                    </button>
                    <span className="hidden sm:inline-flex badge font-mono text-[10px] flex-shrink-0">{doc.file_type.toUpperCase()}</span>
                    {doc.category_names.length > 0 && (
                      <span className="hidden lg:inline-flex items-center gap-0.5 flex-shrink-0">
                        {doc.category_names.slice(0, 2).map(name => (
                          <span key={name} className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">{name}</span>
                        ))}
                      </span>
                    )}
                    <span className="hidden md:inline text-[10px] text-[var(--text-tertiary)] flex-shrink-0 tabular-nums">
                      {new Date(doc.created_at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}
                    </span>
                    <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover/doc:opacity-100 transition-opacity">
                      <button onClick={() => handlePreview(doc)} className="w-5 h-5 inline-flex items-center justify-center rounded text-[var(--text-placeholder)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors" title="预览">
                        <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3C4.5 3 1.5 5.5.5 8c1 2.5 4 5 7.5 5s6.5-2.5 7.5-5c-1-2.5-4-5-7.5-5ZM8 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"/><path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/></svg>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleDownload(doc); }} className="w-5 h-5 inline-flex items-center justify-center rounded text-[var(--text-placeholder)] hover:text-[var(--accent-blue)] hover:bg-[var(--btn-blue)]/10 transition-colors" title="下载">
                        <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor"><path d="M7.75 2A.75.75 0 0 0 7 2.75v5.69L4.53 5.97a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 1 0-1.06-1.06L8.5 8.44V2.75A.75.75 0 0 0 7.75 2Z"/><path d="M2 10.75a.75.75 0 0 1 1.5 0v1.5a.25.25 0 0 0 .25.25h8.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 1.5 11.75v-1.5Z"/></svg>
                      </button>
                      <button onClick={() => handleDelete(doc.id)} className="w-5 h-5 inline-flex items-center justify-center rounded text-[var(--text-placeholder)] hover:text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10 transition-colors" title="删除">
                        <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor"><path d="M6.5 1.75a.25.25 0 0 1 .25-.25h2.5a.25.25 0 0 1 .25.25V3h-3V1.75Zm4.5 0V3h3.25a.75.75 0 0 1 0 1.5h-.8l-.75 9.5A1.75 1.75 0 0 1 10.97 15.5H5.03a1.75 1.75 0 0 1-1.73-1.5L2.55 4.5H1.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.06 4.5l.73 9.13a.25.25 0 0 0 .24.22h5.97a.25.25 0 0 0 .24-.22l.73-9.13H4.06Z"/></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              )}
            </div>
          )}

          {/* Category tree */}
          {categoryTree.map(node => renderCategoryNode(node, 0))}

          {/* Uncategorized */}
          {uncategorized.length > 0 && (
            <div>
              <button
                onClick={() => toggleFolder('__uncategorized__')}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--bg-secondary)]/60 transition-colors group/tree"
              >
                <svg
                  className={`w-3 h-3 text-[var(--text-tertiary)] flex-shrink-0 transition-transform duration-200 ${expandedFolders.has('__uncategorized__') ? 'rotate-90' : ''}`}
                  viewBox="0 0 16 16" fill="currentColor"
                >
                  <path d="M6.47 3.47a.75.75 0 0 1 1.06 0l4 4a.75.75 0 0 1 0 1.06l-4 4a.75.75 0 0 1-1.06-1.06L9.94 8 6.47 4.53a.75.75 0 0 1 0-1.06Z"/>
                </svg>
                <span className="text-lg flex-shrink-0">📁</span>
                <span className="text-sm font-semibold text-[var(--text-secondary)]">未分类</span>
                <span className="text-[11px] font-mono text-[var(--text-placeholder)] tabular-nums ml-auto">{uncategorized.length}</span>
              </button>
              {expandedFolders.has('__uncategorized__') && (
                <div className="ml-4 pl-3 border-l-2 border-[var(--border-subtle)]">
                  {uncategorized.map(doc => (
                    <div
                      key={`uncat-${doc.id}`}
                      className={`flex items-center gap-2 pl-2 pr-1 py-1.5 rounded-md hover:bg-[var(--bg-secondary)]/40 transition-colors group/doc ${previewId === doc.id ? 'bg-[var(--bg-overlay)]' : ''}`}
                    >
                      <svg className={`w-3.5 h-3.5 flex-shrink-0 ${typeColor(doc.file_type)}`} viewBox="0 0 16 16" fill="currentColor">
                        <path d={fileIcon(doc.file_type)} />
                      </svg>
                      <button onClick={() => handlePreview(doc)} className="flex-1 min-w-0 text-left">
                        <span className="text-[13px] text-[var(--accent-blue)] truncate block hover:underline">{doc.title}</span>
                      </button>
                      <span className="hidden sm:inline-flex badge font-mono text-[10px] flex-shrink-0">{doc.file_type.toUpperCase()}</span>
                      <span className="hidden md:inline text-[10px] text-[var(--text-tertiary)] flex-shrink-0 tabular-nums">
                        {new Date(doc.created_at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}
                      </span>
                      <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover/doc:opacity-100 transition-opacity">
                        <button onClick={() => handlePreview(doc)} className="w-5 h-5 inline-flex items-center justify-center rounded text-[var(--text-placeholder)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors" title="预览">
                          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3C4.5 3 1.5 5.5.5 8c1 2.5 4 5 7.5 5s6.5-2.5 7.5-5c-1-2.5-4-5-7.5-5ZM8 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"/><path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/></svg>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDownload(doc); }} className="w-5 h-5 inline-flex items-center justify-center rounded text-[var(--text-placeholder)] hover:text-[var(--accent-blue)] hover:bg-[var(--btn-blue)]/10 transition-colors" title="下载">
                          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor"><path d="M7.75 2A.75.75 0 0 0 7 2.75v5.69L4.53 5.97a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 1 0-1.06-1.06L8.5 8.44V2.75A.75.75 0 0 0 7.75 2Z"/><path d="M2 10.75a.75.75 0 0 1 1.5 0v1.5a.25.25 0 0 0 .25.25h8.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 1.5 11.75v-1.5Z"/></svg>
                        </button>
                        <div className="relative">
                          <button onClick={() => { setMovingDocId(movingDocId === doc.id ? null : doc.id); setEditingDocCatIds([...doc.category_ids]); }} className={`w-5 h-5 inline-flex items-center justify-center rounded transition-colors ${movingDocId === doc.id ? 'text-[var(--accent-blue)] bg-[var(--btn-blue)]/10' : 'text-[var(--text-placeholder)] hover:text-[var(--accent-blue)] hover:bg-[var(--btn-blue)]/10'}`} title="移动到分类">
                            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10Z"/></svg>
                          </button>
                          {movingDocId === doc.id && (
                            <div className="absolute bottom-full right-0 mb-2 z-20 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl shadow-lg p-3 min-w-[200px]">
                              <p className="text-[11px] font-medium text-[var(--text-primary)] mb-2">移动到分类</p>
                              <div className="max-h-36 overflow-y-auto mb-2 space-y-1">
                                {categories.map(c => (
                                  <label key={c.id} className="flex items-center gap-2 px-1 py-0.5 text-xs text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-secondary)] rounded transition-colors">
                                    <input type="checkbox" checked={editingDocCatIds.includes(c.id)} onChange={() => { setEditingDocCatIds(prev => prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id]); }} className="w-3 h-3 rounded accent-[var(--accent-blue)]" />
                                    <CategoryIcon icon={c.icon} />
                                    {c.name}
                                  </label>
                                ))}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button onClick={handleMoveDocCategories} className="flex-1 px-2 py-1 text-[10px] rounded-full bg-[var(--btn-primary)] text-white hover:bg-[var(--btn-primary-hover)] transition-colors">确定</button>
                                <button onClick={() => setMovingDocId(null)} className="px-2 py-1 text-[10px] rounded-full text-[var(--text-placeholder)] hover:text-[var(--text-primary)] transition-colors">取消</button>
                              </div>
                            </div>
                          )}
                        </div>
                        <button onClick={() => handleDelete(doc.id)} className="w-5 h-5 inline-flex items-center justify-center rounded text-[var(--text-placeholder)] hover:text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10 transition-colors" title="删除">
                          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor"><path d="M6.5 1.75a.25.25 0 0 1 .25-.25h2.5a.25.25 0 0 1 .25.25V3h-3V1.75Zm4.5 0V3h3.25a.75.75 0 0 1 0 1.5h-.8l-.75 9.5A1.75 1.75 0 0 1 10.97 15.5H5.03a1.75 1.75 0 0 1-1.73-1.5L2.55 4.5H1.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.06 4.5l.73 9.13a.25.25 0 0 0 .24.22h5.97a.25.25 0 0 0 .24-.22l.73-9.13H4.06Z"/></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-t border-[var(--border-subtle)]">
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

      {/* PDF Preview Modal */}
      {previewId && pdfPreviewUrl && (
        <PdfPreview
          file={pdfPreviewUrl}
          title={documents.find(d => d.id === previewId)?.title}
          onClose={closePreview}
          onDownload={() => {
            const doc = documents.find(d => d.id === previewId);
            if (doc) handleDownload(doc);
          }}
        />
      )}

      {/* Non-PDF Preview Modal */}
      {previewId && !pdfPreviewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={closePreview} />
          <div className="relative w-full max-w-3xl max-h-[85vh] bg-[var(--bg-primary)] rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.3)] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)] flex-shrink-0">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 truncate">
                <svg className="w-4 h-4 text-[var(--text-tertiary)] flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
                  <path fillRule="evenodd" d="M2 2.5A1.5 1.5 0 0 1 3.5 1h5.086a1.5 1.5 0 0 1 1.06.44l2.122 2.121A1.5 1.5 0 0 1 12.207 5H14.5A1.5 1.5 0 0 1 16 6.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 2 13.5v-11Z"/>
                </svg>
                <span className="truncate">{documents.find(d => d.id === previewId)?.title || '文档预览'}</span>
                {previewContent && (
                  <span className="text-[10px] text-[var(--text-placeholder)] font-normal flex-shrink-0">{previewContent.file_type.toUpperCase()}</span>
                )}
              </h3>
              <div className="flex items-center gap-2 ml-3">
                <button
                  onClick={() => {
                    const doc = documents.find(d => d.id === previewId);
                    if (doc) handleDownload(doc);
                  }}
                  className="px-3 py-1.5 text-xs rounded-full bg-[var(--btn-primary)] text-white hover:bg-[var(--btn-primary-hover)] transition-colors"
                >
                  下载
                </button>
                <button onClick={closePreview} className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-[var(--text-placeholder)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors">
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/></svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-5">
              {previewLoading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="w-5 h-5 border-2 border-[var(--accent-blue)] border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-[var(--text-secondary)]">加载中...</p>
                </div>
              ) : previewError ? (
                <div className="text-center py-16"><p className="text-sm text-[var(--accent-red)]">{previewError}</p></div>
              ) : previewContent ? (
                previewContent.html ? (
                  <div className="prose prose-sm max-w-none text-[var(--text-primary)] [&_table]:w-full [&_table]:border-collapse [&_th]:bg-[var(--bg-tertiary)] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:border [&_th]:border-[var(--border-subtle)] [&_td]:px-3 [&_td]:py-1.5 [&_td]:border [&_td]:border-[var(--border-subtle)] [&_img]:max-w-full [&_img]:rounded-lg" dangerouslySetInnerHTML={{ __html: previewContent.html }} />
                ) : previewContent.table ? (
                  <div className="rounded-xl border border-[var(--border-subtle)]">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr>
                          {previewContent.table.columns.map((col, i) => (
                            <th key={i} className="px-3 py-2 text-left font-semibold text-[var(--text-primary)] whitespace-nowrap border-b border-[var(--border-subtle)] sticky top-0 bg-[var(--bg-tertiary)]">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewContent.table.rows.map((row, ri) => (
                          <tr key={ri} className={ri % 2 === 0 ? 'bg-[var(--bg-primary)]' : 'bg-[var(--bg-secondary)]'}>
                            {row.map((cell, ci) => (
                              <td key={ci} className="px-3 py-1.5 text-[var(--text-secondary)] whitespace-nowrap border-b border-[var(--border-subtle)] max-w-[300px] truncate">{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <pre className="text-sm text-[var(--text-primary)] whitespace-pre-wrap font-sans leading-relaxed break-words">{previewContent.content}</pre>
                )
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
