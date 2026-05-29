import { useRef, useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import type { Customer, CustomerProfile as CustomerProfileType, ScoreDimension } from '../types';
import { regenerateProfile, updateCustomer } from '../services/api';
import CustomerRadar from './CustomerRadar';
import ProductManager from './ProductManager';
import AllocationPlan from './AllocationPlan';
import KycGrid from './KycGrid';

interface Props {
  customer: Customer | CustomerProfileType;
  onPresalesPrep?: () => Promise<void>;
  onRefresh?: (updated: Customer) => void;
}

type TabKey = 'analysis' | 'presales' | 'allocation';

const DIMENSION_META: Record<string, { label: string; color: string }> = {
  wealth_scale:           { label: '财富规模', color: 'var(--accent-green)' },
  risk_tolerance:         { label: '风险承受力', color: 'var(--accent-orange)' },
  investment_experience:  { label: '投资经验', color: 'var(--accent-blue)' },
  need_urgency:           { label: '需求紧迫度', color: 'var(--accent-red)' },
  customer_potential:     { label: '客户潜力', color: 'var(--accent-purple)' },
  communication_difficulty: { label: '沟通难度', color: 'var(--text-secondary)' },
};

const TABS: { key: TabKey; label: string }[] = [
  { key: 'analysis', label: '客户分析' },
  { key: 'presales', label: '售前准备' },
  { key: 'allocation', label: '配置方案' },
];

function parseScores(scores: Record<string, unknown> | null | undefined): ScoreDimension[] {
  if (!scores) return [];
  return Object.entries(DIMENSION_META).map(([key, meta]) => {
    const raw = scores[key] as { value?: number; reasoning?: string } | undefined;
    return {
      key,
      label: meta.label,
      value: raw?.value ?? 0,
      reasoning: raw?.reasoning ?? '',
      color: meta.color,
    };
  }).filter(d => d.value > 0);
}

function getScoreColor(v: number): string {
  if (v >= 8) return 'var(--accent-green)';
  if (v >= 5) return 'var(--accent-orange)';
  return 'var(--accent-red)';
}

export default function CustomerProfile({ customer, onPresalesPrep }: Props) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('analysis');
  const [prepLoading, setPrepLoading] = useState(false);
  const [localCustomer, setLocalCustomer] = useState(customer);
  useEffect(() => { setLocalCustomer(customer); }, [customer]);
  const [showKyc, setShowKyc] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editData, setEditData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(['basic-info', 'scores', 'ai-report', 'presales-report', 'allocation']));

  const toggleCollapse = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const scores = localCustomer.scores as Record<string, { value: number } | undefined> | null;
  const wealthScale = scores?.wealth_scale?.value ?? 0;
  const isHighValue = wealthScale >= 7;

  const sd = localCustomer.structured_data || {};

  const FIELD_KEYS: Record<string, string> = {
    '年龄': 'age', '性别': 'gender', '职业': 'occupation',
    '收入水平': 'income_level', '资产状况': 'assets', '风险偏好': 'risk_preference',
    '投资经验': 'investment_experience', '家庭状况': 'family_status', '理财目标': 'goals',
  };

  const ALL_FIELD_KEYS = [
    'age', 'gender', 'occupation', 'position', 'education', 'address', 'contact',
    'marital_status', 'family_members', 'industry', 'company_type', 'social_circle',
    'main_income', 'side_income', 'income_stability', 'annual_income_range',
    'deposit_amount', 'wealth_management', 'fund_stock', 'real_estate', 'vehicle',
    'other_assets', 'total_asset_range',
    'housing_loan', 'car_loan', 'business_loan', 'credit_card_debt', 'other_debt', 'monthly_debt_payment',
    'available_funds', 'single_investment_cap',
    'fund_usage_period', 'fund_purpose', 'liquidity_need', 'rigid_cash_time',
    'risk_preference', 'investment_years', 'past_products', 'past_pnl_experience',
    'investment_style', 'term_preference', 'core_concern',
    'social_insurance', 'commercial_insurance', 'insurance_gap', 'insurance_preference',
    'lifestyle', 'pain_points', 'cooperation_intent', 'referral_willingness',
    'service_preference', 'communication_frequency', 'kyc_notes',
  ];

  const FIELD_LABELS: Record<string, string> = {
    'age': '年龄', 'gender': '性别', 'occupation': '职业', 'position': '职务', 'education': '学历',
    'address': '住址', 'contact': '联系方式', 'marital_status': '婚姻状况', 'family_members': '家庭成员',
    'industry': '行业', 'company_type': '单位性质', 'social_circle': '社交圈层',
    'main_income': '主业收入', 'side_income': '副业收入', 'income_stability': '收入稳定性', 'annual_income_range': '年收入区间',
    'deposit_amount': '存款规模', 'wealth_management': '理财产品', 'fund_stock': '基金股票',
    'real_estate': '房产', 'vehicle': '车辆', 'other_assets': '其他资产', 'total_asset_range': '总资产区间',
    'housing_loan': '房贷', 'car_loan': '车贷', 'business_loan': '经营贷',
    'credit_card_debt': '信用卡负债', 'other_debt': '其他负债', 'monthly_debt_payment': '月还款额',
    'available_funds': '可投资资金', 'single_investment_cap': '单笔投资上限',
    'fund_usage_period': '资金使用周期', 'fund_purpose': '资金用途', 'liquidity_need': '赎回灵活性', 'rigid_cash_time': '刚性用款时间',
    'risk_preference': '风险偏好', 'investment_years': '投资年限', 'past_products': '过往产品', 'past_pnl_experience': '过往盈亏',
    'investment_style': '投资偏好', 'term_preference': '期限偏好', 'core_concern': '核心关注',
    'social_insurance': '社保医保', 'commercial_insurance': '商业保险', 'insurance_gap': '保障缺口', 'insurance_preference': '投保意向',
    'lifestyle': '生活近况', 'pain_points': '金融痛点', 'cooperation_intent': '合作意向', 'referral_willingness': '转介绍意愿',
    'service_preference': '服务偏好', 'communication_frequency': '沟通频率', 'kyc_notes': 'KYC备注',
  };

  const ap = localCustomer.ai_profile as Record<string, string> | null || {};

  const apSections = ([
    ['客户画像', ap.persona_summary || '', 'var(--accent-blue)'],
    ['财务需求分析', ap.financial_needs_analysis || '', 'var(--accent-green)'],
    ['沟通建议', ap.communication_suggestions || '', 'var(--accent-orange)'],
    ['风险提示', ap.risk_warnings || '', 'var(--accent-red)'],
    ['产品推荐', ap.product_recommendations || '', 'var(--accent-purple)'],
    ['跟进建议', ap.next_steps || '', 'var(--accent-blue)'],
  ] as [string, string, string][]).filter(([, v]) => v && v !== '未知');

  const dimensions = parseScores(localCustomer.scores);

  const pp = (localCustomer as Customer).presales_prep || {};
  const ppSections = ([
    ['客户生命周期分析', pp.lifecycle_analysis || '', 'var(--accent-blue)'],
    ['潜在难点与顾虑', pp.potential_difficulties || '', 'var(--accent-red)'],
    ['应对话术', pp.response_scripts || '', 'var(--accent-green)'],
    ['心态准备', pp.mindset_preparation || '', 'var(--accent-purple)'],
    ['维护动作与跟进', pp.maintenance_actions || '', 'var(--accent-orange)'],
  ] as [string, string, string][]).filter(([, v]) => v);

  const hasPrepData = ppSections.length > 0;
  const hasAnyData = apSections.length > 0 || dimensions.length > 0 || (sd && Object.keys(sd).length > 0);

  const openEditForm = () => {
    const sd = (localCustomer.structured_data || {}) as Record<string, unknown>;
    const init: Record<string, string> = {};
    for (const key of ALL_FIELD_KEYS) {
      init[key] = String(sd[key] ?? '');
    }
    init['_name'] = localCustomer.name || '';
    setEditData(init);
    setShowEditForm(true);
  };

  const handleEditSave = async () => {
    if (!('id' in localCustomer)) return;
    setSaving(true);
    const sd: Record<string, unknown> = {};
    for (const key of ALL_FIELD_KEYS) {
      const val = (editData[key] || '').trim();
      if (val) sd[key] = val;
    }
    try {
      const updated = await updateCustomer((localCustomer as Customer).id, {
        name: editData['_name'] || localCustomer.name,
        structured_data: sd,
      });
      setLocalCustomer(updated);
      setShowEditForm(false);
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleRegenerate = async () => {
    if (!('id' in localCustomer)) return;
    setRegenerating(true);
    try {
      const updated = await regenerateProfile(
        (localCustomer as Customer).id,
        (localCustomer.structured_data as Record<string, unknown>) || undefined,
      );
      setLocalCustomer(updated);
    } catch { /* silently skip */ }
    finally { setRegenerating(false); }
  };

  const handlePrep = async () => {
    if (!onPresalesPrep) return;
    setPrepLoading(true);
    try {
      await onPresalesPrep();
      setActiveTab('presales');
    } finally {
      setPrepLoading(false);
    }
  };

  const handleExportPDF = useCallback(async () => {
    const el = reportRef.current;
    if (!el) return;

    const wasKyc = showKyc;

    // Phase 1: Force AI analysis view, apply light theme, show all panels
    if (wasKyc) setShowKyc(false);
    await new Promise(r => setTimeout(r, 80));
    el.classList.add('pdf-export');

    const panels = el.querySelectorAll<HTMLElement>('[data-tab-panel]');
    const prevDisplay: string[] = [];
    panels.forEach(p => {
      prevDisplay.push(p.style.display);
      p.style.display = 'block';
    });
    await new Promise(r => setTimeout(r, 150));

    try {
      // Phase 2: Capture all sections with showKyc = false (AI analysis visible)
      const sectionEls = Array.from(el.querySelectorAll<HTMLElement>('[data-pdf-section]'));
      interface SectionCapture { label: string; canvas: HTMLCanvasElement; }
      const captures: SectionCapture[] = [];

      for (const secEl of sectionEls) {
        if (!secEl.children.length && !(secEl.textContent || '').trim()) continue;
        const label = secEl.getAttribute('data-pdf-section') || '';
        const canvas = await html2canvas(secEl, {
          backgroundColor: 'var(--color-white)',
          scale: 3,
          logging: false,
        });
        captures.push({ label, canvas });
      }

      // Phase 3: If high-value customer AND has AI profile, capture KYC grid too
      // (KYC is hidden behind toggle when AI profile exists)
      const hasAiProfile = apSections.length > 0;
      if (isHighValue && hasAiProfile) {
        setShowKyc(true);
        await new Promise(r => setTimeout(r, 100));
        panels.forEach(p => { p.style.display = 'block'; });
        await new Promise(r => setTimeout(r, 150));

        const kycEls = Array.from(el.querySelectorAll<HTMLElement>('[data-pdf-section]'))
          .filter(s => s.getAttribute('data-pdf-section') === 'KYC 九宫格');

        // Insert KYC right after AI 分析报告 in the section order
        const aiAnalysisIndex = captures.findIndex(c => c.label === 'AI 分析报告');
        const insertAt = aiAnalysisIndex >= 0 ? aiAnalysisIndex + 1 : captures.length;

        for (let k = 0; k < kycEls.length; k++) {
          const secEl = kycEls[k];
          if (!secEl.children.length && !(secEl.textContent || '').trim()) continue;
          const canvas = await html2canvas(secEl, {
            backgroundColor: 'var(--color-white)',
            scale: 3,
            logging: false,
          });
          captures.splice(insertAt + k, 0, { label: 'KYC 九宫格', canvas });
        }
      }

      // Phase 4: Build PDF from captured section canvases
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 12;
      const imgWidth = pageWidth - margin * 2;
      const maxImgHeight = pageHeight - margin * 2;

      let firstPage = true;

      for (const { canvas } of captures) {
        const scaleFactor = imgWidth / canvas.width;

        let srcY = 0;
        while (srcY < canvas.height) {
          const sliceHeight = Math.min(canvas.height - srcY, Math.round(maxImgHeight / scaleFactor));

          if (!firstPage) pdf.addPage();
          firstPage = false;

          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = sliceHeight;
          const ctx = sliceCanvas.getContext('2d')!;
          ctx.drawImage(canvas, 0, srcY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

          pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', margin, margin, imgWidth, (sliceHeight * imgWidth) / canvas.width);
          srcY += sliceHeight;
        }
      }

      pdf.save(`客户分析_${localCustomer.name}_${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      el.classList.remove('pdf-export');
      panels.forEach((p, i) => {
        p.style.display = prevDisplay[i];
      });
      setShowKyc(wasKyc);
    }
  }, [localCustomer.name, showKyc, isHighValue, apSections.length]);

  const SectionHeader = ({ sectionKey, label, sublabel }: { sectionKey: string; label: string; sublabel?: string }) => (
    <button
      onClick={() => toggleCollapse(sectionKey)}
      className="flex items-center gap-2 w-full text-left group"
    >
      <svg
        className={`w-3 h-3 text-[var(--text-tertiary)] transition-transform duration-200 ${collapsed.has(sectionKey) ? '' : 'rotate-90'}`}
        viewBox="0 0 16 16" fill="currentColor"
      >
        <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"/>
      </svg>
      <h4 className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider group-hover:text-[var(--text-secondary)] transition-colors">
        {label}
      </h4>
      {sublabel && (
        <span className="font-normal normal-case text-[10px] text-[var(--text-placeholder)]">{sublabel}</span>
      )}
    </button>
  );

  const sectionBlock = (title: string, content: string, color: string) => (
    <div key={title} className="bg-[var(--bg-primary)] rounded-xl p-4 shadow-[var(--shadow-card)] transition-all duration-200">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <h5 className="text-xs font-semibold text-[var(--text-primary)]">{title}</h5>
      </div>
      <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{content}</p>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--btn-blue)] to-[var(--accent-blue)] flex items-center justify-center flex-shrink-0 shadow-[var(--shadow-btn)]">
            <span className="text-sm font-bold text-white">{localCustomer.name.charAt(0)}</span>
          </div>
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">{localCustomer.name}</h3>
            <p className="text-xs text-[var(--text-tertiary)] font-mono">
              {'structured_data' in localCustomer && 'updated_at' in localCustomer
                ? `更新于 ${new Date((localCustomer as Customer).updated_at).toLocaleDateString('zh-CN')}`
                : '新客户'}
            </p>
          </div>
        </div>
        <button onClick={handleExportPDF} className="btn btn-secondary text-xs pdf-hide">
          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5ZM10 2H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5a.5.5 0 0 0-.5-.5H11a1 1 0 0 1-1-1V2Zm-1 7v3a.5.5 0 0 1-1 0V9h-.5a.5.5 0 0 1 0-1h2a.5.5 0 0 1 0 1H9Zm-2-5V2.5a.5.5 0 0 0-1 0V4a.5.5 0 0 0 1 0Z"/>
          </svg>
          导出 PDF
        </button>
        {'id' in localCustomer && (
          <Link
            to={`/training?customerId=${(localCustomer as Customer).id}`}
            className="btn btn-primary text-xs pdf-hide no-underline"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 16A8 8 0 1 1 8 0a8 8 0 0 1 0 16ZM8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.92 4.5h1.16v3.5H6.92V4.5Zm0 4.5h1.16v1H6.92V9Zm-2.5-4.5a.5.5 0 0 1 .5.5v.5h-.5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5V5a.5.5 0 0 0-.5-.5h-1ZM4.92 5h.5v.5h-.5V5Zm3.5 0h.5v3.5h-.5V5Z"/>
            </svg>
            发起训练
          </Link>
        )}
      </div>

      {/* Tab bar */}
      <div className="tab-underline">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`transition-all duration-200 ${activeTab === tab.key ? 'active' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* PDF export wrapper — all panels always rendered for PDF capture */}
      <div ref={reportRef} className="space-y-5">
        {/* Tab 1: 客户分析 */}
        <div data-tab-panel style={{ display: activeTab === 'analysis' ? 'block' : 'none' }}>
          <div className="space-y-5">
            {/* KYC 九宫格 — 所有客户 */}
            <div data-pdf-section="KYC 九宫格">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">客户资料</span>
                </div>
                {'id' in localCustomer && (
                  <button onClick={openEditForm} className="text-[10px] px-2 py-1 rounded-full border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-placeholder)] transition-all duration-200 pdf-hide">
                    ✎ 编辑资料
                  </button>
                )}
              </div>
              <KycGrid customer={localCustomer as Customer} />
            </div>

            {dimensions.length > 0 && (
              <div data-pdf-section="评分总览">
                <SectionHeader sectionKey="scores" label="评分总览" sublabel="由 DeepSeek 生成" />
                {!collapsed.has('scores') && <div className="space-y-4 mt-2.5">

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {dimensions.map(d => (
                    <div key={d.key} className="bg-[var(--bg-primary)] rounded-xl px-3 py-2.5 shadow-[var(--shadow-card)] transition-all duration-200">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">{d.label}</span>
                        <span className="text-xs font-bold font-mono tabular-nums" style={{ color: getScoreColor(d.value) }}>
                          {d.value}<span className="text-[10px] font-normal text-[var(--text-placeholder)]">/10</span>
                        </span>
                      </div>
                      <div className="w-full h-1 bg-[var(--bg-secondary)] rounded-full mb-1.5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${d.value * 10}%`, backgroundColor: getScoreColor(d.value) }}
                        />
                      </div>
                      <p className="text-[10px] text-[var(--text-placeholder)] leading-relaxed">
                        {d.reasoning}
                      </p>
                    </div>
                  ))}
                </div>

                <CustomerRadar dimensions={dimensions} />
              </div>
              }
            </div>
            )}

            {apSections.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <SectionHeader sectionKey="ai-report" label="AI 分析报告" sublabel="由 DeepSeek 生成" />
                  <div className="flex items-center gap-2">
                    {'id' in localCustomer && (
                      <button onClick={handleRegenerate} disabled={regenerating} className="text-[10px] px-2 py-1 rounded-full border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-placeholder)] transition-all duration-200 disabled:opacity-50 pdf-hide">
                        {regenerating ? '生成中...' : '⟳ 重新生成'}
                      </button>
                    )}
                  </div>
                </div>
                {!collapsed.has('ai-report') && (
                  <div data-pdf-section="AI 分析报告" className="space-y-2">
                    {apSections.map(([title, content, color]) => sectionBlock(title, content, color))}
                  </div>
                )}
              </div>
            )}

            {apSections.length === 0 && 'id' in localCustomer && (
              <div className="text-center py-4">
                <button onClick={handleRegenerate} disabled={regenerating} className="text-[10px] px-3 py-1.5 rounded-full border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all duration-200 disabled:opacity-50">
                  {regenerating ? '生成中...' : '⟳ 生成 AI 分析'}
                </button>
              </div>
            )}

            {!hasAnyData && (
              <div className="text-center py-6">
                <p className="text-sm text-[var(--text-placeholder)]">暂无分析数据</p>
              </div>
            )}
          </div>
        </div>

        {/* Tab 2: 售前准备 */}
        <div data-tab-panel style={{ display: activeTab === 'presales' ? 'block' : 'none' }}>
          <div className="space-y-5">
            {hasPrepData ? (
              <div data-pdf-section="售前准备报告">
                <div className="flex items-center justify-between">
                  <SectionHeader sectionKey="presales-report" label="售前准备报告" sublabel="由 DeepSeek 生成" />
                  {onPresalesPrep && (
                    <button onClick={handlePrep} disabled={prepLoading} className="btn btn-secondary text-xs pdf-hide">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Z"/>
                        <path d="M7.25 4.75a.75.75 0 0 1 1.5 0v2.5h2.5a.75.75 0 0 1 0 1.5h-2.5v2.5a.75.75 0 0 1-1.5 0v-2.5h-2.5a.75.75 0 0 1 0-1.5h2.5v-2.5Z"/>
                      </svg>
                      {prepLoading ? '生成中...' : '重新生成'}
                    </button>
                  )}
                </div>
                {!collapsed.has('presales-report') && (
                  <div className="space-y-2 mt-2.5">
                    {ppSections.map(([title, content, color]) => sectionBlock(title, content, color))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <svg className="w-10 h-10 text-[var(--text-placeholder)] mx-auto mb-3" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Z"/>
                  <path d="M5.5 5.5a.75.75 0 0 1 1.5 0v.75h.75a.75.75 0 0 1 0 1.5H7v.75a.75.75 0 0 1-1.5 0v-.75h-.75a.75.75 0 0 1 0-1.5h.75v-.75Z"/>
                </svg>
                <p className="text-sm text-[var(--text-placeholder)] mb-3">暂无售前准备报告</p>
                {onPresalesPrep ? (
                  <button onClick={handlePrep} disabled={prepLoading} className="btn btn-primary text-xs">
                    {prepLoading ? 'AI 生成中...' : '生成售前准备报告'}
                  </button>
                ) : (
                  <p className="text-xs text-[var(--border-default)]">保存客户后即可生成</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Tab 3: 配置方案 */}
        <div data-tab-panel style={{ display: activeTab === 'allocation' ? 'block' : 'none' }}>
          <div className="space-y-5">
            <div className="pdf-hide">
              <ProductManager />
            </div>
            {'structured_data' in localCustomer && (
              (localCustomer as Customer).allocation_plan ? (
                <div data-pdf-section="资产配置方案">
                  <SectionHeader sectionKey="allocation" label="资产配置方案" />
                  {!collapsed.has('allocation') && <div className="mt-2.5"><AllocationPlan customer={localCustomer as Customer} onUpdate={(updated) => setLocalCustomer(updated)} /></div>}
                </div>
              ) : (
                <AllocationPlan customer={localCustomer as Customer} onUpdate={(updated) => setLocalCustomer(updated)} />
              )
            )}
          </div>
        </div>
      </div>

      {!hasAnyData && !hasPrepData && (
        <div className="text-center py-6">
          <p className="text-sm text-[var(--text-placeholder)]">暂无分析数据</p>
        </div>
      )}

      {/* Edit Customer Data Modal */}
      {showEditForm && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" onClick={() => setShowEditForm(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none p-4">
            <div className="pointer-events-auto w-full max-w-2xl max-h-[90vh] bg-[var(--bg-secondary)] rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.12)] border border-[var(--border-subtle)] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-subtle)] flex-shrink-0">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">编辑客户资料</h3>
                <button onClick={() => setShowEditForm(false)} className="w-7 h-7 flex items-center justify-center rounded-full text-[var(--text-placeholder)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors">
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/></svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">姓名</label>
                    <input value={editData['_name'] || ''} onChange={e => setEditData(prev => ({ ...prev, _name: e.target.value }))}
                      className="w-full mt-1 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none transition-colors" />
                  </div>
                  {[
                    { title: '基础身份', fields: ['age','gender','occupation','position','education','address','contact','marital_status','family_members','industry','company_type','social_circle'] },
                    { title: '资产与收支', fields: ['main_income','side_income','income_stability','annual_income_range','deposit_amount','wealth_management','fund_stock','real_estate','vehicle','other_assets','total_asset_range'] },
                    { title: '负债情况', fields: ['housing_loan','car_loan','business_loan','credit_card_debt','other_debt','monthly_debt_payment'] },
                    { title: '资金与投资', fields: ['available_funds','single_investment_cap','fund_usage_period','fund_purpose','liquidity_need','rigid_cash_time','risk_preference','investment_years','past_products','past_pnl_experience','investment_style','term_preference','core_concern'] },
                    { title: '保险与保障', fields: ['social_insurance','commercial_insurance','insurance_gap','insurance_preference'] },
                    { title: '生活与服务', fields: ['lifestyle','pain_points','cooperation_intent','referral_willingness','service_preference','communication_frequency','kyc_notes'] },
                  ].map(group => (
                    <div key={group.title}>
                      <h4 className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">{group.title}</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {group.fields.map(key => (
                          <div key={key}>
                            <label className="text-[10px] text-[var(--text-placeholder)]">{FIELD_LABELS[key] || key}</label>
                            <input
                              value={editData[key] || ''}
                              onChange={e => setEditData(prev => ({ ...prev, [key]: e.target.value }))}
                              className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-blue)] outline-none transition-colors"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="px-5 py-3 border-t border-[var(--border-subtle)] flex items-center gap-2 flex-shrink-0">
                <button onClick={handleEditSave} disabled={saving} className="flex-1 px-4 py-2 bg-[var(--btn-primary)] text-white text-sm rounded-full hover:bg-[var(--btn-primary-hover)] disabled:opacity-50 transition-colors">
                  {saving ? '保存中...' : '保存'}
                </button>
                <button onClick={() => setShowEditForm(false)} className="px-4 py-2 border border-[var(--border-default)] text-[var(--text-secondary)] text-sm rounded-full hover:text-[var(--text-primary)] transition-colors">
                  取消
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
