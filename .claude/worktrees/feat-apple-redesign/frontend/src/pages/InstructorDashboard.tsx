import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, Legend } from 'recharts';
import { getInstructorOverview, getInstructorPerUserStats, getInstructorTrends, exportReport } from '../services/api';
import type { TrainingStatsOverview, PerUserStats, TrainingTrendPoint } from '../types';

export default function InstructorDashboard() {
  const [overview, setOverview] = useState<TrainingStatsOverview | null>(null);
  const [perUser, setPerUser] = useState<PerUserStats[]>([]);
  const [trends, setTrends] = useState<TrainingTrendPoint[]>([]);
  const [granularity, setGranularity] = useState<'weekly' | 'monthly'>('weekly');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    Promise.all([
      getInstructorOverview(),
      getInstructorPerUserStats(),
      getInstructorTrends(granularity),
    ])
      .then(([ov, pu, tr]) => {
        setOverview(ov);
        setPerUser(pu);
        setTrends(tr);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [granularity]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-[var(--text-secondary)] text-sm">Loading statistics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-[var(--color-danger-hover-bg)] border border-[var(--accent-red)] rounded-xl px-4 py-3 text-sm text-[var(--accent-red)]">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">讲师端口 - 训练统计</h1>
        <button
          onClick={() => exportReport().catch(() => {})}
          className="bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white text-sm px-4 py-2 rounded-full transition-all duration-200"
        >
          导出报表 (CSV)
        </button>
      </div>

      {/* Stat Cards */}
      {overview && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="总用户数" value={overview.total_users} color="var(--accent-blue)" />
          <StatCard label="总会话数" value={overview.total_sessions} color="var(--accent-green)" />
          <StatCard label="完成率" value={`${overview.completion_rate}%`} color="var(--accent-orange)" />
          <StatCard label="平均分" value={overview.average_score?.toFixed(1) ?? '—'} color="var(--accent-orange)" />
        </div>
      )}

      {/* Trends Chart */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">训练趋势</h2>
          <div className="flex gap-1">
            <button
              onClick={() => setGranularity('weekly')}
              className={`px-3 py-1 text-xs rounded-full transition-all duration-200 ${
                granularity === 'weekly'
                  ? 'bg-[var(--btn-blue)] text-white'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              按周
            </button>
            <button
              onClick={() => setGranularity('monthly')}
              className={`px-3 py-1 text-xs rounded-full transition-all duration-200 ${
                granularity === 'monthly'
                  ? 'bg-[var(--btn-blue)] text-white'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              按月
            </button>
          </div>
        </div>
        {trends.length === 0 ? (
          <div className="text-xs text-[var(--text-placeholder)] py-8 text-center">暂无训练数据</div>
        ) : (
          <ResponsiveContainer width="100%" height={typeof window !== 'undefined' && window.innerWidth < 640 ? 200 : 300}>
            <BarChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="period" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
              <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 6 }}
                labelStyle={{ color: 'var(--text-primary)' }}
              />
              <Legend wrapperStyle={{ color: 'var(--text-secondary)', fontSize: 12 }} />
              <Bar dataKey="total_sessions" name="总会话" fill="var(--accent-blue)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="completed_sessions" name="已完成" fill="var(--accent-green)" radius={[4, 4, 0, 0]} />
              <Line
                type="monotone"
                dataKey="average_score"
                name="平均分"
                stroke="var(--accent-orange)"
                strokeWidth={2}
                dot={{ fill: 'var(--accent-orange)', r: 4 }}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Per-User Table */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">按用户统计</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)] text-xs">
                <th className="text-left px-4 py-2 font-medium">用户</th>
                <th className="text-left px-4 py-2 font-medium hidden sm:table-cell">角色</th>
                <th className="text-right px-4 py-2 font-medium">总会话</th>
                <th className="text-right px-4 py-2 font-medium">已完成</th>
                <th className="text-right px-4 py-2 font-medium">平均分</th>
                <th className="text-right px-4 py-2 font-medium hidden md:table-cell">最近训练</th>
              </tr>
            </thead>
            <tbody>
              {perUser.map((u) => (
                <tr key={u.user_id} className="border-b border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-primary)]">
                  <td className="px-4 py-2.5 font-medium">{u.username}</td>
                  <td className="px-4 py-2.5 hidden sm:table-cell">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                      u.role === 'admin' ? 'bg-[var(--accent-orange)]/20 text-[var(--accent-orange)]' :
                      u.role === 'instructor' ? 'bg-[var(--accent-blue)]/20 text-[var(--accent-blue)]' :
                      'bg-[var(--accent-green)]/20 text-[var(--accent-green)]'
                    }`}>
                      {u.role === 'admin' ? '管理员' : u.role === 'instructor' ? '讲师' : '销售'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">{u.total_sessions}</td>
                  <td className="px-4 py-2.5 text-right">{u.completed_sessions}</td>
                  <td className="px-4 py-2.5 text-right">{u.average_score?.toFixed(1) ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-[var(--text-secondary)] hidden md:table-cell">
                    {u.last_session_at ? new Date(u.last_session_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
              {perUser.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[var(--text-placeholder)] text-xs">
                    暂无用户数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-[var(--bg-secondary)] rounded-2xl p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5">
      <div className="text-xs text-[var(--text-secondary)] mb-1">{label}</div>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
    </div>
  );
}
