import { useState } from 'react';
import { analyzeCustomer, createCustomer } from '../services/api';
import type { CustomerProfile } from '../types';

export default function CustomerForm({ onCreated }: { onCreated: () => void }) {
  const [mode, setMode] = useState<'text' | 'form'>('text');
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [error, setError] = useState('');

  // Form fields
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [occupation, setOccupation] = useState('');
  const [assets, setAssets] = useState('');
  const [riskPreference, setRiskPreference] = useState('');

  const handleAnalyze = async () => {
    if (!rawText.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await analyzeCustomer(rawText);
      setProfile(result);
    } catch {
      setError('分析失败，请检查后端服务');
    }
    setLoading(false);
  };

  const handleSave = async () => {
    try {
      if (profile) {
        await createCustomer({ name: profile.name, raw_input: rawText, structured_data: profile.structured_data as Record<string, unknown> | undefined, ai_profile: profile.ai_profile as Record<string, unknown> | undefined, scores: profile.scores ?? undefined });
      } else {
        await createCustomer({
          name: name || '未命名',
          structured_data: {
            age: age || null,
            gender: gender || '未知',
            occupation,
            assets,
            risk_preference: riskPreference,
          },
        });
      }
      setProfile(null);
      setRawText('');
      setName('');
      setAge('');
      setGender('');
      setOccupation('');
      setAssets('');
      setRiskPreference('');
      onCreated();
    } catch {
      setError('保存失败');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">新建客户</h3>
        {/* Mode tabs */}
        <div className="flex rounded-xl border border-[var(--border-default)] overflow-hidden">
          <button onClick={() => setMode('text')}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              mode === 'text'
                ? 'bg-[var(--btn-blue)] text-white'
                : 'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
            }`}>
            自由文本
          </button>
          <button onClick={() => setMode('form')}
            className={`px-3 py-1 text-xs font-medium border-l border-[var(--border-default)] transition-colors ${
              mode === 'form'
                ? 'bg-[var(--btn-blue)] text-white'
                : 'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
            }`}>
            表单录入
          </button>
        </div>
      </div>

      {mode === 'text' ? (
        <div className="space-y-3">
          <textarea
            value={rawText}
            onChange={e => setRawText(e.target.value)}
            placeholder="粘贴客户描述文字... 例如：张总，45岁，私企老板，两个孩子，保守型投资者，资产规模500万以上..."
            rows={5}
            className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-placeholder)] focus:border-[var(--accent-blue)] focus:shadow-[0_0_0_3px_rgba(88,166,255,0.15)] outline-none resize-none transition-all font-mono"
          />
          <div className="flex gap-2">
            <button onClick={handleAnalyze} disabled={loading || !rawText.trim()} className="btn btn-secondary text-sm">
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Z"/>
                <path d="M5.5 5.5a.75.75 0 0 1 1.5 0v.75h.75a.75.75 0 0 1 0 1.5H7v.75a.75.75 0 0 1-1.5 0v-.75h-.75a.75.75 0 0 1 0-1.5h.75v-.75ZM11 7.5a.5.5 0 0 1 1 0 .5.5 0 0 1-1 0Zm-.25 2.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0Z"/>
              </svg>
              {loading ? '分析中...' : 'AI 分析'}
            </button>
            {profile && (
              <button onClick={handleSave} className="btn btn-primary text-sm">
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M11.28 6.78a.75.75 0 0 0-1.06-1.06L7.25 8.69 5.78 7.22a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l3.5-3.5Z"/>
                </svg>
                保存客户
              </button>
            )}
          </div>
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">姓名</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-placeholder)] focus:border-[var(--accent-blue)] focus:shadow-[0_0_0_3px_rgba(88,166,255,0.15)] outline-none transition-all" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">年龄</label>
              <input type="text" value={age} onChange={e => setAge(e.target.value)}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-placeholder)] focus:border-[var(--accent-blue)] focus:shadow-[0_0_0_3px_rgba(88,166,255,0.15)] outline-none transition-all" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">性别</label>
              <select value={gender} onChange={e => setGender(e.target.value)}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-3 py-1.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent-blue)] focus:shadow-[0_0_0_3px_rgba(88,166,255,0.15)] outline-none transition-all">
                <option value="">未知</option>
                <option value="男">男</option>
                <option value="女">女</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">职业</label>
              <input type="text" value={occupation} onChange={e => setOccupation(e.target.value)}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-placeholder)] focus:border-[var(--accent-blue)] focus:shadow-[0_0_0_3px_rgba(88,166,255,0.15)] outline-none transition-all" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">资产状况</label>
              <input type="text" value={assets} onChange={e => setAssets(e.target.value)}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-placeholder)] focus:border-[var(--accent-blue)] focus:shadow-[0_0_0_3px_rgba(88,166,255,0.15)] outline-none transition-all" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">风险偏好</label>
              <select value={riskPreference} onChange={e => setRiskPreference(e.target.value)}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-full px-3 py-1.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent-blue)] focus:shadow-[0_0_0_3px_rgba(88,166,255,0.15)] outline-none transition-all">
                <option value="">未知</option>
                <option value="保守">保守</option>
                <option value="稳健">稳健</option>
                <option value="激进">激进</option>
              </select>
            </div>
          </div>
          <button onClick={handleSave} disabled={!name.trim()} className="btn btn-primary text-sm">
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.28 6.78a.75.75 0 0 0-1.06-1.06L7.25 8.69 5.78 7.22a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l3.5-3.5Z"/>
            </svg>
            保存客户
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--btn-danger)]/10 border border-[var(--btn-danger)]/30 text-sm text-[var(--accent-red)]">
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Z"/>
            <path d="M7.25 5a.75.75 0 0 1 1.5 0v3a.75.75 0 0 1-1.5 0V5Zm.75 5.75a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Z"/>
          </svg>
          {error}
        </div>
      )}
    </div>
  );
}
