import { useRef, useState, useEffect, useCallback } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import type { Customer, CustomerProfile as CustomerProfileType, ScoreDimension } from '../types';
import { regenerateProfile } from '../services/api';
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
  wealth_scale:           { label: '财富规模', color: '#3fb950' },
  risk_tolerance:         { label: '风险承受力', color: '#d29922' },
  investment_experience:  { label: '投资经验', color: '#58a6ff' },
  need_urgency:           { label: '需求紧迫度', color: '#f85149' },
  customer_potential:     { label: '客户潜力', color: '#a371f7' },
  communication_difficulty: { label: '沟通难度', color: '#8b949e' },
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
  if (v >= 8) return '#3fb950';
  if (v >= 5) return '#d29922';
  return '#f85149';
}

export default function CustomerProfile({ customer, onPresalesPrep }: Props) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('analysis');
  const [prepLoading, setPrepLoading] = useState(false);
  const [localCustomer, setLocalCustomer] = useState(customer);
  useEffect(() => { setLocalCustomer(customer); }, [customer]);
  const [showKyc, setShowKyc] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const scores = localCustomer.scores as Record<string, { value: number } | undefined> | null;
  const wealthScale = scores?.wealth_scale?.value ?? 0;
  const isHighValue = wealthScale >= 7;

  const sd = localCustomer.structured_data || {};

  const fields = ([
    ['年龄', String(sd.age ?? '')],
    ['性别', String(sd.gender ?? '')],
    ['职业', String(sd.occupation ?? '')],
    ['收入水平', String(sd.income_level ?? '')],
    ['资产状况', String(sd.assets ?? '')],
    ['风险偏好', String(sd.risk_preference ?? '')],
    ['投资经验', String(sd.investment_experience ?? '')],
    ['家庭状况', String(sd.family_status ?? '')],
    ['理财目标', String(sd.goals ?? '')],
  ] as [string, string][]).filter(([, v]) => v && v !== '未知');

  const ap = localCustomer.ai_profile as Record<string, string> | null || {};

  const apSections = ([
    ['客户画像', ap.persona_summary || '', '#58a6ff'],
    ['财务需求分析', ap.financial_needs_analysis || '', '#3fb950'],
    ['沟通建议', ap.communication_suggestions || '', '#d29922'],
    ['风险提示', ap.risk_warnings || '', '#f85149'],
    ['产品推荐', ap.product_recommendations || '', '#a371f7'],
    ['跟进建议', ap.next_steps || '', '#79c0ff'],
  ] as [string, string, string][]).filter(([, v]) => v && v !== '未知');

  const dimensions = parseScores(localCustomer.scores);

  const pp = localCustomer.presales_prep || {};
  const ppSections = ([
    ['客户生命周期分析', pp.lifecycle_analysis || '', '#58a6ff'],
    ['潜在难点与顾虑', pp.potential_difficulties || '', '#f85149'],
    ['应对话术', pp.response_scripts || '', '#3fb950'],
    ['心态准备', pp.mindset_preparation || '', '#a371f7'],
    ['维护动作与跟进', pp.maintenance_actions || '', '#d29922'],
  ] as [string, string, string][]).filter(([, v]) => v);

  const hasPrepData = ppSections.length > 0;
  const hasAnyData = fields.length > 0 || apSections.length > 0 || dimensions.length > 0;

  const handleRegenerate = async () => {
    if (!('id' in localCustomer)) return;
    setRegenerating(true);
    try {
      const updated = await regenerateProfile((localCustomer as Customer).id);
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
          backgroundColor: '#ffffff',
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
            backgroundColor: '#ffffff',
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
      const headerH = 8;

      let firstPage = true;

      for (const { label, canvas } of captures) {
        const scaleFactor = imgWidth / canvas.width;
        const contentMaxH = maxImgHeight - headerH;

        let srcY = 0;
        while (srcY < canvas.height) {
          const sliceHeight = Math.min(canvas.height - srcY, Math.round(contentMaxH / scaleFactor));

          if (!firstPage) pdf.addPage();
          firstPage = false;

          if (srcY === 0) {
            pdf.setFontSize(11);
            pdf.setTextColor(31, 35, 40);
            pdf.text(label, margin, margin + 5);
            pdf.setDrawColor(208, 215, 222);
            pdf.line(margin, margin + 6.5, pageWidth - margin, margin + 6.5);
          }

          const imgY = srcY === 0 ? margin + headerH : margin;

          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = sliceHeight;
          const ctx = sliceCanvas.getContext('2d')!;
          ctx.drawImage(canvas, 0, srcY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

          pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', margin, imgY, imgWidth, (sliceHeight * imgWidth) / canvas.width);
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

  const sectionBlock = (title: string, content: string, color: string) => (
    <div key={title} className="bg-[#0d1117] border border-[#21262d] rounded-md p-3.5">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <h5 className="text-xs font-semibold text-[#e6edf3]">{title}</h5>
      </div>
      <p className="text-sm text-[#8b949e] leading-relaxed whitespace-pre-wrap">{content}</p>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1f6feb] to-[#58a6ff] flex items-center justify-center flex-shrink-0 shadow-glow-green">
            <span className="text-sm font-bold text-white">{localCustomer.name.charAt(0)}</span>
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#e6edf3]">{localCustomer.name}</h3>
            <p className="text-xs text-[#6e7681] font-mono">
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
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-[#21262d]">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-[1px] ${
              activeTab === tab.key
                ? 'text-[#e6edf3] border-[#58a6ff]'
                : 'text-[#6e7681] border-transparent hover:text-[#c9d1d9] hover:border-[#30363d]'
            }`}
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
            {fields.length > 0 && (
              <div data-pdf-section="基本信息">
                <h4 className="text-[11px] font-semibold text-[#6e7681] uppercase tracking-wider mb-2.5">基本信息</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {fields.map(([label, value]) => (
                    <div key={label} className="bg-[#0d1117] border border-[#21262d] rounded-md px-3 py-2">
                      <div className="text-[10px] font-medium text-[#6e7681] uppercase tracking-wider mb-0.5">{label}</div>
                      <div className="text-sm text-[#e6edf3] font-medium">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {dimensions.length > 0 && (
              <div data-pdf-section="评分总览" className="space-y-4">
                <h4 className="text-[11px] font-semibold text-[#6e7681] uppercase tracking-wider mb-2">
                  评分总览
                  <span className="ml-2 font-normal normal-case text-[10px] text-[#484f58]">由 DeepSeek 生成</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {dimensions.map(d => (
                    <div key={d.key} className="bg-[#0d1117] border border-[#21262d] rounded-md px-3 py-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-medium text-[#8b949e] uppercase tracking-wider">{d.label}</span>
                        <span className="text-xs font-bold font-mono tabular-nums" style={{ color: getScoreColor(d.value) }}>
                          {d.value}<span className="text-[10px] font-normal text-[#484f58]">/10</span>
                        </span>
                      </div>
                      <div className="w-full h-1 bg-[#161b22] rounded-full mb-1.5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${d.value * 10}%`, backgroundColor: getScoreColor(d.value) }}
                        />
                      </div>
                      <p className="text-[10px] text-[#484f58] leading-relaxed">
                        {d.reasoning}
                      </p>
                    </div>
                  ))}
                </div>

                <CustomerRadar dimensions={dimensions} />
              </div>
            )}

            {apSections.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h4 className="text-[11px] font-semibold text-[#6e7681] uppercase tracking-wider">
                    AI 分析报告
                    <span className="ml-2 font-normal normal-case text-[10px] text-[#484f58]">由 DeepSeek 生成</span>
                  </h4>
                  <div className="flex items-center gap-2">
                    {'id' in localCustomer && (
                      <button onClick={handleRegenerate} disabled={regenerating} className="text-[10px] px-2 py-1 rounded border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] hover:border-[#484f58] transition-colors disabled:opacity-50 pdf-hide">
                        {regenerating ? '生成中...' : '⟳ 重新生成'}
                      </button>
                    )}
                    {isHighValue && (
                      <button
                        onClick={() => setShowKyc(!showKyc)}
                        className={`text-[10px] px-2 py-1 rounded border transition-colors pdf-hide ${
                          showKyc
                            ? 'border-[#d29922]/40 text-[#d29922] bg-[#d29922]/10'
                            : 'border-[#30363d] text-[#8b949e] hover:text-[#d29922] hover:border-[#d29922]/30'
                        }`}
                      >
                        {showKyc ? '回到 AI 分析' : 'KYC 九宫格'}
                      </button>
                    )}
                  </div>
                </div>
                {showKyc ? (
                  <div data-pdf-section="KYC 九宫格">
                    <KycGrid customer={localCustomer as Customer} />
                  </div>
                ) : (
                  <div data-pdf-section="AI 分析报告" className="space-y-2">
                    {apSections.map(([title, content, color]) => sectionBlock(title, content, color))}
                  </div>
                )}
              </div>
            )}

            {/* Show KYC toggle even when no AI profile, but customer is high value */}
            {apSections.length === 0 && isHighValue && (
              <div data-pdf-section="KYC 九宫格">
                <div className="flex items-center justify-between mb-2.5">
                  <h4 className="text-[11px] font-semibold text-[#6e7681] uppercase tracking-wider">KYC 九宫格</h4>
                  {'id' in localCustomer && (
                    <button onClick={handleRegenerate} disabled={regenerating} className="text-[10px] px-2 py-1 rounded border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] transition-colors disabled:opacity-50">
                      {regenerating ? '生成中...' : '⟳ 先生成 AI 分析'}
                    </button>
                  )}
                </div>
                <KycGrid customer={localCustomer as Customer} />
              </div>
            )}

            {fields.length === 0 && apSections.length === 0 && dimensions.length === 0 && (
              <div className="text-center py-6">
                <p className="text-sm text-[#484f58]">暂无分析数据</p>
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
                  <h4 className="text-[11px] font-semibold text-[#6e7681] uppercase tracking-wider">
                    售前准备报告
                    <span className="ml-2 font-normal normal-case text-[10px] text-[#484f58]">由 DeepSeek 生成</span>
                  </h4>
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
                <div className="space-y-2">
                  {ppSections.map(([title, content, color]) => sectionBlock(title, content, color))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <svg className="w-10 h-10 text-[#21262d] mx-auto mb-3" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Z"/>
                  <path d="M5.5 5.5a.75.75 0 0 1 1.5 0v.75h.75a.75.75 0 0 1 0 1.5H7v.75a.75.75 0 0 1-1.5 0v-.75h-.75a.75.75 0 0 1 0-1.5h.75v-.75Z"/>
                </svg>
                <p className="text-sm text-[#484f58] mb-3">暂无售前准备报告</p>
                {onPresalesPrep ? (
                  <button onClick={handlePrep} disabled={prepLoading} className="btn btn-primary text-xs">
                    {prepLoading ? 'AI 生成中...' : '生成售前准备报告'}
                  </button>
                ) : (
                  <p className="text-xs text-[#30363d]">保存客户后即可生成</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Tab 3: 配置方案 */}
        <div data-tab-panel style={{ display: activeTab === 'allocation' ? 'block' : 'none' }}>
          <div data-pdf-section="资产配置方案" className="space-y-5">
            <ProductManager />
            {'structured_data' in localCustomer && (
              <AllocationPlan customer={localCustomer as Customer} onUpdate={(updated) => setLocalCustomer(updated)} />
            )}
          </div>
        </div>
      </div>

      {!hasAnyData && !hasPrepData && (
        <div className="text-center py-6">
          <p className="text-sm text-[#484f58]">暂无分析数据</p>
        </div>
      )}
    </div>
  );
}
