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
  const pp = (customer as Record<string, unknown>).personality_profile as Record<string, unknown> | undefined;

  return [
    {
      label: '客户身份',
      content: [
        customer.name && `姓名：${customer.name}`,
        get('age') && `年龄：${get('age')}岁`,
        get('gender') && `性别：${get('gender')}`,
        get('occupation') && `职业：${get('occupation')}`,
        get('position') && `职务：${get('position')}`,
        get('education') && `学历：${get('education')}`,
        get('industry') && `行业：${get('industry')}`,
        get('company_type') && `单位：${get('company_type')}`,
      ].filter(Boolean).join('\n'),
      isEmpty: !customer.name && !get('age') && !get('gender') && !get('occupation'),
    },
    {
      label: '性格画像',
      content: [
        pp?.disc_type ? `DISC：${pp.disc_type}型` : '',
        pp?.practical_type ? `实战分类：${pp.practical_type}` : '',
        pp?.financial_type ? `投资心态：${pp.financial_type}` : '',
        pp?.personality_summary ? `\n${pp.personality_summary}` : '',
        !pp && typeof ap.persona_summary === 'string' ? ap.persona_summary.split(/[。；\n]/)[0] : '',
      ].filter(Boolean).join('\n'),
      isEmpty: !pp && !ap.persona_summary,
    },
    {
      label: '婚姻和家庭状况',
      content: [
        get('marital_status') && `婚姻：${get('marital_status')}`,
        get('family_members') && `家庭成员：${get('family_members')}`,
        get('social_circle') && `社交圈：${get('social_circle')}`,
        get('address') && `住址：${get('address')}`,
      ].filter(Boolean).join('\n'),
      isEmpty: !get('marital_status') && !get('family_members'),
    },
    {
      label: '资产与收支状况',
      content: [
        get('annual_income_range') && `年收入：${get('annual_income_range')}`,
        get('main_income') && `主业：${get('main_income')}`,
        get('side_income') && `副业：${get('side_income')}`,
        get('total_asset_range') && `总资产：${get('total_asset_range')}`,
        get('deposit_amount') && `存款：${get('deposit_amount')}`,
        get('wealth_management') && `理财：${get('wealth_management')}`,
        get('fund_stock') && `基金/股票：${get('fund_stock')}`,
        get('real_estate') && `房产：${get('real_estate')}`,
        get('vehicle') && `车辆：${get('vehicle')}`,
        get('other_assets') && `其他：${get('other_assets')}`,
        get('available_funds') && `可投资金：${get('available_funds')}`,
      ].filter(Boolean).join('\n'),
      isEmpty: !get('annual_income_range') && !get('total_asset_range'),
    },
    {
      label: '负债情况',
      content: [
        get('housing_loan') && `房贷：${get('housing_loan')}`,
        get('car_loan') && `车贷：${get('car_loan')}`,
        get('business_loan') && `经营贷：${get('business_loan')}`,
        get('credit_card_debt') && `信用卡：${get('credit_card_debt')}`,
        get('other_debt') && `其他：${get('other_debt')}`,
        get('monthly_debt_payment') && `月还款：${get('monthly_debt_payment')}`,
      ].filter(Boolean).join('\n'),
      isEmpty: !get('housing_loan') && !get('car_loan') && !get('business_loan') && !get('credit_card_debt'),
    },
    {
      label: '资金规划与投资偏好',
      content: [
        get('risk_preference') && `风险偏好：${get('risk_preference')}`,
        get('core_concern') && `核心关注：${get('core_concern')}`,
        get('fund_purpose') && `资金用途：${get('fund_purpose')}`,
        get('fund_usage_period') && `使用周期：${get('fund_usage_period')}`,
        get('single_investment_cap') && `单笔上限：${get('single_investment_cap')}`,
        get('investment_years') && `投资年限：${get('investment_years')}`,
        get('investment_style') && `投资偏好：${get('investment_style')}`,
        get('term_preference') && `期限偏好：${get('term_preference')}`,
        get('past_products') && `过往产品：${get('past_products')}`,
        get('past_pnl_experience') && `盈亏体验：${get('past_pnl_experience')}`,
        get('liquidity_need') && `流动性要求：${get('liquidity_need')}`,
        get('rigid_cash_time') && `刚性用款：${get('rigid_cash_time')}`,
      ].filter(Boolean).join('\n'),
      isEmpty: !get('risk_preference') && !get('fund_purpose'),
    },
    {
      label: '保险与保障',
      content: [
        get('social_insurance') && `社保/医保：${get('social_insurance')}`,
        get('commercial_insurance') && `商业保险：${get('commercial_insurance')}`,
        get('insurance_gap') && `保障缺口：${get('insurance_gap')}`,
        get('insurance_preference') && `投保意向：${get('insurance_preference')}`,
      ].filter(Boolean).join('\n'),
      isEmpty: !get('social_insurance') && !get('commercial_insurance') && !get('insurance_gap'),
    },
    {
      label: '痛点与生活诉求',
      content: [
        get('pain_points') && `金融痛点：${get('pain_points')}`,
        get('lifestyle') && `生活近况：${get('lifestyle')}`,
        typeof ap.financial_needs_analysis === 'string' ? `AI分析：${ap.financial_needs_analysis.split(/[。；\n]/).slice(0, 2).join('；')}` : '',
      ].filter(Boolean).join('\n'),
      isEmpty: !get('pain_points') && !get('lifestyle') && !ap.financial_needs_analysis,
    },
    {
      label: '合作与服务偏好',
      content: [
        get('cooperation_intent') && `合作意向：${get('cooperation_intent')}`,
        get('referral_willingness') && `转介绍意愿：${get('referral_willingness')}`,
        get('service_preference') && `服务偏好：${get('service_preference')}`,
        get('communication_frequency') && `沟通频率：${get('communication_frequency')}`,
        get('kyc_notes') && `备注：${get('kyc_notes')}`,
      ].filter(Boolean).join('\n'),
      isEmpty: !get('cooperation_intent') && !get('service_preference'),
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

  const saveEdit = (_idx: number) => {
    setEditingIdx(null);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded bg-[var(--accent-orange)]/20 border border-[var(--accent-orange)]/40 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-[var(--accent-orange)]" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0 1 14.25 16H1.75A1.75 1.75 0 0 1 0 14.25ZM1.75 1.5a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V1.75a.25.25 0 0 0-.25-.25ZM11.75 3h-7.5a.75.75 0 0 0 0 1.5h7.5a.75.75 0 0 0 0-1.5ZM4.25 6h7.5a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5Zm0 3h7.5a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5Zm0 3h4a.75.75 0 0 1 0 1.5h-4a.75.75 0 0 1 0-1.5Z"/>
          </svg>
        </div>
        <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          KYC 九宫格 · 客户全景视图
        </span>
      </div>
      <p className="text-[10px] text-[var(--text-placeholder)] mb-4">严格基于已有数据填写，无数据字段可手动补充。KYC（Know Your Customer）—客户情况分析</p>

      <div className="grid grid-cols-3 gap-2">
        {cells.map((cell, idx) => {
          const currentContent = edits[idx] !== undefined ? edits[idx] : cell.content;
          const isEditing = editingIdx === idx;

          return (
            <div
              key={idx}
              className={`relative rounded-xl border p-2.5 min-h-[90px] flex flex-col ${
                cell.isEmpty && !currentContent
                  ? 'border-[var(--accent-orange)]/40 bg-[var(--accent-orange)]/5'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-primary)]'
              }`}
            >
              <p className="text-[10px] font-medium text-[var(--text-tertiary)] mb-1.5 leading-tight">{cell.label}</p>
              {isEditing ? (
                <textarea
                  className="flex-1 w-full bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-xl p-1.5 text-xs text-[var(--text-primary)] resize-none focus:outline-none focus:border-[var(--accent-blue)] transition-all duration-200"
                  value={currentContent}
                  onChange={e => setEdits(prev => ({ ...prev, [idx]: e.target.value }))}
                  rows={3}
                />
              ) : currentContent ? (
                <p className="text-xs text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed flex-1">{currentContent}</p>
              ) : (
                <p className="text-xs text-[var(--accent-orange)] italic flex-1">待补充</p>
              )}

              {/* Edit badge */}
              <div className="flex items-center justify-between mt-1.5">
                {cell.isEmpty && !currentContent && (
                  <span className="text-[9px] text-[var(--accent-orange)] font-medium">⚠ 信息缺失</span>
                )}
                {isEditing ? (
                  <button
                    onClick={() => saveEdit(idx)}
                    className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-[var(--btn-primary)] text-white hover:bg-[var(--btn-primary-hover)] transition-all duration-200"
                  >
                    保存
                  </button>
                ) : (
                  <button
                    onClick={() => startEdit(idx)}
                    className="ml-auto text-[10px] px-2 py-0.5 rounded-full border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-placeholder)] transition-all duration-200"
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
