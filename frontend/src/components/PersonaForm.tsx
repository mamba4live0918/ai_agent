import { useState } from 'react';
import type { Persona } from '../types';

const FIELDS: { key: keyof Persona; label: string; placeholder: string }[] = [
  { key: 'name', label: '姓名', placeholder: '如：张伟' },
  { key: 'age', label: '年龄', placeholder: '如：35' },
  { key: 'gender', label: '性别', placeholder: '如：男' },
  { key: 'occupation', label: '职业', placeholder: '如：企业高管' },
  { key: 'personality', label: '性格特征', placeholder: '如：理性冷静，善于分析，但对新产品持谨慎态度' },
  { key: 'investment_experience', label: '投资经验', placeholder: '如：5年基金投资经验' },
  { key: 'wealth_level', label: '财富水平', placeholder: '如：可投资资产约500万' },
  { key: 'risk_preference', label: '风险偏好', placeholder: '保守 / 稳健 / 进取' },
  { key: 'goals', label: '理财目标', placeholder: '如：资产稳健增值，子女教育金储备' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (persona: Persona, scenario: string) => void;
  loading?: boolean;
}

export default function PersonaForm({ visible, onClose, onSubmit, loading }: Props) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [scenario, setScenario] = useState('异议处理');

  if (!visible) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim()) return;
    const age = form.age ? parseInt(form.age, 10) : undefined;
    const persona: Persona = {
      name: form.name,
      age: isNaN(age as number) ? undefined : age,
      gender: form.gender || undefined,
      occupation: form.occupation || undefined,
      personality: form.personality || undefined,
      investment_experience: form.investment_experience || undefined,
      wealth_level: form.wealth_level || undefined,
      risk_preference: form.risk_preference || undefined,
      goals: form.goals || undefined,
    };
    onSubmit(persona, scenario);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">手动创建数字人</h3>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-3">
          {FIELDS.map(f => (
            <div key={f.key}>
              <label className="block text-[10px] font-medium text-[var(--text-secondary)] uppercase mb-1">{f.label}</label>
              <input
                type="text"
                placeholder={f.placeholder}
                value={form[f.key] || ''}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-placeholder)] focus:outline-none focus:border-[var(--accent-blue)]"
              />
            </div>
          ))}
          <div>
            <label className="block text-[10px] font-medium text-[var(--text-secondary)] uppercase mb-1">训练场景</label>
            <div className="flex gap-2">
              {['客诉处理', '产品讲解', '异议处理'].map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScenario(s)}
                  className={`flex-1 px-2 py-1.5 rounded text-[11px] border transition-colors ${
                    scenario === s
                      ? 'border-[var(--accent-blue)] bg-[var(--btn-blue)]/20 text-[var(--accent-blue)]'
                      : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </form>
        <div className="px-4 py-3 border-t border-[var(--border-subtle)] flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-default)] rounded">
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !form.name?.trim()}
            className="px-4 py-1.5 text-[11px] bg-[var(--btn-primary)] text-white rounded hover:bg-[var(--btn-primary-hover)] disabled:opacity-50 transition-colors"
          >
            {loading ? '创建中...' : '创建并开始训练'}
          </button>
        </div>
      </div>
    </div>
  );
}
