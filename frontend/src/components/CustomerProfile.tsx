import type { Customer, CustomerProfile as CustomerProfileType } from '../types';

interface CustomerProfileProps {
  customer: Customer | CustomerProfileType;
}

export default function CustomerProfile({ customer }: CustomerProfileProps) {
  const sd = customer.structured_data || {};

  const fields = ([
    ['年龄', String(sd.age ?? '')], ['性别', String(sd.gender ?? '')], ['职业', String(sd.occupation ?? '')],
    ['收入水平', String(sd.income_level ?? '')], ['资产状况', String(sd.assets ?? '')],
    ['风险偏好', String(sd.risk_preference ?? '')], ['投资经验', String(sd.investment_experience ?? '')],
    ['家庭状况', String(sd.family_status ?? '')], ['理财目标', String(sd.goals ?? '')],
  ] as [string, string][]).filter(([, v]) => v && v !== '未知');

  const ap = customer.ai_profile as Record<string, string> | null || {};

  const apSections = ([
    ['客户画像', ap.persona_summary || ''],
    ['财务需求分析', ap.financial_needs_analysis || ''],
    ['沟通建议', ap.communication_suggestions || ''],
    ['风险提示', ap.risk_warnings || ''],
    ['产品推荐', ap.product_recommendations || ''],
    ['跟进建议', ap.next_steps || ''],
  ] as [string, string][]).filter(([, v]) => v && v !== '未知');

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-white">{customer.name}</h3>

      {fields.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {fields.map(([label, value]) => (
            <div key={label} className="bg-gray-800 rounded-lg px-3 py-2">
              <div className="text-xs text-gray-500">{label}</div>
              <div className="text-sm text-gray-200">{value}</div>
            </div>
          ))}
        </div>
      )}

      {apSections.length > 0 && (
        <div className="space-y-3">
          {apSections.map(([title, content]) => (
            <div key={title} className="bg-gray-800/50 rounded-lg p-3">
              <h4 className="text-xs font-semibold text-blue-400 mb-1">{title}</h4>
              <p className="text-sm text-gray-300 whitespace-pre-wrap">{content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
