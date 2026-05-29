import { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { saveAllocationPlan, generateAllocationPlan } from '../services/api';
import type { Customer, AllocationSubPlan } from '../types';

interface Props {
  customer: Customer;
  onUpdate: (updated: Customer) => void;
}

const PLAN_KEYS = ['conservative', 'balanced', 'aggressive'] as const;
const DONUT_COLORS = ['var(--accent-blue)', 'var(--accent-green)', 'var(--accent-orange)', 'var(--accent-purple)', 'var(--accent-red)', '#58a6ff'];
const PLAN_LABELS: Record<string, string> = { conservative: '保守型', balanced: '稳健型', aggressive: '激进型' };
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
        <svg className="w-10 h-10 text-[var(--text-placeholder)] mx-auto mb-3" viewBox="0 0 16 16" fill="currentColor">
          <path fillRule="evenodd" d="M0 1.75A.75.75 0 0 1 .75 1h4.253c1.227 0 2.317.59 3 1.501A3.744 3.744 0 0 1 11.006 1h4.245a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75h-4.507a2.25 2.25 0 0 0-1.591.659l-.622.621a.75.75 0 0 1-1.06 0l-.622-.621A2.25 2.25 0 0 0 5.258 13H.75a.75.75 0 0 1-.75-.75V1.75Z"/>
        </svg>
        <p className="text-sm text-[var(--text-placeholder)] mb-3">暂无配置方案</p>
        <button onClick={async () => { setGenerating(true); const updated = await generateAllocationPlan(customer.id) as Customer; onUpdate(updated); setGenerating(false); }}
          disabled={generating} className="btn btn-primary text-xs rounded-full transition-all duration-200">
          {generating ? 'AI 生成中...' : '生成配置方案'}
        </button>
      </div>
    );
  }

  const planSource = viewMode === 'ai' ? ap.ai_plan : ap.user_plan;
  const plan: AllocationSubPlan | undefined = planSource?.[planTab];
  if (!plan) return <p className="text-sm text-[var(--text-placeholder)] text-center py-4">方案数据缺失</p>;

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
              className={`px-3 py-1.5 text-xs rounded-full border transition-all duration-200 ${
                planTab === k ? 'border-[var(--accent-blue)] text-[var(--text-primary)] bg-[var(--bg-overlay)]' : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}>{PLAN_LABELS[k]}</button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-full p-0.5">
            <button onClick={() => setViewMode('ai')}
              className={`px-2.5 py-1 text-[10px] rounded-full transition-all duration-200 ${viewMode === 'ai' ? 'bg-[var(--btn-blue)] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>AI 方案</button>
            <button onClick={() => setViewMode('user')}
              className={`px-2.5 py-1 text-[10px] rounded-full transition-all duration-200 ${viewMode === 'user' ? 'bg-[var(--btn-blue)] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>我的调整</button>
          </div>
          {!editing ? (
            <button onClick={startEditing} className="btn btn-secondary text-xs rounded-full transition-all duration-200">编辑配置</button>
          ) : (
            <div className="flex gap-1.5">
              <button onClick={resetToAi} className="btn btn-secondary text-xs rounded-full transition-all duration-200">重置为 AI 方案</button>
              <button onClick={saveEdits} disabled={!valid || saving}
                className="btn btn-primary text-xs disabled:opacity-50">{saving ? '保存中...' : '保存调整'}</button>
              <button onClick={() => setEditing(false)} className="btn btn-secondary text-xs rounded-full transition-all duration-200">取消</button>
            </div>
          )}
        </div>
      </div>

      {/* Summary card */}
      <div className="bg-[var(--bg-primary)] rounded-xl p-3.5 shadow-sm">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-2 h-2 rounded-full" className="w-2 h-2 rounded-full bg-[var(--accent-blue)]" />
          <h5 className="text-xs font-semibold text-[var(--text-primary)]">{plan.plan_type} — 组合概要</h5>
        </div>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-2">{plan.overall_rationale}</p>
        <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">{plan.risk_return_profile}</p>
      </div>

      {/* Donut chart + legend */}
      <div className="bg-[var(--bg-primary)] rounded-xl p-4 shadow-sm">
        <h4 className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-3">配置明细</h4>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="w-40 h-40 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={plan.allocations} dataKey="ratio" nameKey="product_name" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2}>
                  {plan.allocations.map((_, idx) => (
                    <Cell key={idx} fill={DONUT_COLORS[idx % DONUT_COLORS.length]} stroke="var(--bg-primary)" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 8, fontSize: 11 }}
                  formatter={(_v: unknown, _n: unknown, props: unknown) => [`${Math.round((props as { payload: { ratio: number } }).payload.ratio * 100)}%`, (props as { payload: { product_name: string } }).payload.product_name]} />
              </PieChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-[var(--text-placeholder)] text-center mt-1">{plan.allocations.length} 个产品</p>
          </div>
          <div className="flex-1 space-y-2 min-w-0">
            {plan.allocations.map((a, idx) => (
              <div key={a.product_id} className="text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: DONUT_COLORS[idx % DONUT_COLORS.length] }} />
                  <span className="text-[var(--text-primary)] truncate flex-1 font-medium">{a.product_name}</span>
                  <span className="font-mono text-[var(--text-primary)] flex-shrink-0">{Math.round(a.ratio * 100)}%</span>
                  <span className="text-[var(--text-placeholder)] flex-shrink-0">{a.amount.toLocaleString()}元</span>
                </div>
                {a.reason && <p className="text-[10px] text-[var(--text-placeholder)] mt-0.5 ml-[18px]">{a.reason}</p>}
              </div>
            ))}
          </div>
        </div>
        {/* Edit mode sliders */}
        {editing && (
          <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] space-y-2">
            {plan.allocations.map(a => (
              <div key={a.product_id} className="flex items-center gap-3">
                <span className="text-xs text-[var(--text-primary)] w-24 flex-shrink-0 truncate">{a.product_name}</span>
                <input type="range" min={0} max={100} value={editRatios[a.product_id] || 0}
                  onChange={e => handleSliderChange(a.product_id, Number(e.target.value))}
                  className="flex-1 h-1 accent-[var(--accent-blue)]" />
                <input type="text" value={editRatios[a.product_id] || 0}
                  onChange={e => handleInputChange(a.product_id, e.target.value.replace(/\D/g, ''))}
                  className="w-14 bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded px-1.5 py-0.5 text-[11px] text-center focus:border-[var(--accent-blue)] outline-none" />
                <span className="text-xs font-mono w-8 text-right">%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <div className="flex items-center gap-2 text-[10px]">
          <span>总和：</span>
          <span className={`font-mono font-semibold ${valid ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]'}`}>{editSum}%</span>
          {!valid && <span className="text-[var(--accent-red)]">（需为 100%）</span>}
        </div>
      )}
    </div>
  );
}
