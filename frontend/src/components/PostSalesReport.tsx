import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';

interface Props {
  report: Record<string, unknown>;
}

const SENTIMENT_COLORS = { customer: '#58a6ff', salesperson: '#3fb950' };
const PIE_COLORS = ['#58a6ff', '#3fb950', '#8b949e'];
const RADAR_CONFIG = [
  { key: 'communication', label: '沟通效率' },
  { key: 'need_discovery', label: '需求挖掘' },
  { key: 'objection_handling', label: '异议处理' },
  { key: 'closing_skill', label: '促成技巧' },
  { key: 'professionalism', label: '专业度' },
];

export default function PostSalesReport({ report }: Props) {
  // Handle error case
  if (report.error) {
    return (
      <div className="p-8 text-center text-[#f85149]">
        <p className="text-sm">报告生成失败</p>
        <p className="text-xs mt-2 text-[#8b949e]">{String(report.error)}</p>
      </div>
    );
  }

  const summary = (report.summary as string) || '';
  const sentimentTrajectory = (report.sentiment_trajectory as Array<Record<string, unknown>>) || [];
  const keyMoments = (report.key_moments as Array<Record<string, unknown>>) || [];
  const capabilityRadar = (report.capability_radar as Record<string, number>) || {};
  const dealProbability = (report.deal_probability as Record<string, unknown>) || {};
  const missedOpportunities = (report.missed_opportunities as Array<Record<string, unknown>>) || [];
  const strengths = (report.strengths as string[]) || [];
  const improvements = (report.improvements as string[]) || [];
  const overallScore = (report.overall_score as number) || 0;
  const kbMatches = (report.kb_matches as Array<Record<string, unknown>>) || [];

  // Derived data
  const conversationRatio = (() => {
    const all = sentimentTrajectory;
    if (!all || all.length === 0) return [{ name: '无数据', value: 1 }];
    let salespersonChars = 0;
    let customerChars = 0;
    for (const p of all) {
      salespersonChars += String(p.salesperson || '').length;
      customerChars += String(p.customer || '').length;
    }
    if (salespersonChars + customerChars === 0) return [{ name: '无数据', value: 1 }];
    return [
      { name: '销售', value: salespersonChars },
      { name: '客户', value: customerChars },
    ];
  })();

  const radarData = RADAR_CONFIG.map(r => ({
    subject: r.label,
    score: (capabilityRadar[r.key] || 0) * 10,
    fullMark: 100,
  }));

  return (
    <div className="p-6 space-y-8" data-pdf-section="post-sales-report">
      {/* Summary */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[#e6edf3]">通话摘要</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#8b949e]">综合评分</span>
            <span className="text-lg font-bold text-[#58a6ff]">{overallScore.toFixed(1)}</span>
            <span className="text-xs text-[#484f58]">/ 10</span>
          </div>
        </div>
        <p className="text-sm text-[#c9d1d9] leading-relaxed">{summary}</p>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sentiment Trajectory */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
          <h3 className="text-xs font-semibold text-[#e6edf3] mb-3">情绪轨迹</h3>
          {sentimentTrajectory.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={sentimentTrajectory.map((p, i) => ({ ...p, turn: i + 1 }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                <XAxis dataKey="turn" stroke="#484f58" tick={{ fontSize: 11 }} />
                <YAxis domain={[-1, 1]} stroke="#484f58" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, fontSize: 12 }}
                  labelStyle={{ color: '#8b949e' }}
                />
                <Line type="monotone" dataKey="customer_sentiment" name="客户情绪" stroke={SENTIMENT_COLORS.customer} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="salesperson_sentiment" name="销售情绪" stroke={SENTIMENT_COLORS.salesperson} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-[#484f58] text-center py-8">暂无情绪数据</p>
          )}
        </div>

        {/* Conversation Ratio */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
          <h3 className="text-xs font-semibold text-[#e6edf3] mb-3">对话占比</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={conversationRatio} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                {conversationRatio.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Capability Radar + Deal Probability */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Capability Radar */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
          <h3 className="text-xs font-semibold text-[#e6edf3] mb-3">能力评估</h3>
          {radarData.some(d => d.score > 0) ? (
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#21262d" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#8b949e', fontSize: 11 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#484f58', fontSize: 10 }} />
                <Radar name="评分" dataKey="score" stroke="#58a6ff" fill="#58a6ff" fillOpacity={0.15} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-[#484f58] text-center py-8">暂无能力评估数据</p>
          )}
        </div>

        {/* Deal Probability Gauge */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
          <h3 className="text-xs font-semibold text-[#e6edf3] mb-3">成交概率</h3>
          <div className="flex flex-col items-center justify-center h-[240px]">
            <div className="relative w-32 h-16 overflow-hidden">
              <div className="absolute bottom-0 w-32 h-32 rounded-full border-[12px] border-[#21262d]"
                style={{
                  borderTopColor: dealProbability.percentage ? '#3fb950' : '#30363d',
                  borderRightColor: dealProbability.percentage ? '#3fb950' : '#30363d',
                  borderLeftColor: dealProbability.percentage ? '#3fb950' : '#30363d',
                  borderBottomColor: 'transparent',
                  transform: `rotate(${Math.min(((dealProbability.percentage as number) || 0) / 100) * 180, 180}deg)`,
                }}
              />
            </div>
            <span className="text-2xl font-bold text-[#e6edf3] mt-2">
              {String(dealProbability.percentage || 0)}%
            </span>
            <span className={`text-xs mt-1 font-medium ${
              dealProbability.level === '高' ? 'text-[#3fb950]' :
              dealProbability.level === '中' ? 'text-[#d29922]' :
              'text-[#f85149]'
            }`}>
              {String(dealProbability.level || '—')}
            </span>
            {Boolean(dealProbability.reasoning) && (
              <p className="text-[10px] text-[#8b949e] mt-2 text-center max-w-[280px]">
                {String(dealProbability.reasoning)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Key Moments Timeline */}
      {keyMoments.length > 0 && (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
          <h3 className="text-xs font-semibold text-[#e6edf3] mb-4">关键时刻</h3>
          <div className="space-y-0">
            {keyMoments.map((km, i) => {
              const type = String(km.type || '');
              const color = type === 'positive' ? 'border-[#3fb950]' : type === 'negative' ? 'border-[#f85149]' : 'border-[#d29922]';
              const bg = type === 'positive' ? 'bg-[#3fb950]/10' : type === 'negative' ? 'bg-[#f85149]/10' : 'bg-[#d29922]/10';
              return (
                <div key={i} className="flex gap-3 pb-4">
                  <div className={`flex-shrink-0 w-2 h-2 rounded-full mt-1.5 ${color.replace('border', 'bg')}`} />
                  <div className={`flex-1 -ml-4 pl-7 border-l-2 ${color} pb-2`}>
                    <div className={`${bg} border ${color} rounded-md p-3`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          type === 'positive' ? 'bg-[#3fb950]/20 text-[#3fb950]' :
                          type === 'negative' ? 'bg-[#f85149]/20 text-[#f85149]' :
                          'bg-[#d29922]/20 text-[#d29922]'
                        }`}>
                          {type === 'positive' ? '亮点' : type === 'negative' ? '问题' : '关键'}
                        </span>
                        <span className="text-[10px] text-[#484f58]">轮次 {String(km.turn || '?')}</span>
                      </div>
                      <p className="text-xs text-[#c9d1d9] leading-relaxed">{String(km.description || '')}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Missed Opportunities */}
      {missedOpportunities.length > 0 && (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
          <h3 className="text-xs font-semibold text-[#e6edf3] mb-3">错失的机会</h3>
          <div className="space-y-3">
            {missedOpportunities.map((mo, i) => (
              <div key={i} className="border border-[#30363d] rounded-md p-3">
                <p className="text-xs text-[#c9d1d9] mb-1">{String(mo.description || '')}</p>
                <p className="text-[11px] text-[#58a6ff]">
                  <span className="text-[#8b949e]">建议: </span>
                  {String(mo.suggestion || '')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Strengths & Improvements */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {strengths.length > 0 && (
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
            <h3 className="text-xs font-semibold text-[#3fb950] mb-3 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg>
              优势
            </h3>
            <ul className="space-y-1.5">
              {strengths.map((s, i) => (
                <li key={i} className="text-xs text-[#c9d1d9] flex items-start gap-2">
                  <span className="text-[#3fb950] mt-0.5">+</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}
        {improvements.length > 0 && (
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
            <h3 className="text-xs font-semibold text-[#d29922] mb-3 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM5.78 5.22a.75.75 0 0 0-1.06 1.06L6.44 8l-1.72 1.72a.75.75 0 0 0 1.06 1.06L7.5 9.06l1.72 1.72a.75.75 0 0 0 1.06-1.06L8.56 8l1.72-1.72a.75.75 0 0 0-1.06-1.06L7.5 6.94 5.78 5.22Z"/></svg>
              待改进
            </h3>
            <ul className="space-y-1.5">
              {improvements.map((s, i) => (
                <li key={i} className="text-xs text-[#c9d1d9] flex items-start gap-2">
                  <span className="text-[#d29922] mt-0.5">~</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* KB Matches */}
      {kbMatches && kbMatches.length > 0 && (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
          <h3 className="text-xs font-semibold text-[#e6edf3] mb-3">知识库匹配</h3>
          <div className="space-y-2">
            {kbMatches.map((m, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="text-[#58a6ff] mt-0.5">&#9679;</span>
                <div>
                  <span className="text-[#e6edf3] font-medium">{String(m.title || 'Unknown')}</span>
                  {Boolean(m.snippet) && <span className="text-[#8b949e]"> — {String(m.snippet).slice(0, 150)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
