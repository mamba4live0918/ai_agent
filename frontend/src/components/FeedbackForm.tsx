import { useState, useEffect } from 'react';
import { submitFeedback, getFeedbackStats } from '../services/api';
import type { FeedbackStats } from '../types';

export default function FeedbackForm() {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getFeedbackStats().then(setStats).catch(() => {});
  }, [submitted]);

  const handleSubmit = async () => {
    if (rating === 0) { setError('请先选择评分'); return; }
    setSubmitting(true);
    setError('');
    try {
      await submitFeedback({ rating, feedback_text: text || null });
      setSubmitted(true);
    } catch {
      setError('提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  if (submitted) {
    return (
      <div className="card p-5 animate-in" style={{ animationDelay: '220ms' }}>
        <div className="text-center py-4">
          <div className="w-12 h-12 rounded-full bg-[#238636]/20 border border-[#238636]/40 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-[#3fb950]" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/>
            </svg>
          </div>
          <p className="text-[#e6edf3] font-medium mb-1">感谢你的反馈！</p>
          <p className="text-xs text-[#8b949e] mb-3">你的评价将帮助我们持续改进</p>
          <button onClick={() => { setSubmitted(false); setRating(0); setText(''); }} className="text-xs text-[#58a6ff] hover:underline">
            再次评价
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-5 animate-in" style={{ animationDelay: '220ms' }}>
      <div className="flex items-center gap-2 mb-4">
        <svg className="w-4 h-4 text-[#d29922]" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/>
        </svg>
        <span className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider">用户反馈</span>
        {stats && (
          <span className="text-[11px] text-[#6e7681] ml-auto">
            {stats.total > 0 ? `${stats.average.toFixed(1)} 分 · ${stats.total} 人评价` : '暂无评价'}
          </span>
        )}
      </div>

      {/* Star rating */}
      <div className="flex items-center gap-1 mb-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            className="p-0.5 transition-colors"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setRating(i)}
          >
            <svg
              className="w-7 h-7"
              viewBox="0 0 16 16"
              fill={i <= (hover || rating) ? '#d29922' : '#21262d'}
            >
              <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/>
            </svg>
          </button>
        ))}
        <span className="text-xs text-[#6e7681] ml-2">
          {rating > 0 ? `${rating} 分` : '点击评分'}
        </span>
      </div>

      {/* Text feedback */}
      <textarea
        className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] resize-none focus:outline-none focus:border-[#58a6ff] mb-3"
        rows={2}
        placeholder="分享你的使用体验或建议（可选）..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSubmit}
          disabled={submitting || rating === 0}
          className="px-4 py-1.5 text-xs font-medium rounded-md bg-[#238636] text-white hover:bg-[#2ea043] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? '提交中...' : '提交反馈'}
        </button>
        <button
          onClick={handleShare}
          className="px-3 py-1.5 text-xs font-medium rounded-md border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] hover:border-[#58a6ff]/40 transition-colors flex items-center gap-1"
        >
          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.5 2.75a.75.75 0 0 0-.75.75v6.5c0 .414.336.75.75.75H5v1H3.5A1.75 1.75 0 0 1 1.75 10V3.5c0-.966.784-1.75 1.75-1.75h8.5c.966 0 1.75.784 1.75 1.75V5h-1V3.5a.75.75 0 0 0-.75-.75h-8.5Z"/>
            <path d="M9.25 6.75a.75.75 0 0 0-1.5 0v3.69L6.03 8.72a.75.75 0 0 0-1.06 1.06l2.5 2.5a.75.75 0 0 0 1.06 0l2.5-2.5a.75.75 0 1 0-1.06-1.06l-1.72 1.72V6.75Z"/>
          </svg>
          {copied ? '已复制' : '分享链接'}
        </button>
        {error && <span className="text-xs text-[#f85149]">{error}</span>}
      </div>
    </div>
  );
}
