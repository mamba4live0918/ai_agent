# 基本信息九宫格编辑器 + AI 联动

## 目标

将客户分析页的"基本信息"区域改造为可编辑的 3×3 九宫格，所有客户均可用。人工编辑后可触发 AI 重新生成，AI 优先参考人工补充的信息。

## 现状

- 基本信息 9 个字段：年龄、性别、职业、收入水平、资产状况、风险偏好、投资经验、家庭状况、理财目标
- 当前 `.filter()` 隐藏了空值/未知字段，只显示有值的格子
- "重新生成"按钮已存在，但后端只读 `raw_input`，不接收人工编辑的 `structured_data`

## 设计

### 前端 — CustomerProfile.tsx

**九宫格改造：**
- 移除 `.filter(([, v]) => v && v !== '未知')`，9 个格子始终以 3×3 排列
- 空值格子显示淡色占位符 "—"，非空的显示内容
- 每个格子右下角加 ✎ 编辑按钮（复用 KycGrid 的交互模式）
- 编辑：点击 → textarea 替换文本 → 保存
- 编辑状态存本地 `Record<string, string>`（key = 字段名）
- 保存：调用 `PUT /api/customers/{id}`，把 edits 合并到 `structured_data`

**重新生成联动：**
- `handleRegenerate` 改为：把当前 `structured_data`（含人工编辑）一起 POST 到后端
- 生成成功后刷新 `localCustomer`

### 后端 — customer.py

**修改 `POST /{customer_id}/regenerate-profile`：**
- 请求体新增可选字段 `structured_data: dict | None`
- 传给 `analyze_customer()` 时一同传入

### 后端 — customer_service.py

**修改 `analyze_customer()`：**
- 新增参数 `edited_structured_data: dict | None = None`
- 在 prompt 中注入人工编辑数据：
  ```
  【人工补充信息（优先参考）】
  以下字段来自人工编辑，请优先采用，不需要 AI 重新推断：
  - 职业：xxx
  - 风险偏好：xxx
  （仅列出有值的字段）
  ```
- 无人工编辑时行为不变（回退到纯 raw_text 分析）

### API 变更

| 端点 | 变更 |
|------|------|
| `POST /api/customers/{id}/regenerate-profile` | 请求体新增可选 `structured_data` 字段 |
| `POST /api/customers/analyze` | 不变 |
| `PUT /api/customers/{id}` | 不变（已有，用于保存编辑后的 structured_data） |

### 前端 API 封装

```typescript
// api.ts — 修改
export const regenerateProfile = (id: string, structuredData?: Record<string, unknown>) =>
  request<Customer>(`/customers/${id}/regenerate-profile`, {
    method: 'POST',
    body: JSON.stringify({ structured_data: structuredData || null }),
  });
```

### 交互流程

```
九宫格显示全部 9 格
  ├─ 有值 → 显示内容 + ✎ 编辑
  └─ 无值 → 显示 "—" + ✎ 编辑
       ↓ 点击编辑
  textarea 替换 → 输入内容 → 保存
       ↓
  PUT /api/customers/{id} (更新 structured_data)
       ↓
  点"重新生成" → POST /api/customers/{id}/regenerate-profile
                  body: { structured_data: {...人工编辑内容...} }
       ↓
  LLM 收到 raw_input + 人工编辑 → 生成新画像（人工信息优先）
```

### 涉及文件

| 文件 | 改动 |
|------|------|
| `frontend/src/components/CustomerProfile.tsx` | 九宫格改造 + 编辑状态 + regenerate 联动 |
| `frontend/src/services/api.ts` | `regenerateProfile` 新增参数 |
| `backend/app/routers/customer.py` | regenerate 端点接受 structured_data |
| `backend/app/services/customer_service.py` | analyze_customer 接受人工编辑并注入 prompt |

### 验证

1. 打开任意客户 → 基本信息显示完整 3×3 九宫格（含空值占位）
2. 点击空值格子 → 编辑 → 保存 → 刷新后编辑内容保留
3. 编辑多个格子 → 点重新生成 → AI 分析报告中引用了人工编辑的信息
4. 无人工编辑时点重新生成 → 行为不变，不报错
5. PDF 导出 → 九宫格正常显示（含空值格子和编辑后的内容）
