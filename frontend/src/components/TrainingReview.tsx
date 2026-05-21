import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { TrainingReview as TrainingReviewType, TrainingSessionDetail } from '../types';

interface Props {
  review: TrainingReviewType;
  session: TrainingSessionDetail;
  onBack?: () => void;
}

function getScoreColor(v: number): string {
  if (v >= 8) return '#3fb950';
  if (v >= 6) return '#d29922';
  if (v >= 4) return '#f0883e';
  return '#f85149';
}

export default function TrainingReview({ review, session, onBack }: Props) {
  const scores = review.scores || {};
  const dimScores = review.dimension_scores || {};

  const radarData = [
    { dimension: '表达逻辑', value: dimScores.logic || 0, fullMark: 10 },
    { dimension: '专业准确', value: dimScores.professionalism || 0, fullMark: 10 },
    { dimension: '情绪情商', value: dimScores.eq || 0, fullMark: 10 },
    { dimension: '话术灵活', value: dimScores.flexibility || 0, fullMark: 10 },
    { dimension: '产品知识', value: dimScores.product_knowledge || 0, fullMark: 10 },
    { dimension: '客户洞察', value: dimScores.customer_insight || 0, fullMark: 10 },
  ];

  const scoreCards = [
    { label: '表达逻辑', value: scores.expression_logic, key: 'expression_logic' },
    { label: '专业准确度', value: scores.professional_accuracy, key: 'professional_accuracy' },
    { label: '情绪情商', value: scores.emotional_eq, key: 'emotional_eq' },
    { label: '综合评分', value: scores.overall, key: 'overall', primary: true },
  ];

  const highlights = (review.highlights || []) as { type: 'good' | 'bad'; message_content: string; comment: string; improved_version?: string }[];
  const weakness = (review.weakness_analysis || []) as { skill: string; level: string; suggestion: string }[];
  const nextSteps = (review.next_steps || []) as { priority: number; action: string }[];

  // Mock trend data (will need real data for multiple sessions)
  const trendData = [
    { name: '本次', 综合: scores.overall || 0, 表达逻辑: scores.expression_logic || 0, 情绪情商: scores.emotional_eq || 0 },
  ];

  return (
    <div className="flex flex-col h-full bg-[#010409]">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-3 py-2.5 bg-[#010409] border-b-2 border-[#21262d] flex-shrink-0">
        {onBack && (
          <button onClick={onBack} className="text-[#8b949e] hover:text-[#e6edf3] text-xs">← 返回</button>
        )}
        <span className="text-sm text-[#e6edf3] font-semibold">复盘报告</span>
        <span className="text-[10px] text-[#484f58]">|</span>
        <span className="text-[11px] text-[#8b949e]">👤 {session.persona?.name || '未知'} · {session.scenario}</span>
        <span className="text-[10px] text-[#484f58]">{new Date(review.created_at).toLocaleString('zh-CN')}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Score overview */}
        <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-3.5">
          <h3 className="text-[10px] font-semibold text-[#6e7681] uppercase tracking-wider mb-3">评分概览</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {scoreCards.map(card => (
              <div key={card.key} className={`rounded-lg p-3 text-center ${card.primary ? 'bg-[#1c2128] border border-[#30363d]' : 'bg-[#161b22] border border-[#30363d]'}`}>
                <div className="text-[10px] text-[#6e7681] mb-1">{card.label}</div>
                <div className={`text-2xl font-bold ${card.primary ? 'text-[#e6edf3]' : ''}`} style={{ color: card.primary ? undefined : getScoreColor(card.value || 0) }}>
                  {card.value ?? '—'}
                </div>
                <div className="text-[9px] text-[#484f58]">/ 10</div>
                <div className="mt-1.5 h-1 bg-[#21262d] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${(card.value || 0) * 10}%`, backgroundColor: getScoreColor(card.value || 0) }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Radar + Trend */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-3.5">
            <h3 className="text-[10px] font-semibold text-[#6e7681] uppercase tracking-wider mb-3">能力雷达图</h3>
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#21262d" />
                <PolarAngleAxis dataKey="dimension" tick={{ fill: '#8b949e', fontSize: 10 }} />
                <PolarRadiusAxis angle={30} domain={[0, 10]} tick={{ fill: '#484f58', fontSize: 9 }} />
                <Radar name="评分" dataKey="value" stroke="#58a6ff" fill="#58a6ff" fillOpacity={0.15} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-3.5">
            <h3 className="text-[10px] font-semibold text-[#6e7681] uppercase tracking-wider mb-3">历史趋势</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData}>
                <CartesianGrid stroke="#21262d" strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fill: '#8b949e', fontSize: 10 }} />
                <YAxis domain={[0, 10]} tick={{ fill: '#484f58', fontSize: 9 }} />
                <Tooltip
                  contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, fontSize: 11 }}
                  labelStyle={{ color: '#e6edf3' }}
                />
                <Line type="monotone" dataKey="综合" stroke="#58a6ff" strokeWidth={2} dot={{ fill: '#58a6ff', r: 4 }} />
                <Line type="monotone" dataKey="表达逻辑" stroke="#3fb950" strokeWidth={1.5} dot={{ fill: '#3fb950', r: 3 }} />
                <Line type="monotone" dataKey="情绪情商" stroke="#d29922" strokeWidth={1.5} dot={{ fill: '#d29922', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-[9px] text-[#484f58] text-center mt-1">趋势数据将在多次训练后累积展示</p>
          </div>
        </div>

        {/* Coach overall assessment */}
        {review.overall_comment && (
          <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-3.5">
            <h3 className="text-[10px] font-semibold text-[#6e7681] uppercase tracking-wider mb-3">教练总评</h3>
            <p className="text-xs text-[#8b949e] leading-relaxed whitespace-pre-wrap">{review.overall_comment}</p>
          </div>
        )}

        {/* Phrasing comparison */}
        {highlights.length > 0 && (
          <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-3.5">
            <h3 className="text-[10px] font-semibold text-[#6e7681] uppercase tracking-wider mb-3">话术点评</h3>
            <div className="space-y-2.5">
              {highlights.map((h, i) => (
                <div key={i} className="border border-[#21262d] rounded-md overflow-hidden">
                  <div className={`px-3 py-1.5 text-[10px] border-b border-[#21262d] ${h.type === 'good' ? 'bg-[#161b22] text-[#3fb950]' : 'bg-[#161b22] text-[#f85149]'}`}>
                    {h.type === 'good' ? '👍 表现好的回复' : '👎 需要改进的回复'}
                  </div>
                  <div className="px-3 py-2 text-[11px] text-[#e6edf3] leading-relaxed">{h.message_content}</div>
                  <div className={`px-3 py-1.5 text-[10px] border-t border-[#21262d] ${h.type === 'good' ? 'bg-[#0d1117] text-[#3fb950]' : 'bg-[#0d1117] text-[#f85149]'}`}>
                    {h.type === 'good' ? '✓ ' : '✗ '}{h.comment}
                  </div>
                  {h.improved_version && (
                    <div className="px-3 py-2 text-[11px] text-[#58a6ff] leading-relaxed border-t border-[#30363d] bg-[#0d1117]">
                      <span className="text-[10px] text-[#58a6ff] font-semibold">🔧 改进版话术：</span>{h.improved_version}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Skill gap + Next steps */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {weakness.length > 0 && (
            <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-3.5">
              <h3 className="text-[10px] font-semibold text-[#6e7681] uppercase tracking-wider mb-3">技能短板</h3>
              <div className="space-y-2">
                {weakness.map((w, i) => {
                  const levelColors: Record<string, string> = { '弱': '#f85149', '待提升': '#f0883e', '一般': '#d29922', '强': '#3fb950' };
                  const levelWidths: Record<string, string> = { '弱': '25%', '待提升': '40%', '一般': '60%', '强': '85%' };
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[10px] text-[#8b949e] min-w-[56px]">{w.skill}</span>
                      <div className="flex-1 h-1 bg-[#21262d] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: levelWidths[w.level] || '40%', backgroundColor: levelColors[w.level] || '#f0883e' }}
                        />
                      </div>
                      <span className="text-[9px] min-w-[32px]" style={{ color: levelColors[w.level] || '#8b949e' }}>{w.level}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {nextSteps.length > 0 && (
            <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-3.5">
              <h3 className="text-[10px] font-semibold text-[#6e7681] uppercase tracking-wider mb-3">下一步建议</h3>
              <div className="text-[11px] text-[#8b949e] leading-relaxed space-y-2">
                {nextSteps.sort((a, b) => a.priority - b.priority).map((ns, i) => (
                  <p key={i} className="ml-1">
                    <span className="text-[#e6edf3] font-medium">{ns.priority}.</span> {ns.action}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
