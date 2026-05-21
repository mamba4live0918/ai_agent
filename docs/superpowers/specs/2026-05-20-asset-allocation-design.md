# 资产配置方案 — 设计规格

## 概述

AI 销售助手"陪跑助手"售前链路的最后一环：客户分析 → 售前准备 → 配置方案。基于客户画像与金融产品库，AI 自动生成保守/稳健/进取三套配置方案，支持销售人员在 AI 方案基础上手动调整各产品配比，最终导出 PDF。

## 产品模型 — FinancialProduct

新增数据库表，所有客户共享产品库。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| name | str(200) | 产品名称 |
| type | enum | 保险 / 基金 / 理财 / 信托 / 结构化 / 其他 |
| risk_level | int | R1(1) - R5(5) |
| expected_return | float | 预期年化收益率 |
| min_investment | float | 最低起投金额（元） |
| description | text | 产品详情描述 |
| issuer | str(200) | 发行机构 |
| target_tags | JSONB | 适合人群标签数组 |
| lock_period | str(100) | 锁定期限描述 |
| nav_history | JSONB | 近12个月净值走势 |
| source | str(50) | `"simulated"`（默认）/ `"live"` |
| created_at / updated_at | timestamp | 时间戳 |

### nav_history 格式

```json
[
  {"date": "2025-06-01", "nav": 1.0520, "return_rate": 5.20},
  {"date": "2025-07-01", "nav": 1.0608, "return_rate": 6.08}
]
```

- `nav`：模拟净值（初始 1.0，逐月随机波动 ±8% 以内）
- `return_rate`：对应年化收益率
- 产品创建时自动生成 12 个月模拟走势数据
- `source: "live"` 预留后续对接真实 API

## 客户模型扩展

Customer 表新增 `allocation_plan` JSONB 字段：

```json
{
  "ai_plan": {
    "conservative": {
      "plan_type": "保守型",
      "overall_rationale": "...",
      "risk_return_profile": "...",
      "allocations": [
        {"product_id": "...", "product_name": "...", "ratio": 0.40, "amount": 400000, "reason": "..."}
      ]
    },
    "balanced": { "..." },
    "aggressive": { "..." }
  },
  "user_plan": { "..." },
  "total_investable": 1000000,
  "generated_at": "2026-05-20T..."
}
```

- `ai_plan`：AI 生成的原始方案，不可编辑
- `user_plan`：首次生成时深拷贝 ai_plan，用户在 UI 中调整
- 前端提供 AI/自定义切换查看
- 重新生成只更新 ai_plan，user_plan 保留

## API 设计

### 产品管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/products` | 产品列表 `?type=&risk_level=&q=&page=&page_size=` (分页) |
| POST | `/api/products` | 创建单个产品 |
| POST | `/api/products/batch` | CSV 批量导入 |
| GET | `/api/products/{id}` | 产品详情（含 nav_history） |
| PUT | `/api/products/{id}` | 更新产品 |
| DELETE | `/api/products/{id}` | 删除产品 |

