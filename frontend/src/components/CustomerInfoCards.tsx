import { useState } from 'react';
import type { Customer } from '../types';

interface Section {
  title: string;
  icon: string;
  fields: string[];
}

const SECTIONS: Section[] = [
  {
    title: '基础身份',
    icon: '👤',
    fields: ['age', 'gender', 'occupation', 'position', 'education', 'marital_status', 'family_members', 'industry', 'company_type', 'address', 'contact'],
  },
  {
    title: '资产状况',
    icon: '💰',
    fields: ['annual_income_range', 'main_income', 'side_income', 'income_stability', 'total_asset_range', 'deposit_amount', 'wealth_management', 'fund_stock', 'real_estate', 'vehicle', 'other_assets'],
  },
  {
    title: '负债情况',
    icon: '📊',
    fields: ['housing_loan', 'car_loan', 'business_loan', 'credit_card_debt', 'other_debt', 'monthly_debt_payment'],
  },
  {
    title: '投资偏好',
    icon: '📈',
    fields: ['risk_preference', 'core_concern', 'investment_years', 'investment_style', 'term_preference', 'past_products', 'past_pnl_experience', 'available_funds', 'single_investment_cap', 'fund_usage_period', 'fund_purpose', 'liquidity_need', 'rigid_cash_time'],
  },
  {
    title: '保险保障',
    icon: '🛡️',
    fields: ['social_insurance', 'commercial_insurance', 'insurance_gap', 'insurance_preference'],
  },
  {
    title: '其他信息',
    icon: '📋',
    fields: ['lifestyle', 'pain_points', 'cooperation_intent', 'referral_willingness', 'service_preference', 'communication_frequency', 'kyc_notes'],
  },
];

const LABELS: Record<string, string> = {
  'age': '年龄', 'gender': '性别', 'occupation': '职业', 'position': '职务', 'education': '学历',
  'address': '住址', 'contact': '联系方式', 'marital_status': '婚姻状况', 'family_members': '家庭成员',
  'industry': '行业', 'company_type': '单位性质', 'social_circle': '社交圈层',
  'main_income': '主业收入', 'side_income': '副业收入', 'income_stability': '收入稳定性', 'annual_income_range': '年收入区间',
  'deposit_amount': '存款规模', 'wealth_management': '理财产品', 'fund_stock': '基金/股票',
  'real_estate': '房产', 'vehicle': '车辆', 'other_assets': '其他资产', 'total_asset_range': '总资产区间',
  'housing_loan': '房贷', 'car_loan': '车贷', 'business_loan': '经营贷',
  'credit_card_debt': '信用卡负债', 'other_debt': '其他负债', 'monthly_debt_payment': '月还款额',
  'available_funds': '可投资资金', 'single_investment_cap': '单笔投资上限',
  'fund_usage_period': '资金使用周期', 'fund_purpose': '资金用途', 'liquidity_need': '赎回灵活性', 'rigid_cash_time': '刚性用款时间',
  'risk_preference': '风险偏好', 'investment_years': '投资年限', 'past_products': '过往产品', 'past_pnl_experience': '过往盈亏',
  'investment_style': '投资偏好', 'term_preference': '期限偏好', 'core_concern': '核心关注',
  'social_insurance': '社保/医保', 'commercial_insurance': '商业保险', 'insurance_gap': '保障缺口', 'insurance_preference': '投保意向',
  'lifestyle': '生活近况', 'pain_points': '金融痛点', 'cooperation_intent': '合作意向', 'referral_willingness': '转介绍意愿',
  'service_preference': '服务偏好', 'communication_frequency': '沟通频率', 'kyc_notes': '备注',
};

function getDisplayValue(val: unknown): string {
  if (val === null || val === undefined || val === '' || val === '未知') return '';
  return String(val);
}

interface Props {
  customer: Customer;
}

export default function CustomerInfoCards({ customer }: Props) {
  const sd = (customer.structured_data || {}) as Record<string, unknown>;
  const [showContact, setShowContact] = useState(false);

  return (
    <div className="space-y-3">
      {SECTIONS.map(sec => {
        const filledFields = sec.fields
          .map(key => ({ key, label: LABELS[key] || key, value: getDisplayValue(sd[key]) }))
          .filter(f => f.value);

        if (filledFields.length === 0) return null;

        return (
          <div key={sec.title} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]/50">
              <span className="text-sm">{sec.icon}</span>
              <span className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">{sec.title}</span>
              <span className="text-[10px] text-[var(--text-placeholder)] ml-auto">{filledFields.length}</span>
            </div>
            <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
              {filledFields.map(f => {
                const isContact = f.key === 'contact';
                const masked = isContact && !showContact && f.value.length > 4
                  ? f.value.slice(0, 3) + '****' + f.value.slice(-4)
                  : f.value;
                return (
                  <div key={f.key} className="flex flex-col min-w-0">
                    <span className="text-[10px] text-[var(--text-placeholder)] truncate">{f.label}</span>
                    <span className="text-xs text-[var(--text-primary)] break-words">
                      {masked}
                      {isContact && f.value.length > 4 && (
                        <button
                          onClick={() => setShowContact(!showContact)}
                          className="ml-1.5 text-[10px] text-[var(--accent-blue)] hover:underline"
                        >
                          {showContact ? '隐藏' : '查看'}
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
