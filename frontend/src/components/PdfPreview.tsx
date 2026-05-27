interface PdfPreviewProps {
  file: string; // blob URL or file URL
  title?: string;
  onClose: () => void;
  onDownload?: () => void;
}

export default function PdfPreview({ file, title, onClose, onDownload }: PdfPreviewProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-3">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-7xl h-[96vh] bg-[var(--bg-primary)] rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.3)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-subtle)] flex-shrink-0">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 truncate">
            <svg className="w-4 h-4 text-[var(--accent-red)] flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M2 2.5A1.5 1.5 0 0 1 3.5 1h5.086a1.5 1.5 0 0 1 1.06.44l2.122 2.121A1.5 1.5 0 0 1 12.207 5H14.5A1.5 1.5 0 0 1 16 6.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 2 13.5v-11Z"/>
            </svg>
            <span className="truncate">{title || 'PDF 预览'}</span>
          </h3>

          <div className="flex items-center gap-1 ml-3">
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

        {/* Body — native browser PDF viewer */}
        <iframe
          src={`${file}#toolbar=1&navpanes=1`}
          className="w-full flex-1 border-0"
          title={title || 'PDF Preview'}
        />
      </div>
    </div>
  );
}