### 配置方案

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/customers/{id}/allocation-plan` | 生成配置方案 |
| PUT | `/api/customers/{id}/allocation-plan` | 保存用户调整后的方案 |

- `POST` 生成：读取客户画像 + 全量产品库 → DeepSeek prompt → 返回三套方案 → 存入 `ai_plan` + 复制到 `user_plan`。无请求体。
- `PUT` 保存：请求体 `{"user_plan": {...}, "total_investable": 1000000}`，仅更新 `user_plan`，不影响 `ai_plan`
- 约束：产品库为空时拒绝生成（400 错误）

## AI Prompt 设计

### 输入上下文
- `structured_data`：年龄、职业、收入、资产、风险偏好、投资经验、理财目标
- `scores`：6维评分（风险承受力、财富规模、投资经验、需求紧迫度、客户潜力、沟通难度）
- `products[]`：产品库全部产品的 id、名称、类型、风险等级、收益率、锁定期限、描述

### 输出格式
三套方案 `{conservative, balanced, aggressive}`，每套含：
- `plan_type`：方案名称
- `overall_rationale`：组合逻辑（4-6句）
- `risk_return_profile`：预期收益、最大回撤、适合人群（2-3句）
- `allocations[]`：每个分配产品含 product_id、ratio（小数）、amount（整数）、reason

### 约束规则（Prompt 中声明）
- 每套方案所有 allocation ratio 之和必须为 1.0
- 分配产品风险等级不得超过客户风险承受力 2 级以上
- 每套方案必须至少分配 3 个以上不同产品
- amount 基于客户可投资资产估算（可从资产字段推断，缺省按 100 万）
- 必须引用客户具体数据（风险偏好、投资经验等）解释推荐理由

## 前端设计

### 入口
客户详情页"配置方案"Tab（已预留，当前为占位状态）。

### 产品库管理（Tab 内）
- 产品列表：折叠式，每行显示名称、类型标记、风险等级色标、预期收益，分页显示
- 分页：复用客户列表的分页组件（`«` / 页码省略号 / `»` + 跳转输入框），page_size 默认 10
- 点击展开：产品详情卡片 + 净值走势图（Recharts 面积图，12个月）
- 顶部工具栏：搜索 + 筛选（类型/风险等级）+ 新增产品按钮 + CSV 导入按钮
- 新增产品：弹出 Modal 表单（名称、类型、风险等级、收益、起投、机构、描述、标签、期限）
- CSV 导入：拖拽上传 + 预览表格 + 确认导入。CSV 列：`name,type,risk_level,expected_return,min_investment,description,issuer,target_tags,lock_period`

### 配置方案展示
- **方案类型切换**：保守/稳健/进取 三个标签按钮
- **AI/自定义切换**：顶部切换按钮，对比查看 AI 原始方案与用户调整版本
- **概要卡片**：组合逻辑文字 + 风险收益概要
- **堆叠柱状图**：Recharts 按产品分段的堆叠条，可视化配比（仅展示，不参与拖动）
- **配置明细列表**：每只产品的比例、预估金额、配置理由

### 交互式调整
- 点击"编辑配置"按钮进入编辑模式
- 每条产品配比出现：滑条 + 数字输入框，联动调整
- 前端实时计算总和并校验：不等于 100% 时红色警告，不允许保存
- "重置为 AI 方案"：将 user_plan 恢复为 ai_plan
- "保存调整"：PUT 接口保存 user_plan

### 走势图
- Recharts AreaChart，数据来自产品 nav_history
- 暗色主题配色，渐变填充
- 鼠标悬停显示具体日期/净值/收益率

### PDF 导出
- 导出按钮在配置方案 Tab 顶部
- 导出时复用现有 PDF 切片逻辑
- 包含：三套方案概要 + 堆叠图 + 配置明细（使用当前查看的方案类型和 AI/自定义版本）

## 技术选型

- **走势图**：Recharts（项目已使用，RadarChart 同库）
- **堆叠柱状图**：Recharts BarChart stacked
- **滑块调整**：原生 `<input type="range">` + Tailwind 样式，无需额外库
- **CSV 解析**：PapaParse（前端轻量 CSV 解析）
- **后端模拟数据**：Python `random` / `uuid`，产品创建时自动生成 nav_history

## 实施顺序

1. 后端：FinancialProduct model + migration + schemas
2. 后端：产品 CRUD + CSV 批量导入 API
3. 后端：配置方案生成 service + API 端点
4. 前端：产品管理 UI（列表 + 表单 + CSV 导入）
5. 前端：配置方案展示（三方案切换 + AI/自定义切换 + 堆叠图 + 配置明细）
6. 前端：交互式调整（滑条 + 输入框 + 校验）
7. 前端：走势图组件
8. 前端：PDF 导出覆盖配置方案
9. 种子数据：生成 20-25 只覆盖各类型的模拟产品（覆盖 2-3 页分页效果）
