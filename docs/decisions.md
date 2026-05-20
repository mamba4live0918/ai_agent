# 设计决策记录

## 2026-05-20 — 客户分析可视化 & PDF 导出

### 评分维度

6 个评分维度（各 1-10 分），AI 基于客户描述中的具体事实打分：

| 维度 | 名称 | 含义 |
|------|------|------|
| risk_tolerance | 风险承受力 | 客户对投资风险的接受程度 |
| wealth_scale | 财富规模 | 收入/资产综合评估 |
| investment_experience | 投资经验 | 历史投资经历的丰富度 |
| need_urgency | 需求紧迫度 | 理财需求的时间紧迫性 |
| customer_potential | 客户潜力 | 可挖掘的长期销售价值 |
| communication_difficulty | 沟通难度 | 建立信任和推进的难易度 |

### 评分标准（Rubric）

| 维度 | 1-3 分 | 4-6 分 | 7-8 分 | 9-10 分 |
|------|--------|--------|--------|---------|
| 财富规模 | 年入<20万, 无房产 | 年入20-100万, 1套房 | 年入100-500万, 多套房 | 年入>500万, 多房产+其他资产 |
| 风险承受力 | 明确"保本""不能亏" | 偏保守，买过理财/债基 | 能接受波动，买过股基 | 追求高收益，做过高风险投资 |
| 投资经验 | 只存银行/买过理财 | 买过基金，了解基本概念 | 多种产品，3年+经验 | 丰富经验，涉及股票/期货/PE |
| 需求紧迫度 | 只是随便了解 | 有明确咨询方向 | 已比较产品，近期决策 | 急需方案，已主动多次联系 |
| 客户潜力 | 单次小单，无后续 | 有长期需求可能 | 高净值，多需求可挖掘 | 超高净值，可长期深度合作 |
| 沟通难度 | 已有信任，沟通顺畅 | 正常沟通，需建立信任 | 有顾虑，需要打消疑虑 | 高防备，抵触销售，需长期破冰 |

每个维度附带 `reasoning`（一句话依据）。

### 技术选型

- **雷达图**: Recharts — React 原生，RadarChart 组件成熟，暗色主题适配
- **PDF 导出**: html2canvas（截图）+ jsPDF（生成 PDF）— 轻量，不需要后端
- **不选方案**: 后端用 WeasyPrint/ReportLab — 增加依赖，雷达图渲染复杂

### AI Prompt 增强

- 原 prompt 返回纯文本 ai_profile（每段 2-3 句）→ 改为 4-6 句详细分析
- 新增 `scores` 字段，AI 必须基于 rubric 评分 + 给出 reasoning
- **教训**: `deepseek-reasoner` 在处理长 prompt 时可能跳过 JSON 末尾新增字段。将 `scores` 放在 `ai_profile` 之前（短字段在前，长文本在后）解决了此问题。另需在 prompt 开头显式声明 scores 字段为 mandatory

### PDF 多页处理

- **问题**: 增强后的 AI 分析报告内容很长（6 大板块各 4-6 句 + 雷达图 + 评分卡片），单页 A4 无法容纳，内容被截断
- **方案**: html2canvas 截取完整 DOM → 按 A4 页面高度切片 → 每个 slice 绘制到独立 Canvas → jsPDF 逐页添加
- **不选方案**: jsPDF `addImage` 的 source position 参数直接裁剪 — API 复杂、跨浏览器兼容性差、调试困难

## 2026-05-20 — 售前准备（Pre-Sales Preparation）

### 设计思路

复用客户已有的 `structured_data` + `ai_profile` + `scores` 作为输入上下文，AI 生成 5 部分售前策略报告。

### Prompt 策略

- 输入：三组完整 JSON 数据（结构化字段 + 6段分析 + 6维评分）
- 输出：`lifecycle_analysis` / `potential_difficulties` / `response_scripts` / `mindset_preparation` / `maintenance_actions`
- 要求每段 4-6 句，必须引用客户具体数据，禁止泛泛而谈
- 应对话术需包含真实销售场景用语

### API 设计

- `POST /api/customers/{id}/presales-prep` — 生成并保存到 `presales_prep` JSONB 字段
- 返回完整 Customer 对象（前端直接 setState）
- 无请求体，纯后端生成

### UI 集成

- "售前准备"按钮在 CustomerProfile 头部，与"导出 PDF"并列
- 生成后报告渲染在 AI 分析报告下方（5 板块，同款彩色圆点样式）
- 报告内容在 `reportRef` 内，PDF 导出自动包含
- 按钮仅在有 AI 画像但无售前报告时显示（避免重复生成）


