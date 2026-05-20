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
        await createCustomer({ name: profile.name, raw_input: rawText, structured_data: profile.structured_data });
      } else {
        await createCustomer({
          name: name || '未命名',
          structured_data: { age: age || null, gender: gender || '未知', occupation, assets, risk_preference: riskPreference },
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
      {/* Mode tabs */}
      <div className="flex gap-2">
        <button onClick={() => setMode('text')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'text' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}>
          自由文本导入
        </button>
        <button onClick={() => setMode('form')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'form' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}>
          表单录入
        </button>
      </div>

      {mode === 'text' ? (
        <div className="space-y-3">
          <textarea
            value={rawText}
            onChange={e => setRawText(e.target.value)}
            placeholder="粘贴客户描述文字...例如：张总，45岁，私企老板，两个孩子，保守型投资者，资产规模500万以上..."
            rows={6}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200
                       placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
          />
          <div className="flex gap-3">
            <button onClick={handleAnalyze} disabled={loading || !rawText.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium
                         hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {loading ? '分析中...' : 'AI 分析'}
            </button>
            {profile && (
              <button onClick={handleSave}
                className="px-6 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors">
                保存客户
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">姓名</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200
                         focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">年龄</label>
            <input type="text" value={age} onChange={e => setAge(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200
                         focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">性别</label>
            <select value={gender} onChange={e => setGender(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200
                         focus:outline-none focus:border-blue-500">
              <option value="">未知</option>
              <option value="男">男</option>
              <option value="女">女</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">职业</label>
            <input type="text" value={occupation} onChange={e => setOccupation(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200
                         focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">资产状况</label>
            <input type="text" value={assets} onChange={e => setAssets(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200
                         focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">风险偏好</label>
            <select value={riskPreference} onChange={e => setRiskPreference(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200
                         focus:outline-none focus:border-blue-500">
              <option value="">未知</option>
              <option value="保守">保守</option>
              <option value="稳健">稳健</option>
              <option value="进取">进取</option>
            </select>
          </div>
          <div className="col-span-2">
            <button onClick={handleSave} disabled={!name.trim()}
              className="px-6 py-2 bg-green-600 text-white rounded-lg text-sm font-medium
                         hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              保存客户
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
