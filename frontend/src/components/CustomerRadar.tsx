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
    <div className="bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2 shadow-git-lg">
      <p className="text-xs font-semibold text-[#e6edf3] mb-1">{d.label}</p>
      <p className="text-lg font-bold text-[#58a6ff] font-mono tabular-nums">{d.value}<span className="text-xs text-[#6e7681]">/10</span></p>
      <p className="text-[11px] text-[#8b949e] mt-0.5 max-w-[200px] leading-relaxed">{d.reasoning}</p>
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
    <div className="bg-[#0d1117] border border-[#21262d] rounded-md p-4">
      <h4 className="text-[11px] font-semibold text-[#6e7681] uppercase tracking-wider mb-3">
        客户评分雷达
        <span className="ml-2 font-normal normal-case text-[10px] text-[#484f58]">1-10分制</span>
      </h4>
      <ResponsiveContainer width="100%" height={320}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
          <PolarGrid stroke="#21262d" strokeWidth={1} />
          <PolarAngleAxis
            dataKey="label"
            tick={{ fill: '#8b949e', fontSize: 12, fontWeight: 500 }}
            stroke="#30363d"
          />
          <PolarRadiusAxis
            angle={30}
            domain={[0, 10]}
            tick={{ fill: '#484f58', fontSize: 10, fontWeight: 400 }}
            axisLine={false}
            tickCount={6}
          />
          <Radar
            name="评分"
            dataKey="value"
            stroke="#58a6ff"
            strokeWidth={1.5}
            fill="#58a6ff"
            fillOpacity={0.15}
            dot={{ r: 3, fill: '#58a6ff', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#79c0ff', stroke: '#58a6ff', strokeWidth: 2 }}
          />
          <Tooltip content={<CustomTooltip />} />
        </RadarChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-2">
        {data.map(d => (
          <div key={d.key} className="flex items-center gap-1.5 text-[10px] text-[#8b949e]">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
            <span className="truncate">{d.label}</span>
            <span className="font-mono text-[#58a6ff] ml-auto">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
