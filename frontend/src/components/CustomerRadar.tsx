import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts';
import type { ScoreDimension } from '../types';

const DIMENSION_LABELS: Record<string, string> = {
  wealth_scale: '财富规模',
  risk_tolerance: '风险承受力',
  investment_experience: '投资经验',
  need_urgency: '需求紧迫度',
  customer_potential: '客户潜力',
  communication_difficulty: '沟通难度',
};

interface Props {
  dimensions: ScoreDimension[];
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ScoreDimension }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-md px-3 py-2 shadow-git-lg">
      <p className="text-xs font-semibold text-[var(--text-primary)] mb-1">{d.label}</p>
      <p className="text-lg font-bold text-[var(--accent-blue)] font-mono tabular-nums">{d.value}<span className="text-xs text-[var(--text-tertiary)]">/10</span></p>
      <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 max-w-[200px] leading-relaxed">{d.reasoning}</p>
    </div>
  );
}

export default function CustomerRadar({ dimensions }: Props) {
  if (!dimensions.length) return null;

  const data = dimensions.map(d => ({
    ...d,
    label: DIMENSION_LABELS[d.key] || d.key,
  }));

  return (
    <div className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-md p-4">
      <h4 className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-3">
        客户评分雷达
        <span className="ml-2 font-normal normal-case text-[10px] text-[var(--text-placeholder)]">1-10分制</span>
      </h4>
      <ResponsiveContainer width="100%" height={320}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
          <PolarGrid stroke="var(--border-subtle)" strokeWidth={1} />
          <PolarAngleAxis
            dataKey="label"
            tick={{ fill: 'var(--text-secondary)', fontSize: 12, fontWeight: 500 }}
            stroke="var(--border-default)"
          />
          <PolarRadiusAxis
            angle={30}
            domain={[0, 10]}
            tick={{ fill: 'var(--text-placeholder)', fontSize: 10, fontWeight: 400 }}
            axisLine={false}
            tickCount={6}
          />
          <Radar
            name="评分"
            dataKey="value"
            stroke="var(--accent-blue)"
            strokeWidth={1.5}
            fill="var(--accent-blue)"
            fillOpacity={0.15}
            dot={{ r: 3, fill: 'var(--accent-blue)', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: 'var(--accent-blue)', stroke: 'var(--accent-blue)', strokeWidth: 2 }}
          />
          <Tooltip content={<CustomTooltip />} />
        </RadarChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-2">
        {data.map(d => (
          <div key={d.key} className="flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)]">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
            <span className="truncate">{d.label}</span>
            <span className="font-mono text-[var(--accent-blue)] ml-auto">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
