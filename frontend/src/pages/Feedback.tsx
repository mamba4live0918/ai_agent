import { useState, useEffect } from 'react';
import { submitFeedback, getFeedbackStats, getMyFeedback } from '../services/api';
import type { FeedbackStats, FeedbackResponse } from '../types';

function FeedbackRecord({ feedback: f }: { feedback: FeedbackResponse }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`card transition-colors ${open ? 'border-[#58a6ff]/40' : 'cursor-pointer hover:border-[#30363d]'}`}
      onClick={() => setOpen(!open)}
    >
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map(i => (
              <span key={i} className={`text-xs ${i <= f.rating ? 'text-[#d29922]' : 'text-[#21262d]'}`}>★</span>
            ))}
          </div>
          <span className="text-[11px] text-[#6e7681]">
            {new Date(f.created_at).toLocaleDateString('zh-CN')}
          </span>
        </div>
        <svg className={`w-4 h-4 text-[#484f58] transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.427 5.927a.75.75 0 0 1 1.06 0L8 8.44l2.513-2.513a.75.75 0 0 1 1.06 1.06l-3.043 3.043a.75.75 0 0 1-1.06 0L4.427 6.987a.75.75 0 0 1 0-1.06Z"/>
        </svg>
      </div>
      {open && (
        <div className="px-4 pb-4 border-t border-[#21262d] pt-3 space-y-2">
          <div>
            <span className="text-[10px] text-[#484f58] uppercase tracking-wider">评分</span>
            <p className="text-sm text-[#e6edf3]">{f.rating} / 5</p>
          </div>
          {f.feedback_text && (
            <div>
              <span className="text-[10px] text-[#484f58] uppercase tracking-wider">评价内容</span>
              <p className="text-sm text-[#e6edf3] whitespace-pre-wrap">{f.feedback_text}</p>
            </div>
          )}
          <div>
            <span className="text-[10px] text-[#484f58] uppercase tracking-wider">提交时间</span>
            <p className="text-sm text-[#8b949e]">
              {new Date(f.created_at).toLocaleString('zh-CN')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FeedbackPage() {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [myFeedbacks, setMyFeedbacks] = useState<FeedbackResponse[]>([]);

  const loadData = () => {
    getFeedbackStats().then(setStats).catch(() => {});
    getMyFeedback().then(setMyFeedbacks).catch(() => {});
  };

  useEffect(() => { loadData(); }, []);

  const handleSubmit = async () => {
    if (rating === 0) { setError('请先选择评分'); return; }
    setSubmitting(true);
    setError('');
    try {
      await submitFeedback({ rating, feedback_text: text || null });
      setSubmitted(true);
      loadData();
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

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-[#e6edf3] mb-1">用户反馈</h2>
        <p className="text-sm text-[#8b949e]">分享你的使用体验，帮助我们持续改进</p>
      </div>

      {/* Stats cards */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-[#d29922] font-mono">{stats.average.toFixed(1)}</p>
            <p className="text-[11px] text-[#6e7681] mt-1">平均评分</p>
          </div>
          {[5, 4, 3, 2].map(n => (
            <div key={n} className="card p-4 text-center">
              <p className="text-lg font-bold text-[#e6edf3] font-mono">{stats.distribution[n]}</p>
              <p className="text-[11px] text-[#6e7681] mt-1">{'★'.repeat(n)}{'☆'.repeat(5-n)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Feedback form */}
      <div className="card p-6 mb-8">
        {submitted ? (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-full bg-[#238636]/20 border-2 border-[#238636]/40 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-[#3fb950]" viewBox="0 0 16 16" fill="currentColor">
                <path fillRule="evenodd" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/>
              </svg>
            </div>
            <p className="text-[#e6edf3] font-medium text-lg mb-1">感谢你的反馈！</p>
            <p className="text-sm text-[#8b949e] mb-4">你的评价已提交</p>
            <button
              onClick={() => { setSubmitted(false); setRating(0); setText(''); }}
              className="px-4 py-2 text-sm rounded-md border border-[#30363d] text-[#58a6ff] hover:border-[#58a6ff]/40 transition-colors"
            >
              再次评价
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1 mb-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <button
                  key={i}
                  type="button"
                  className="p-1 transition-colors"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(0)}
                  onClick={() => setRating(i)}
                >
                  <svg
                    className="w-9 h-9"
                    viewBox="0 0 16 16"
                    fill={i <= (hover || rating) ? '#d29922' : '#21262d'}
                  >
                    <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/>
                  </svg>
                </button>
              ))}
              <span className="text-sm text-[#6e7681] ml-2">
                {rating > 0 ? `${rating} 分` : '点击评分'}
              </span>
            </div>
            <textarea
              className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-4 py-3 text-sm text-[#e6edf3] placeholder-[#484f58] resize-none focus:outline-none focus:border-[#58a6ff] mb-4"
              rows={3}
              placeholder="分享你的使用体验或改进建议（可选）..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <button
                onClick={handleSubmit}
                disabled={submitting || rating === 0}
                className="px-5 py-2 text-sm font-medium rounded-md bg-[#238636] text-white hover:bg-[#2ea043] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? '提交中...' : '提交反馈'}
              </button>
              <button
                onClick={handleShare}
                className="px-4 py-2 text-sm font-medium rounded-md border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] hover:border-[#58a6ff]/40 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3.5 2.75a.75.75 0 0 0-.75.75v6.5c0 .414.336.75.75.75H5v1H3.5A1.75 1.75 0 0 1 1.75 10V3.5c0-.966.784-1.75 1.75-1.75h8.5c.966 0 1.75.784 1.75 1.75V5h-1V3.5a.75.75 0 0 0-.75-.75h-8.5Z"/>
                  <path d="M9.25 6.75a.75.75 0 0 0-1.5 0v3.69L6.03 8.72a.75.75 0 0 0-1.06 1.06l2.5 2.5a.75.75 0 0 0 1.06 0l2.5-2.5a.75.75 0 1 0-1.06-1.06l-1.72 1.72V6.75Z"/>
                </svg>
                {copied ? '已复制' : '分享链接'}
              </button>
              {error && <span className="text-sm text-[#f85149]">{error}</span>}
            </div>
          </>
        )}
      </div>

      {/* My feedbacks */}
      {myFeedbacks.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[#8b949e] uppercase tracking-wider mb-3">我的评价记录</h3>
          <div className="space-y-2">
            {myFeedbacks.map(f => (
              <FeedbackRecord key={f.id} feedback={f} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
