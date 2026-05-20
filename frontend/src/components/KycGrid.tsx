import { useState } from 'react';
import type { Customer } from '../types';

interface KycCellData {
  label: string;
  content: string;
  isEmpty: boolean;
}

function mapToKyc(customer: Customer): KycCellData[] {
  const sd = customer.structured_data || {};
  const ap = customer.ai_profile || {};
  const get = (k: string) => (sd as Record<string, unknown>)[k];

  return [
    {
      label: '行内资产状况和一般来银行办理什么业务？停留时间长短？互动频次？',
      content: [get('assets'), get('goals')].filter(Boolean).join('；'),
      isEmpty: !get('assets') && !get('goals'),
    },
    {
      label: '性格',
      content: typeof ap.persona_summary === 'string' ? ap.persona_summary.split(/[。；\n]/)[0] : '',
      isEmpty: !ap.persona_summary,
    },
    {
      label: '婚姻和家庭状况',
      content: (get('family_status') as string) || '',
      isEmpty: !get('family_status'),
    },
    {
      label: '喜好的理财产品与风险承受能力',
      content: [get('risk_preference'), get('investment_experience')].filter(Boolean).join('；'),
      isEmpty: !get('risk_preference') && !get('investment_experience'),
    },
    {
      label: '客户',
      content: [
        customer.name && `姓名：${customer.name}`,
        get('age') && `年龄：${get('age')}岁`,
        get('gender') && `性别：${get('gender')}`,
        get('occupation') && `族群：${get('occupation')}`,
      ].filter(Boolean).join('\n'),
      isEmpty: !customer.name && !get('age') && !get('gender') && !get('occupation'),
    },
    {
      label: '工作与收入状况',
      content: [get('occupation'), get('income_level')].filter(Boolean).join('；'),
      isEmpty: !get('occupation') && !get('income_level'),
    },
    {
      label: '最头疼的问题',
      content: typeof ap.financial_needs_analysis === 'string' ? ap.financial_needs_analysis.split(/[。；\n]/).slice(0, 2).join('；') : '',
      isEmpty: !ap.financial_needs_analysis,
    },
    {
      label: '最关注的人是',
      content: (get('family_status') as string) || '',
      isEmpty: !get('family_status'),
    },
    {
      label: '兴趣爱好',
      content: '',
      isEmpty: true,
    },
  ];
}

interface Props {
  customer: Customer;
}

export default function KycGrid({ customer }: Props) {
  const cells = mapToKyc(customer);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [edits, setEdits] = useState<Record<number, string>>({});

  const startEdit = (idx: number) => {
    setEdits(prev => ({ ...prev, [idx]: cells[idx].content || edits[idx] || '' }));
    setEditingIdx(idx);
  };

  const saveEdit = (idx: number) => {
    setEditingIdx(null);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded bg-[#d29922]/20 border border-[#d29922]/40 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-[#d29922]" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0 1 14.25 16H1.75A1.75 1.75 0 0 1 0 14.25ZM1.75 1.5a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V1.75a.25.25 0 0 0-.25-.25ZM11.75 3h-7.5a.75.75 0 0 0 0 1.5h7.5a.75.75 0 0 0 0-1.5ZM4.25 6h7.5a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5Zm0 3h7.5a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5Zm0 3h4a.75.75 0 0 1 0 1.5h-4a.75.75 0 0 1 0-1.5Z"/>
          </svg>
        </div>
        <span className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider">
          KYC 九宫格 · 华兴银行高客版
        </span>
      </div>
      <p className="text-[10px] text-[#484f58] mb-4">严格基于已有数据填写，无数据字段可手动补充。KYC（Know Your Customer）—客户情况分析</p>

      <div className="grid grid-cols-3 gap-2">
        {cells.map((cell, idx) => {
          const currentContent = edits[idx] !== undefined ? edits[idx] : cell.content;
          const isEditing = editingIdx === idx;

          return (
            <div
              key={idx}
              className={`relative rounded-md border p-2.5 min-h-[90px] flex flex-col ${
                cell.isEmpty && !currentContent
                  ? 'border-[#d29922]/40 bg-[#d29922]/5'
                  : 'border-[#21262d] bg-[#0d1117]'
              }`}
            >
              <p className="text-[10px] font-medium text-[#6e7681] mb-1.5 leading-tight">{cell.label}</p>
              {isEditing ? (
                <textarea
                  className="flex-1 w-full bg-[#161b22] border border-[#30363d] rounded p-1.5 text-xs text-[#e6edf3] resize-none focus:outline-none focus:border-[#58a6ff]"
                  value={currentContent}
                  onChange={e => setEdits(prev => ({ ...prev, [idx]: e.target.value }))}
                  rows={3}
                />
              ) : currentContent ? (
                <p className="text-xs text-[#c9d1d9] whitespace-pre-wrap leading-relaxed flex-1">{currentContent}</p>
              ) : (
                <p className="text-xs text-[#d29922] italic flex-1">待补充</p>
              )}

              {/* Edit badge */}
              <div className="flex items-center justify-between mt-1.5">
                {cell.isEmpty && !currentContent && (
                  <span className="text-[9px] text-[#d29922] font-medium">⚠ 信息缺失</span>
                )}
                {isEditing ? (
                  <button
                    onClick={() => saveEdit(idx)}
                    className="ml-auto text-[10px] px-2 py-0.5 rounded bg-[#238636] text-white hover:bg-[#2ea043] transition-colors"
                  >
                    保存
                  </button>
                ) : (
                  <button
                    onClick={() => startEdit(idx)}
                    className="ml-auto text-[10px] px-2 py-0.5 rounded border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] hover:border-[#484f58] transition-colors"
                  >
                    ✎ 编辑
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
