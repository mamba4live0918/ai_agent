import { useState, useRef } from 'react';
import { analyzeCustomer, createCustomer, importCustomersCsv } from '../services/api';
import type { CustomerProfile } from '../types';

export default function CustomerForm({ onCreated }: { onCreated: () => void }) {
  const [mode, setMode] = useState<'text' | 'form' | 'csv'>('text');
  const fileRef = useRef<HTMLInputElement>(null);
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [error, setError] = useState('');
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvResult, setCsvResult] = useState<{ imported: number; names: string[]; errors: string[] } | null>(null);

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvUploading(true);
    setError('');
    setCsvResult(null);
    try {
      const result = await importCustomersCsv(file);
      setCsvResult(result);
      if (result.imported > 0) onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CSV导入失败');
    } finally {
      setCsvUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Form fields
  const [name, setName] = useState('');
  const [formData, setFormData] = useState<Record<string, string>>({});

  const updateField = (key: string, value: string) => setFormData(prev => ({ ...prev, [key]: value }));

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
        const sd: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(formData)) { if (v.trim()) sd[k] = v.trim(); }
        await createCustomer({ name: name || '未命名', structured_data: sd });
      }
      setProfile(null);
      setRawText('');
      setName('');
      setFormData({});
      onCreated();
    } catch {
      setError('保存失败');
    }
  };

  const FORM_SECTIONS = [
    { title: '基础身份', fields: ['occupation','position','education','address','contact','marital_status','family_members','industry','company_type','social_circle'] },
    { title: '资产与收支', fields: ['main_income','side_income','income_stability','annual_income_range','deposit_amount','wealth_management','fund_stock','real_estate','vehicle','other_assets','total_asset_range'] },
    { title: '负债情况', fields: ['housing_loan','car_loan','business_loan','credit_card_debt','other_debt','monthly_debt_payment'] },
    { title: '资金与投资', fields: ['available_funds','single_investment_cap','fund_usage_period','fund_purpose','liquidity_need','rigid_cash_time','risk_preference','investment_years','past_products','past_pnl_experience','investment_style','term_preference','core_concern'] },
    { title: '保险与保障', fields: ['social_insurance','commercial_insurance','insurance_gap','insurance_preference'] },
    { title: '生活与服务', fields: ['lifestyle','pain_points','cooperation_intent','referral_willingness','service_preference','communication_frequency','kyc_notes'] },
  ];

  const FLABELS: Record<string, string> = {
    'occupation':'职业','position':'职务','education':'学历','address':'住址','contact':'联系方式',
    'marital_status':'婚姻状况','family_members':'家庭成员','industry':'行业','company_type':'单位性质','social_circle':'社交圈层',
    'main_income':'主业收入','side_income':'副业收入','income_stability':'收入稳定性','annual_income_range':'年收入区间',
    'deposit_amount':'存款规模','wealth_management':'理财产品','fund_stock':'基金股票','real_estate':'房产','vehicle':'车辆',
    'other_assets':'其他资产','total_asset_range':'总资产区间',
    'housing_loan':'房贷','car_loan':'车贷','business_loan':'经营贷','credit_card_debt':'信用卡负债','other_debt':'其他负债','monthly_debt_payment':'月还款额',
    'available_funds':'可投资资金','single_investment_cap':'单笔投资上限',
    'fund_usage_period':'资金使用周期','fund_purpose':'资金用途','liquidity_need':'赎回灵活性','rigid_cash_time':'刚性用款时间',
    'risk_preference':'风险偏好','investment_years':'投资年限','past_products':'过往产品','past_pnl_experience':'过往盈亏',
    'investment_style':'投资偏好','term_preference':'期限偏好','core_concern':'核心关注',
    'social_insurance':'社保医保','commercial_insurance':'商业保险','insurance_gap':'保障缺口','insurance_preference':'投保意向',
    'lifestyle':'生活近况','pain_points':'金融痛点','cooperation_intent':'合作意向','referral_willingness':'转介绍意愿',
    'service_preference':'服务偏好','communication_frequency':'沟通频率','kyc_notes':'KYC备注',
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
          <button onClick={() => setMode('csv')}
            className={`px-3 py-1 text-xs font-medium border-l border-[var(--border-default)] transition-colors ${
              mode === 'csv'
                ? 'bg-[var(--btn-blue)] text-white'
                : 'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
            }`}>
            CSV导入
          </button>
        </div>
      </div>

      {mode === 'csv' && (
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-secondary)]">上传 CSV 文件批量导入客户。CSV 第一行为字段名（name, age, gender, occupation 等），每行一个客户。</p>
          <input ref={fileRef} type="file" accept=".csv" onChange={handleCsvImport} className="hidden" />
          <button onClick={() => fileRef.current?.click()} disabled={csvUploading} className="btn btn-secondary text-sm">
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"/></svg>
            {csvUploading ? '导入中...' : '选择 CSV 文件'}
          </button>
          {csvResult && (
            <div className="p-3 rounded-xl bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)]">
              <p className="font-semibold">导入完成：{csvResult.imported} 条</p>
              {csvResult.names.length > 0 && <p className="text-[var(--text-placeholder)] mt-1">{csvResult.names.slice(0, 10).join('、')}{csvResult.names.length > 10 ? '...' : ''}</p>}
              {csvResult.errors.length > 0 && <p className="text-[var(--accent-red)] mt-1">{csvResult.errors.join('；')}</p>}
            </div>
          )}
        </div>
      )}
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
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-[var(--text-secondary)]">姓名 *</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none" />
            </div>
            <div>
              <label className="text-[10px] text-[var(--text-secondary)]">年龄</label>
              <input type="text" value={formData['age'] || ''} onChange={e => updateField('age', e.target.value)}
                className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none" />
            </div>
            <div>
              <label className="text-[10px] text-[var(--text-secondary)]">性别</label>
              <select value={formData['gender'] || ''} onChange={e => updateField('gender', e.target.value)}
                className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none">
                <option value="">-</option><option value="男">男</option><option value="女">女</option>
              </select>
            </div>
          </div>
          {FORM_SECTIONS.map(sec => (
            <div key={sec.title}>
              <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5">{sec.title}</h4>
              <div className="grid grid-cols-2 gap-1.5">
                {sec.fields.map(key => (
                  <div key={key}>
                    <label className="text-[10px] text-[var(--text-placeholder)]">{FLABELS[key] || key}</label>
                    <input type="text" value={formData[key] || ''} onChange={e => updateField(key, e.target.value)}
                      className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none" />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <button onClick={handleSave} disabled={!name.trim()} className="btn btn-primary text-sm w-full">
            <svg className="w-4 h-4 inline mr-1" viewBox="0 0 16 16" fill="currentColor"><path d="M11.28 6.78a.75.75 0 0 0-1.06-1.06L7.25 8.69 5.78 7.22a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l3.5-3.5Z"/></svg>
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
