import { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

interface PdfPreviewProps {
  file: string;
  title?: string;
  onClose: () => void;
  onDownload?: () => void;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 3.0;
const SCALE_STEP = 0.25;

export default function PdfPreview({ file, title, onClose, onDownload }: PdfPreviewProps) {
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [workerReady, setWorkerReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [fitWidth, setFitWidth] = useState(800);
  const [scale, setScale] = useState(1.0);

  useEffect(() => {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    setWorkerReady(true);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentRect.width - 32;
        if (w > 0) setFitWidth(w);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const displayWidth = fitWidth * scale;

  const zoomIn = () => setScale(s => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)));
  const zoomOut = () => setScale(s => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)));
  const zoomReset = () => setScale(1.0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-3">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-5xl h-[96vh] bg-[var(--bg-primary)] rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.3)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-subtle)] flex-shrink-0">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 truncate">
            <svg className="w-4 h-4 text-[var(--accent-red)] flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M2 2.5A1.5 1.5 0 0 1 3.5 1h5.086a1.5 1.5 0 0 1 1.06.44l2.122 2.121A1.5 1.5 0 0 1 12.207 5H14.5A1.5 1.5 0 0 1 16 6.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 2 13.5v-11Z"/>
            </svg>
            <span className="truncate">{title || 'PDF 预览'}</span>
          </h3>

          <div className="flex items-center gap-3 ml-3">
            {/* Zoom controls */}
            <div className="flex items-center gap-1 text-xs text-[var(--text-secondary)] select-none">
              <button onClick={zoomOut} disabled={scale <= MIN_SCALE} className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--bg-tertiary)] disabled:opacity-30 disabled:cursor-default transition-colors" title="缩小">
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><path d="M2 7.25a.75.75 0 0 0 0 1.5h7.5a.75.75 0 0 0 0-1.5H2Z"/></svg>
              </button>
              <button onClick={zoomReset} className="min-w-[3em] text-center hover:bg-[var(--bg-tertiary)] rounded px-1 py-0.5 transition-colors" title="适应宽度">
                {Math.round(scale * 100)}%
              </button>
              <button onClick={zoomIn} disabled={scale >= MAX_SCALE} className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--bg-tertiary)] disabled:opacity-30 disabled:cursor-default transition-colors" title="放大">
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><path d="M7.25 2a.75.75 0 0 1 1.5 0v5.25H14a.75.75 0 0 1 0 1.5H8.75V14a.75.75 0 0 1-1.5 0V8.75H2a.75.75 0 0 1 0-1.5h5.25V2Z"/></svg>
              </button>
            </div>

            {/* Page navigation */}
            {numPages > 1 && (
              <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] select-none">
                <button
                  onClick={() => setPageNumber(p => Math.max(1, p - 1))}
                  disabled={pageNumber <= 1}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--bg-tertiary)] disabled:opacity-30 disabled:cursor-default transition-colors"
                >
                  <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor"><path d="M10.5 3.5a.5.5 0 0 0-1 0v9a.5.5 0 0 0 1 0v-9Z"/><path d="M6.354 8.354a.5.5 0 0 1 0-.708l2.828-2.828a.5.5 0 0 1 .854.354v5.656a.5.5 0 0 1-.854.354L6.354 8.354Z"/></svg>
                </button>
                <span className="tabular-nums min-w-[3em] text-center">{pageNumber} / {numPages}</span>
                <button
                  onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}
                  disabled={pageNumber >= numPages}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--bg-tertiary)] disabled:opacity-30 disabled:cursor-default transition-colors"
                >
                  <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 3.5a.5.5 0 0 1 1 0v9a.5.5 0 0 1-1 0v-9Z"/><path d="M9.646 8.354a.5.5 0 0 0 0-.708L6.818 4.818a.5.5 0 0 0-.854.354v5.656a.5.5 0 0 0 .854.354l2.828-2.828Z"/></svg>
                </button>
              </div>
            )}

            {onDownload && (
              <button onClick={onDownload} className="px-3 py-1.5 text-xs rounded-full bg-[var(--btn-primary)] text-white hover:bg-[var(--btn-primary-hover)] transition-colors">
                下载
              </button>
            )}
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full text-[var(--text-placeholder)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div ref={containerRef} className="flex-1 overflow-auto bg-[var(--bg-secondary)]">
          <div className="min-h-full flex justify-center p-4">
            {workerReady && (
              <Document
                file={file}
                onLoadSuccess={({ numPages: n }) => { setNumPages(n); setPageNumber(1); }}
                loading={
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <div className="w-6 h-6 border-2 border-[var(--accent-blue)] border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-[var(--text-secondary)]">加载 PDF...</p>
                  </div>
                }
                error={
                  <div className="flex flex-col items-center justify-center py-20 gap-2">
                    <p className="text-sm text-[var(--accent-red)]">PDF 加载失败</p>
                    <p className="text-xs text-[var(--text-placeholder)]">请尝试刷新页面后重试</p>
                  </div>
                }
              >
                <Page
                  pageNumber={pageNumber}
                  width={displayWidth}
                  devicePixelRatio={(window.devicePixelRatio || 1) * 3}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                />
              </Document>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
