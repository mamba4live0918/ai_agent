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
        <div className="text-[#8b949e] text-sm">Loading statistics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-[#490202]/20 border border-[#f85149]/30 rounded-md px-4 py-3 text-sm text-[#f85149]">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[#e6edf3]">讲师端口 - 训练统计</h1>
        <button
          onClick={() => exportReport().catch(() => {})}
          className="bg-[#238636] hover:bg-[#2ea043] text-white text-sm px-4 py-2 rounded-md transition-colors"
        >
          导出报表 (CSV)
        </button>
      </div>

      {/* Stat Cards */}
      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="总用户数" value={overview.total_users} color="#58a6ff" />
          <StatCard label="总会话数" value={overview.total_sessions} color="#3fb950" />
          <StatCard label="完成率" value={`${overview.completion_rate}%`} color="#d29922" />
          <StatCard label="平均分" value={overview.average_score?.toFixed(1) ?? '—'} color="#f78166" />
        </div>
      )}

      {/* Trends Chart */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[#e6edf3]">训练趋势</h2>
          <div className="flex gap-1">
            <button
              onClick={() => setGranularity('weekly')}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                granularity === 'weekly'
                  ? 'bg-[#1f6feb] text-white'
                  : 'bg-[#21262d] text-[#8b949e] hover:text-[#e6edf3]'
              }`}
            >
              按周
            </button>
            <button
              onClick={() => setGranularity('monthly')}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                granularity === 'monthly'
                  ? 'bg-[#1f6feb] text-white'
                  : 'bg-[#21262d] text-[#8b949e] hover:text-[#e6edf3]'
              }`}
            >
              按月
            </button>
          </div>
        </div>
        {trends.length === 0 ? (
          <div className="text-xs text-[#484f58] py-8 text-center">暂无训练数据</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
              <XAxis dataKey="period" tick={{ fill: '#8b949e', fontSize: 12 }} />
              <YAxis tick={{ fill: '#8b949e', fontSize: 12 }} />
              <Tooltip
                contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6 }}
                labelStyle={{ color: '#e6edf3' }}
              />
              <Legend wrapperStyle={{ color: '#8b949e', fontSize: 12 }} />
              <Bar dataKey="total_sessions" name="总会话" fill="#58a6ff" radius={[4, 4, 0, 0]} />
              <Bar dataKey="completed_sessions" name="已完成" fill="#3fb950" radius={[4, 4, 0, 0]} />
              <Line
                type="monotone"
                dataKey="average_score"
                name="平均分"
                stroke="#f78166"
                strokeWidth={2}
                dot={{ fill: '#f78166', r: 4 }}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Per-User Table */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#21262d]">
          <h2 className="text-sm font-semibold text-[#e6edf3]">按用户统计</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#21262d] text-[#8b949e] text-xs">
                <th className="text-left px-4 py-2 font-medium">用户</th>
                <th className="text-left px-4 py-2 font-medium">角色</th>
                <th className="text-right px-4 py-2 font-medium">总会话</th>
                <th className="text-right px-4 py-2 font-medium">已完成</th>
                <th className="text-right px-4 py-2 font-medium">平均分</th>
                <th className="text-right px-4 py-2 font-medium">最近训练</th>
              </tr>
            </thead>
            <tbody>
              {perUser.map((u) => (
                <tr key={u.user_id} className="border-b border-[#21262d] text-[#e6edf3] hover:bg-[#0d1117]">
                  <td className="px-4 py-2.5 font-medium">{u.username}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                      u.role === 'admin' ? 'bg-[#f78166]/20 text-[#f78166]' :
                      u.role === 'instructor' ? 'bg-[#58a6ff]/20 text-[#58a6ff]' :
                      'bg-[#3fb950]/20 text-[#3fb950]'
                    }`}>
                      {u.role === 'admin' ? '管理员' : u.role === 'instructor' ? '讲师' : '销售'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">{u.total_sessions}</td>
                  <td className="px-4 py-2.5 text-right">{u.completed_sessions}</td>
                  <td className="px-4 py-2.5 text-right">{u.average_score?.toFixed(1) ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-[#8b949e]">
                    {u.last_session_at ? new Date(u.last_session_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
              {perUser.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[#484f58] text-xs">
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
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
      <div className="text-xs text-[#8b949e] mb-1">{label}</div>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
    </div>
  );
}
