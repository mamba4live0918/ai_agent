# 仿真培训（AI 数字人对练）Design Spec

**Date:** 2026-05-21
**Status:** Approved

## Goal

构建"陪跑助手 + 仿真培训"双核心场景中的仿真培训模块：AI 数字人客户模拟真实销售场景，AI 数字人教练实时辅助并复盘点评。文字交互优先，语音后续。

## Scope — First Iteration

### In Scope
- 3 种训练场景：客诉处理、产品讲解、异议处理
- 两种数字人来源：基于现有客户 AI 画像自动生成 / 手动创建
- 教练实时侧边栏提示（策略建议、话术矫正、销售金句、情绪感知）
- 对话后复盘报告（评分、雷达图、趋势图、话术对比、技能短板）
- 训练记录归档：按客户关联，支持历史查询
- 继续未完成的训练会话
- 响应式布局：PC 三栏 / 平板两栏 / 手机单栏

### Out of Scope
- 语音对话（预留接口，后续实现）
- 多用户登录/权限系统
- 讲师端口（统计报表、学练考评）
- 实时语音情绪识别

## Architecture

### 新增数据库表

#### `training_sessions`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| customer_id | UUID (FK → customers.id, nullable) | 关联客户，手动创建时可为空 |
| persona | JSONB | 数字人画像 {name, age, gender, occupation, personality, ...} |
| scenario | String | 客诉处理 / 产品讲解 / 异议处理 |
| scenario_context | Text | 场景背景描述和客户初始状态 |
| status | String | pending / active / completed |
| messages | JSONB | 冗余存储对话记录（便于快速读取），实际消息存 training_messages |
| coach_suggestions | JSONB | 教练在对话过程中给出的所有提示记录 |
| started_at | DateTime | |
| completed_at | DateTime | nullable |

#### `training_messages`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| session_id | UUID (FK → training_sessions.id) | |
| role | String | user / customer / coach |
| content | Text | 消息内容 |
| coach_tip | JSONB (nullable) | 当 role=user 时，本条消息教练给的提示 |
| created_at | DateTime | |

#### `training_reviews`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| session_id | UUID (FK → training_sessions.id, unique) | 一对一 |
| scores | JSONB | {expression_logic, professional_accuracy, emotional_eq, overall} 各 1-10 |
| dimension_scores | JSONB | 6 维度: {logic, professionalism, eq, flexibility, product_knowledge, customer_insight} |
| overall_comment | Text | 教练总评 |
| weakness_analysis | JSONB | [{skill, level, suggestion}] |
| highlights | JSONB | [{message_id, type: good/bad, comment, improved_version}] |
| next_steps | JSONB | [{priority, action}] |
| created_at | DateTime | |

### 状态流转

```
[选择客户 或 手动创建数字人] → [选择场景] → active（对话中）
                                                    ↓
                                              [结束训练] → completed → 生成复盘
                                                    
pending 状态：会话创建但未开始对话，或对话中断未结束，可继续
```

### 新增 API 端点

