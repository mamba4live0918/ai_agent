import { useState, useEffect } from 'react';
import { getAllFeedback, getFeedbackStats } from '../services/api';
import type { FeedbackAdminResponse, FeedbackStats } from '../types';

function FeedbackRow({ fb }: { fb: FeedbackAdminResponse }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`card rounded-xl transition-all duration-200 ${open ? 'border-[var(--accent-blue)]/40' : 'cursor-pointer hover:border-[var(--border-default)]'}`}
      onClick={() => setOpen(!open)}
    >
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm text-[var(--text-primary)] font-medium truncate max-w-[100px] sm:max-w-none">{fb.username}</span>
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map(i => (
              <span key={i} className={`text-xs ${i <= fb.rating ? 'text-[var(--accent-orange)]' : 'text-[var(--text-placeholder)]'}`}>★</span>
            ))}
          </div>
          {fb.feedback_text && (
            <span className="text-xs text-[var(--text-placeholder)] truncate max-w-[200px] hidden sm:block">
              {fb.feedback_text.slice(0, 40)}{fb.feedback_text.length > 40 ? '...' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--text-tertiary)]">
            {new Date(fb.created_at).toLocaleDateString('zh-CN')}
          </span>
          <svg className={`w-4 h-4 text-[var(--text-placeholder)] transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.427 5.927a.75.75 0 0 1 1.06 0L8 8.44l2.513-2.513a.75.75 0 0 1 1.06 1.06l-3.043 3.043a.75.75 0 0 1-1.06 0L4.427 6.987a.75.75 0 0 1 0-1.06Z"/>
          </svg>
        </div>
      </div>
      {open && (
        <div className="px-4 pb-4 border-t border-[var(--border-subtle)] pt-3 space-y-2">
          <div>
            <span className="text-[10px] text-[var(--text-placeholder)] uppercase tracking-wider">评分</span>
            <p className="text-sm text-[var(--text-primary)]">{fb.rating} / 5</p>
          </div>
          {fb.feedback_text ? (
            <div>
              <span className="text-[10px] text-[var(--text-placeholder)] uppercase tracking-wider">评价内容</span>
              <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">{fb.feedback_text}</p>
            </div>
          ) : (
            <p className="text-xs text-[var(--text-placeholder)] italic">无文字评价</p>
          )}
          <div>
            <span className="text-[10px] text-[var(--text-placeholder)] uppercase tracking-wider">提交时间</span>
            <p className="text-sm text-[var(--text-secondary)]">{new Date(fb.created_at).toLocaleString('zh-CN')}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminFeedback() {
  const [feedbacks, setFeedbacks] = useState<FeedbackAdminResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const pageSize = 20;

  useEffect(() => {
    setLoading(true);
    Promise.all([getAllFeedback(page, pageSize), getFeedbackStats()])
      .then(([res, s]) => { setFeedbacks(res.items); setTotal(res.total); setStats(s); })
      .finally(() => setLoading(false));
  }, [page]);

  const totalPages = Math.ceil(total / pageSize);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
        <p className="text-sm text-[var(--text-secondary)]">加载中...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-1">反馈总览</h2>
        <p className="text-sm text-[var(--text-secondary)]">查看所有用户的反馈记录</p>
      </div>

      {stats && stats.total > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 mb-6">
          <div className="card rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-[var(--accent-orange)] font-mono">{stats.average.toFixed(1)}</p>
            <p className="text-[11px] text-[var(--text-tertiary)] mt-1">平均评分</p>
          </div>
          {[5, 4, 3, 2].map(n => (
            <div key={n} className="card rounded-xl p-4 text-center">
              <p className="text-lg font-bold text-[var(--text-primary)] font-mono">{stats.distribution[n]}</p>
              <p className="text-[11px] text-[var(--text-tertiary)] mt-1">{'★'.repeat(n)}{'☆'.repeat(5 - n)}</p>
            </div>
          ))}
        </div>
      )}

      {feedbacks.length === 0 ? (
        <div className="card rounded-xl p-12 text-center">
          <p className="text-[var(--text-secondary)] text-sm">暂无反馈记录</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {feedbacks.map(fb => (
              <FeedbackRow key={fb.id} fb={fb} />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-[var(--text-placeholder)]">共 {total} 条反馈</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-2 py-1 text-xs rounded-full border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 transition-all duration-200"
                >
                  上一页
                </button>
                <span className="text-xs text-[var(--text-secondary)] px-2">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-2 py-1 text-xs rounded-full border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 transition-all duration-200"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
