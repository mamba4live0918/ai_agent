import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { NavPoint } from '../types';

interface Props {
  data: NavPoint[];
  source?: string;
  productType?: string;
}

export default function ProductNavChart({ data, source }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-[var(--accent-orange)] font-medium">该产品未获得实时数据或实时数据未公开</p>
        {source === 'eastmoney' && <p className="text-[10px] text-[var(--text-placeholder)] mt-1">数据来源：东方财富</p>}
      </div>
    );
  }

  const chartData = data.map(p => ({
    date: p.date.slice(0, 7),
    nav: p.nav,
    return: p.return_rate,
  }));

  return (
    <div className="w-full" style={{ height: 100 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="navGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-green)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--accent-green)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-placeholder)' }} axisLine={false} tickLine={false} interval={2} />
          <YAxis domain={['dataMin - 0.02', 'dataMax + 0.02']} tick={{ fontSize: 9, fill: 'var(--text-placeholder)' }} axisLine={false} tickLine={false} width={36} />
          <Tooltip
            contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 6, fontSize: 11 }}
            labelStyle={{ color: 'var(--text-secondary)' }}
            formatter={(value: unknown, name: unknown) => {
              const num = value as number;
              const n = name as string;
              if (n === 'nav') return [`${num.toFixed(4)}`, '净值'];
              return [`${num.toFixed(2)}%`, '收益率'];
            }}
          />
          <Area type="monotone" dataKey="nav" stroke="var(--accent-green)" strokeWidth={1.5} fill="url(#navGradient)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
