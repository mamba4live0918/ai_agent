import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { TrainingReview as TrainingReviewType, TrainingSessionDetail } from '../types';

interface Props {
  review: TrainingReviewType;
  session: TrainingSessionDetail;
  onBack?: () => void;
}

function getScoreColor(v: number): string {
  if (v >= 8) return 'var(--accent-green)';
  if (v >= 6) return 'var(--accent-orange)';
  if (v >= 4) return 'var(--accent-orange)';
  return 'var(--accent-red)';
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
    <div className="flex flex-col h-full bg-[var(--bg-primary)]">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-3 py-2.5 bg-[var(--bg-primary)] border-b-2 border-[var(--border-subtle)] flex-shrink-0">
        {onBack && (
          <button onClick={onBack} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs">← 返回</button>
        )}
        <span className="text-sm text-[var(--text-primary)] font-semibold">复盘报告</span>
        <span className="text-[10px] text-[var(--text-placeholder)]">|</span>
        <span className="text-[11px] text-[var(--text-secondary)]">👤 {session.persona?.name || '未知'} · {session.scenario}</span>
        <span className="text-[10px] text-[var(--text-placeholder)]">{new Date(review.created_at).toLocaleString('zh-CN')}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Score overview */}
        <div className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg p-3.5">
          <h3 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-3">评分概览</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {scoreCards.map(card => (
              <div key={card.key} className={`rounded-lg p-3 text-center ${card.primary ? 'bg-[var(--bg-overlay)] border border-[var(--border-default)]' : 'bg-[var(--bg-secondary)] border border-[var(--border-default)]'}`}>
                <div className="text-[10px] text-[var(--text-tertiary)] mb-1">{card.label}</div>
                <div className={`text-2xl font-bold ${card.primary ? 'text-[var(--text-primary)]' : ''}`} style={{ color: card.primary ? undefined : getScoreColor(card.value || 0) }}>
                  {card.value ?? '—'}
                </div>
                <div className="text-[9px] text-[var(--text-placeholder)]">/ 10</div>
                <div className="mt-1.5 h-1 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
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
          <div className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg p-3.5">
            <h3 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-3">能力雷达图</h3>
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="var(--border-subtle)" />
                <PolarAngleAxis dataKey="dimension" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
                <PolarRadiusAxis angle={30} domain={[0, 10]} tick={{ fill: 'var(--text-placeholder)', fontSize: 9 }} />
                <Radar name="评分" dataKey="value" stroke="var(--accent-blue)" fill="var(--accent-blue)" fillOpacity={0.15} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg p-3.5">
            <h3 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-3">历史趋势</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData}>
                <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
                <YAxis domain={[0, 10]} tick={{ fill: 'var(--text-placeholder)', fontSize: 9 }} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 6, fontSize: 11 }}
                  labelStyle={{ color: 'var(--text-primary)' }}
                />
                <Line type="monotone" dataKey="综合" stroke="var(--accent-blue)" strokeWidth={2} dot={{ fill: 'var(--accent-blue)', r: 4 }} />
                <Line type="monotone" dataKey="表达逻辑" stroke="var(--accent-green)" strokeWidth={1.5} dot={{ fill: 'var(--accent-green)', r: 3 }} />
                <Line type="monotone" dataKey="情绪情商" stroke="var(--accent-orange)" strokeWidth={1.5} dot={{ fill: 'var(--accent-orange)', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-[9px] text-[var(--text-placeholder)] text-center mt-1">趋势数据将在多次训练后累积展示</p>
          </div>
        </div>

        {/* Coach overall assessment */}
        {review.overall_comment && (
          <div className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg p-3.5">
            <h3 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-3">教练总评</h3>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{review.overall_comment}</p>
          </div>
        )}

        {/* Phrasing comparison */}
        {highlights.length > 0 && (
          <div className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg p-3.5">
            <h3 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-3">话术点评</h3>
            <div className="space-y-2.5">
              {highlights.map((h, i) => (
                <div key={i} className="border border-[var(--border-subtle)] rounded-md overflow-hidden">
                  <div className={`px-3 py-1.5 text-[10px] border-b border-[var(--border-subtle)] ${h.type === 'good' ? 'bg-[var(--bg-secondary)] text-[var(--accent-green)]' : 'bg-[var(--bg-secondary)] text-[var(--accent-red)]'}`}>
                    {h.type === 'good' ? '👍 表现好的回复' : '👎 需要改进的回复'}
                  </div>
                  <div className="px-3 py-2 text-[11px] text-[var(--text-primary)] leading-relaxed">{h.message_content}</div>
                  <div className={`px-3 py-1.5 text-[10px] border-t border-[var(--border-subtle)] ${h.type === 'good' ? 'bg-[var(--bg-primary)] text-[var(--accent-green)]' : 'bg-[var(--bg-primary)] text-[var(--accent-red)]'}`}>
                    {h.type === 'good' ? '✓ ' : '✗ '}{h.comment}
                  </div>
                  {h.improved_version && (
                    <div className="px-3 py-2 text-[11px] text-[var(--accent-blue)] leading-relaxed border-t border-[var(--border-default)] bg-[var(--bg-primary)]">
                      <span className="text-[10px] text-[var(--accent-blue)] font-semibold">🔧 改进版话术：</span>{h.improved_version}
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
            <div className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg p-3.5">
              <h3 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-3">技能短板</h3>
              <div className="space-y-2">
                {weakness.map((w, i) => {
                  const levelColors: Record<string, string> = { '弱': 'var(--accent-red)', '待提升': 'var(--accent-orange)', '一般': 'var(--accent-orange)', '强': 'var(--accent-green)' };
                  const levelWidths: Record<string, string> = { '弱': '25%', '待提升': '40%', '一般': '60%', '强': '85%' };
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[10px] text-[var(--text-secondary)] min-w-[56px]">{w.skill}</span>
                      <div className="flex-1 h-1 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: levelWidths[w.level] || '40%', backgroundColor: levelColors[w.level] || 'var(--accent-orange)' }}
                        />
                      </div>
                      <span className="text-[9px] min-w-[32px]" style={{ color: levelColors[w.level] || 'var(--text-secondary)' }}>{w.level}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {nextSteps.length > 0 && (
            <div className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg p-3.5">
              <h3 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-3">下一步建议</h3>
              <div className="text-[11px] text-[var(--text-secondary)] leading-relaxed space-y-2">
                {nextSteps.sort((a, b) => a.priority - b.priority).map((ns, i) => (
                  <p key={i} className="ml-1">
                    <span className="text-[var(--text-primary)] font-medium">{ns.priority}.</span> {ns.action}
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
