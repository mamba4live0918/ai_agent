import type { Customer, CustomerProfile as CustomerProfileType } from '../types';

interface CustomerProfileProps {
  customer: Customer | CustomerProfileType;
}

export default function CustomerProfile({ customer }: CustomerProfileProps) {
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

  return (
    <div className="space-y-5">
      {/* Header */}
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

      {fields.length === 0 && apSections.length === 0 && (
        <div className="text-center py-6">
          <p className="text-sm text-[#484f58]">暂无分析数据</p>
        </div>
      )}
    </div>
  );
}
