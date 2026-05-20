import { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import type { Customer, CustomerProfile as CustomerProfileType, ScoreDimension } from '../types';
import CustomerRadar from './CustomerRadar';

interface Props {
  customer: Customer | CustomerProfileType;
  onPresalesPrep?: () => Promise<void>;
}

const DIMENSION_META: Record<string, { label: string; color: string }> = {
  wealth_scale:           { label: '财富规模', color: '#3fb950' },
  risk_tolerance:         { label: '风险承受力', color: '#d29922' },
  investment_experience:  { label: '投资经验', color: '#58a6ff' },
  need_urgency:           { label: '需求紧迫度', color: '#f85149' },
  customer_potential:     { label: '客户潜力', color: '#a371f7' },
  communication_difficulty: { label: '沟通难度', color: '#8b949e' },
};

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
  const [prepLoading, setPrepLoading] = useState(false);

  const sd = customer.structured_data || {};

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

  const ap = customer.ai_profile as Record<string, string> | null || {};

  const apSections = ([
    ['客户画像', ap.persona_summary || '', '#58a6ff'],
    ['财务需求分析', ap.financial_needs_analysis || '', '#3fb950'],
    ['沟通建议', ap.communication_suggestions || '', '#d29922'],
    ['风险提示', ap.risk_warnings || '', '#f85149'],
    ['产品推荐', ap.product_recommendations || '', '#a371f7'],
    ['跟进建议', ap.next_steps || '', '#79c0ff'],
  ] as [string, string, string][]).filter(([, v]) => v && v !== '未知');

  const dimensions = parseScores(customer.scores);

  const pp = customer.presales_prep || {};
  const ppSections = ([
    ['客户生命周期分析', pp.lifecycle_analysis || '', '#58a6ff'],
    ['潜在难点与顾虑', pp.potential_difficulties || '', '#f85149'],
    ['应对话术', pp.response_scripts || '', '#3fb950'],
    ['心态准备', pp.mindset_preparation || '', '#a371f7'],
    ['维护动作与跟进', pp.maintenance_actions || '', '#d29922'],
  ] as [string, string, string][]).filter(([, v]) => v);

  const hasPrepData = ppSections.length > 0;

  const handlePrep = async () => {
    if (!onPresalesPrep) return;
    setPrepLoading(true);
    try {
      await onPresalesPrep();
    } finally {
      setPrepLoading(false);
    }
  };

  const handleExportPDF = async () => {
    if (!reportRef.current) return;
    const canvas = await html2canvas(reportRef.current, {
      backgroundColor: '#0d1117',
      scale: 2,
      logging: false,
    });

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 12;
    const imgWidth = pageWidth - margin * 2;
    const maxImgHeight = pageHeight - margin * 2;
    const scaleFactor = imgWidth / canvas.width;

    let srcY = 0;
    let firstPage = true;

    while (srcY < canvas.height) {
      const sliceHeight = Math.min(canvas.height - srcY, Math.round(maxImgHeight / scaleFactor));

      if (!firstPage) pdf.addPage();
      firstPage = false;

      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceHeight;
      const ctx = sliceCanvas.getContext('2d')!;
      ctx.drawImage(canvas, 0, srcY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

      const sliceData = sliceCanvas.toDataURL('image/png');
      const slicePdfHeight = (sliceHeight * imgWidth) / canvas.width;
      pdf.addImage(sliceData, 'PNG', margin, margin, imgWidth, slicePdfHeight);

      srcY += sliceHeight;
    }

    pdf.save(`客户分析_${customer.name}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="space-y-5">
      {/* Header + Export */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1f6feb] to-[#58a6ff] flex items-center justify-center flex-shrink-0 shadow-glow-green">
            <span className="text-sm font-bold text-white">{customer.name.charAt(0)}</span>
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#e6edf3]">{customer.name}</h3>
            <p className="text-xs text-[#6e7681] font-mono">
              {'structured_data' in customer && 'updated_at' in customer
                ? `更新于 ${new Date((customer as Customer).updated_at).toLocaleDateString('zh-CN')}`
                : '新客户'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onPresalesPrep && !hasPrepData && (
            <button onClick={handlePrep} disabled={prepLoading} className="btn btn-primary text-xs">
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Z"/>
                <path d="M5.5 5.5a.75.75 0 0 1 1.5 0v.75h.75a.75.75 0 0 1 0 1.5H7v.75a.75.75 0 0 1-1.5 0v-.75h-.75a.75.75 0 0 1 0-1.5h.75v-.75Z"/>
              </svg>
              {prepLoading ? '生成中...' : '售前准备'}
            </button>
          )}
          <button onClick={handleExportPDF} className="btn btn-secondary text-xs">
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5ZM10 2H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5a.5.5 0 0 0-.5-.5H11a1 1 0 0 1-1-1V2Zm-1 7v3a.5.5 0 0 1-1 0V9h-.5a.5.5 0 0 1 0-1h2a.5.5 0 0 1 0 1H9Zm-2-5V2.5a.5.5 0 0 0-1 0V4a.5.5 0 0 0 1 0Z"/>
            </svg>
            导出 PDF
          </button>
        </div>
      </div>

      {/* PDF export wrapper */}
      <div ref={reportRef} className="space-y-5">
        {/* Structured data grid */}
        {fields.length > 0 && (
          <div>
            <h4 className="text-[11px] font-semibold text-[#6e7681] uppercase tracking-wider mb-2.5">基本信息</h4>
            <div className="grid grid-cols-3 gap-2">
              {fields.map(([label, value]) => (
                <div key={label} className="bg-[#0d1117] border border-[#21262d] rounded-md px-3 py-2">
                  <div className="text-[10px] font-medium text-[#6e7681] uppercase tracking-wider mb-0.5">{label}</div>
                  <div className="text-sm text-[#e6edf3] font-medium">{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Score cards + Radar */}
        {dimensions.length > 0 && (
          <div className="space-y-4">
            <h4 className="text-[11px] font-semibold text-[#6e7681] uppercase tracking-wider mb-2">
              评分总览
              <span className="ml-2 font-normal normal-case text-[10px] text-[#484f58]">由 DeepSeek 生成</span>
            </h4>

            {/* Score cards */}
            <div className="grid grid-cols-3 gap-2">
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

            {/* Radar chart */}
            <CustomerRadar dimensions={dimensions} />
          </div>
        )}

        {/* AI Profile sections */}
        {apSections.length > 0 && (
          <div>
            <h4 className="text-[11px] font-semibold text-[#6e7681] uppercase tracking-wider mb-2.5">
              AI 分析报告
              <span className="ml-2 font-normal normal-case text-[10px] text-[#484f58]">由 DeepSeek 生成</span>
            </h4>
            <div className="space-y-2">
              {apSections.map(([title, content, color]) => (
                <div key={title} className="bg-[#0d1117] border border-[#21262d] rounded-md p-3.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <h5 className="text-xs font-semibold text-[#e6edf3]">{title}</h5>
                  </div>
                  <p className="text-sm text-[#8b949e] leading-relaxed whitespace-pre-wrap">{content}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Presales prep sections */}
        {hasPrepData && (
          <div>
            <h4 className="text-[11px] font-semibold text-[#6e7681] uppercase tracking-wider mb-2.5">
              售前准备报告
              <span className="ml-2 font-normal normal-case text-[10px] text-[#484f58]">由 DeepSeek 生成</span>
            </h4>
            <div className="space-y-2">
              {ppSections.map(([title, content, color]) => (
                <div key={title} className="bg-[#0d1117] border border-[#21262d] rounded-md p-3.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <h5 className="text-xs font-semibold text-[#e6edf3]">{title}</h5>
                  </div>
                  <p className="text-sm text-[#8b949e] leading-relaxed whitespace-pre-wrap">{content}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {fields.length === 0 && apSections.length === 0 && dimensions.length === 0 && ppSections.length === 0 && (
        <div className="text-center py-6">
          <p className="text-sm text-[#484f58]">暂无分析数据</p>
        </div>
      )}
    </div>
  );
}