Base: `/api/training`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/sessions` | 创建训练会话（customer_id? + persona + scenario） |
| GET | `/sessions` | 列表（?customer_id=&status=&page=&page_size=） |
| GET | `/sessions/{id}` | 会话详情（含全部消息） |
| POST | `/sessions/{id}/messages` | 发送用户消息 → 返回 AI 客户回复 + 教练提示 |
| POST | `/sessions/{id}/end` | 结束训练 → 触发复盘生成 |
| GET | `/sessions/{id}/review` | 获取复盘报告 |
| GET | `/sessions/{id}/export` | 导出复盘报告（后续可加 PDF） |

### LLM Prompt 架构

延续现有 KB-First 模式。**所有 LLM 调用（对话生成、教练提示、复盘评价）均先从 ChromaDB 检索相关知识库内容**，检索失败时静默回退到纯 LLM 生成。

1. **System prompt**：数字人画像 + 场景设定 + 行为指令（扮演客户、制造合理难度）
2. **Knowledge base context**：调用 `search_knowledge_base()` 检索与当前场景相关的知识（如客诉处理技巧、产品知识、话术模板），注入 prompt
3. **User prompt**：对话历史（最近 10 轮）+ 用户最新输入
4. **教练 prompt**：基于知识库内容 + 用户最新输入，生成 4 类提示。知识库匹配的销售技巧/话术优先采用

**复盘生成**单独调用：发送完整对话历史 + 知识库检索（场景相关评分标准、话术范例），AI 参照知识库基准进行评分和点评。

## Frontend

### 新文件
| File | Purpose |
|------|---------|
| `pages/Training.tsx` | 陪练主页面，左右面板布局 |
| `components/TrainingSession.tsx` | 对话区 + 教练侧边栏 |
| `components/TrainingReview.tsx` | 复盘报告展示（含图表） |
| `components/PersonaForm.tsx` | 数字人画像创建/编辑表单 |
| `components/SessionList.tsx` | 左侧训练记录列表 |

### 修改文件
| File | Change |
|------|--------|
| `components/Layout.tsx` | 新增"仿真培训"导航项 |
| `App.tsx` | 新增 `/training` 路由 |
| `types/index.ts` | 新增 TrainingSession, TrainingReview 等类型 |
| `services/api.ts` | 新增 7 个 training API 函数 |
| `components/CustomerProfile.tsx` | "发起训练"快捷按钮（→跳转 /training?customerId=X） |

### 响应式断点
| 宽度 | 布局 | 教练面板 | 会话列表 |
|------|------|----------|----------|
| ≥ 1280px | 三栏并排 | 固定右侧 | 固定左侧 |
| 768–1279px | 两栏 + 可折叠 | 默认折叠，抽屉展开 | 缩窄 |
| < 768px | 单栏 | 内联/底部抽屉 | 汉堡菜单抽屉 |

### 面板分隔
- 面板间 2px 实线边框 (#30363d)
- 每个面板独立 header（图标 + 标题）
- 教练面板顶部 3px 紫色色条
- 训练列表项独立圆角卡片

## Technical Decisions

1. **KB-First**：所有生成（对话、教练提示、复盘）调用 `search_knowledge_base()` 检索相关知识库内容，注入 prompt 优先参考。检索失败时静默回退。
2. **对话生成**：每轮调用 DeepSeek，temperature=0.7（比分析高，增加对话多样性）
3. **教练提示**：在同一请求中要求 AI 返回 JSON 包含 `{customer_reply, coach_tips: {strategy, phrasing, golden_quote, emotion}}`
4. **复盘生成**：发送完整对话历史 + 知识库检索结果，要求返回结构化 JSON（评分 + 点评 + 话术对比 + 短板 + 建议）
5. **历史对话窗口**：保留最近 10 轮（20 条消息），超出部分省略
6. **消息存储**：training_messages 表存所有消息；training_sessions.messages 冗余存最近 20 条以便列表快速预览

## Verification Checklist

- [ ] 从客户列表发起训练：选客户 → 自动生成数字人 → 选场景 → 开始对话
- [ ] 手动创建数字人：填写画像 → 选场景 → 开始对话
- [ ] 对话中教练实时提示显示在侧边栏
- [ ] 四种提示类型（策略/话术/金句/情绪）均出现
- [ ] 结束训练后自动跳转复盘页面
- [ ] 复盘报告含评分卡片、雷达图、趋势图、话术对比、技能短板
- [ ] 历史记录列表可查看、可筛选
- [ ] 未完成会话标记为可继续
- [ ] 继续会话：加载历史消息，从断点继续对话
- [ ] 响应式：三栏/两栏/单栏切换正常
- [ ] 面板分隔清晰
- [ ] 训练记录关联客户，手动创建的独立存在
