import { useState } from 'react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { saveAllocationPlan, generateAllocationPlan } from '../services/api';
import type { Customer, AllocationSubPlan } from '../types';

interface Props {
  customer: Customer;
  onUpdate: (updated: Customer) => void;
}

const PLAN_KEYS = ['conservative', 'balanced', 'aggressive'] as const;
const PLAN_LABELS: Record<string, string> = { conservative: '保守型', balanced: '稳健型', aggressive: '进取型' };
const PRODUCT_COLORS = ['#58a6ff', '#3fb950', '#d29922', '#f85149', '#a371f7', '#79c0ff'];

export default function AllocationPlan({ customer, onUpdate }: Props) {
  const [planTab, setPlanTab] = useState<string>('conservative');
  const [viewMode, setViewMode] = useState<'ai' | 'user'>('ai');
  const [editing, setEditing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editRatios, setEditRatios] = useState<Record<string, number>>({});

  const ap = customer.allocation_plan;
  if (!ap) {
    return (
      <div className="text-center py-8">
        <svg className="w-10 h-10 text-[#21262d] mx-auto mb-3" viewBox="0 0 16 16" fill="currentColor">
          <path fillRule="evenodd" d="M0 1.75A.75.75 0 0 1 .75 1h4.253c1.227 0 2.317.59 3 1.501A3.744 3.744 0 0 1 11.006 1h4.245a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75h-4.507a2.25 2.25 0 0 0-1.591.659l-.622.621a.75.75 0 0 1-1.06 0l-.622-.621A2.25 2.25 0 0 0 5.258 13H.75a.75.75 0 0 1-.75-.75V1.75Z"/>
        </svg>
        <p className="text-sm text-[#484f58] mb-3">暂无配置方案</p>
        <button onClick={async () => { setGenerating(true); const updated = await generateAllocationPlan(customer.id) as Customer; onUpdate(updated); setGenerating(false); }}
          disabled={generating} className="btn btn-primary text-xs">
          {generating ? 'AI 生成中...' : '生成配置方案'}
        </button>
      </div>
    );
  }

  const planSource = viewMode === 'ai' ? ap.ai_plan : ap.user_plan;
  const plan: AllocationSubPlan | undefined = planSource?.[planTab];
  if (!plan) return <p className="text-sm text-[#484f58] text-center py-4">方案数据缺失</p>;

  const chartData = plan.allocations.map(a => ({
    name: a.product_name.length > 20 ? a.product_name.slice(0, 20) + '...' : a.product_name,
    fullName: a.product_name,
    ratio: Math.round(a.ratio * 100),
    amount: a.amount,
  }));

  const totalInvestable = ap.total_investable || plan.allocations.reduce((s, a) => s + a.amount / (a.ratio || 0.01), 0) / plan.allocations.length || 1000000;

  const startEditing = () => {
    const ratios: Record<string, number> = {};
    plan.allocations.forEach(a => { ratios[a.product_id] = Math.round(a.ratio * 100); });
    setEditRatios(ratios);
    setEditing(true);
  };

  const handleSliderChange = (productId: string, value: number) => {
    setEditRatios(prev => ({ ...prev, [productId]: value }));
  };

  const handleInputChange = (productId: string, value: string) => {
    const n = parseInt(value, 10);
    if (!isNaN(n) && n >= 0 && n <= 100) {
      setEditRatios(prev => ({ ...prev, [productId]: n }));
    }
  };

  const editSum = Object.values(editRatios).reduce((s, v) => s + v, 0);
  const valid = editSum === 100;

  const resetToAi = () => {
    const ratios: Record<string, number> = {};
    const aiPlan = ap.ai_plan?.[planTab];
    if (aiPlan) {
      aiPlan.allocations.forEach(a => { ratios[a.product_id] = Math.round(a.ratio * 100); });
    }
    setEditRatios(ratios);
  };

  const saveEdits = async () => {
    if (!valid) return;
    setSaving(true);
    const updatedUserPlan = JSON.parse(JSON.stringify(ap.user_plan || ap.ai_plan));
    const targetPlan = updatedUserPlan[planTab];
    if (targetPlan) {
      targetPlan.allocations = plan.allocations.map(a => ({
        ...a,
        ratio: (editRatios[a.product_id] || 0) / 100,
        amount: Math.round(((editRatios[a.product_id] || 0) / 100) * totalInvestable),
      }));
    }
    const updated = await saveAllocationPlan(customer.id, updatedUserPlan, totalInvestable) as Customer;
    onUpdate(updated);
    setEditing(false);
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      {/* Top controls */}
      <div className="flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center">
        <div className="flex gap-1">
          {PLAN_KEYS.map(k => (
            <button key={k} onClick={() => { setPlanTab(k); setEditing(false); }}
              className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                planTab === k ? 'border-[#58a6ff] text-[#e6edf3] bg-[#1c2128]' : 'border-[#21262d] text-[#8b949e] hover:text-[#c9d1d9]'
              }`}>{PLAN_LABELS[k]}</button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-[#0d1117] border border-[#21262d] rounded p-0.5">
            <button onClick={() => setViewMode('ai')}
              className={`px-2.5 py-1 text-[10px] rounded transition-colors ${viewMode === 'ai' ? 'bg-[#1f6feb] text-white' : 'text-[#8b949e] hover:text-[#e6edf3]'}`}>AI 方案</button>
            <button onClick={() => setViewMode('user')}
              className={`px-2.5 py-1 text-[10px] rounded transition-colors ${viewMode === 'user' ? 'bg-[#1f6feb] text-white' : 'text-[#8b949e] hover:text-[#e6edf3]'}`}>我的调整</button>
          </div>
          {!editing ? (
            <button onClick={startEditing} className="btn btn-secondary text-xs">编辑配置</button>
          ) : (
            <div className="flex gap-1.5">
              <button onClick={resetToAi} className="btn btn-secondary text-xs">重置为 AI 方案</button>
              <button onClick={saveEdits} disabled={!valid || saving}
                className="btn btn-primary text-xs disabled:opacity-50">{saving ? '保存中...' : '保存调整'}</button>
              <button onClick={() => setEditing(false)} className="btn btn-secondary text-xs">取消</button>
            </div>
          )}
        </div>
      </div>

      {/* Summary card */}
      <div className="bg-[#0d1117] border border-[#21262d] rounded-md p-3.5">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PRODUCT_COLORS[0] }} />
          <h5 className="text-xs font-semibold text-[#e6edf3]">{plan.plan_type} — 组合概要</h5>
        </div>
        <p className="text-xs text-[#8b949e] leading-relaxed mb-2">{plan.overall_rationale}</p>
        <p className="text-xs text-[#6e7681] leading-relaxed mb-3">{plan.risk_return_profile}</p>

        {/* Stacked bar chart */}
        <div style={{ height: 40 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barSize={28}>
              <XAxis type="number" domain={[0, 100]} hide />
              <Tooltip
                contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, fontSize: 11 }}
                formatter={(_value: unknown, _name: unknown, props: unknown) => [`${(props as { payload: { ratio: number } }).payload.ratio}%`, (props as { payload: { fullName: string } }).payload.fullName]}
              />
              <Bar dataKey="ratio" stackId="a" radius={0}>
                {chartData.map((_, idx) => (
                  <Cell key={idx} fill={PRODUCT_COLORS[idx % PRODUCT_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Allocation details */}
      <h4 className="text-[11px] font-semibold text-[#6e7681] uppercase tracking-wider">配置明细</h4>
      <div className="space-y-1.5">
        {plan.allocations.map(a => (
          <div key={a.product_id} className="bg-[#0d1117] border border-[#21262d] rounded-md px-3 py-2.5">
            {editing ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-[#e6edf3] w-24 flex-shrink-0 truncate">{a.product_name}</span>
                <input type="range" min={0} max={100} value={editRatios[a.product_id] || 0}
                  onChange={e => handleSliderChange(a.product_id, Number(e.target.value))}
                  className="flex-1 h-1 accent-[#58a6ff]" />
                <span className="text-xs font-mono text-[#e6edf3] w-8 text-right">{editRatios[a.product_id] || 0}%</span>
                <input type="text" value={editRatios[a.product_id] || 0}
                  onChange={e => handleInputChange(a.product_id, e.target.value.replace(/\D/g, ''))}
                  className="w-12 bg-[#161b22] border border-[#30363d] rounded px-1.5 py-0.5 text-[11px] text-[#e6edf3] text-center focus:border-[#58a6ff] outline-none" />
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-mono font-semibold text-[#e6edf3] w-10 flex-shrink-0">{Math.round(a.ratio * 100)}%</span>
                  <div className="min-w-0">
                    <span className="text-xs text-[#e6edf3]">{a.product_name}</span>
                    <p className="text-[10px] text-[#484f58] mt-0.5">{a.reason}</p>
                  </div>
                </div>
                <span className="text-[11px] text-[#8b949e] flex-shrink-0 ml-3">{a.amount.toLocaleString()} 元</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <div className="flex items-center gap-2 text-[10px]">
          <span>总和：</span>
          <span className={`font-mono font-semibold ${valid ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>{editSum}%</span>
          {!valid && <span className="text-[#f85149]">（需为 100%）</span>}
        </div>
      )}
    </div>
  );
}
