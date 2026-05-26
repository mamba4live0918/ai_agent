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

## 2026-05-20 — 移动端响应式适配

### 策略

Mobile-first + Tailwind 断点递增（`sm:` 640px、`lg:` 1024px），覆盖全部 13 个前端文件。

### Layout 组件

- 侧边栏：`fixed lg:static`，`-translate-x-full lg:translate-x-0` — 移动端 off-canvas，桌面端固定
- 移动端汉堡菜单 + 半透明遮罩（`bg-black/60`），点击遮罩或导航链接关闭
- 主内容区 `pt-12 lg:pt-0` 避开移动端固定顶栏

### 关键组件适配

| 组件 | 移动端 → 桌面端 |
|------|----------------|
| Dashboard 统计卡片 | `grid-cols-1 → sm:grid-cols-2` |
| Dashboard 系统状态 | `grid-cols-2 → sm:grid-cols-4` |
| KnowledgeBase 头部 | `flex-col → sm:flex-row` |
| CustomerAnalysis 列表/详情 | `col-span-12` 堆叠 → `lg:col-span-5/7` 分栏 |
| CustomerAnalysis 移动端详情 | 内联在选中卡片下方（`lg:hidden`），桌面端右侧面板 |
| CustomerProfile 信息/评分 | `grid-cols-1 → sm:2 → lg:3` |
| CustomerForm 表单 | `grid-cols-1 → sm:grid-cols-2` |
| 删除按钮 | 移动端常显，桌面端 `lg:opacity-0 lg:group-hover:opacity-100` |
| ChatPanel 高度 | `h-[380px] → sm:h-[480px]` |
| 客户卡片点击 | 首次点击展开报告，再次点击收起（toggle） |

### 售前准备报告交互

- 生成后支持"收起报告/展开报告"切换（`showPrep` state）
- 支持"重新生成"（客户信息更新后可刷新报告）
- 重新生成自动展开显示

## 2026-05-26 — 实时语音对话 AI 整合方案可行性分析

### 需求

实时语音对话 AI 辅助系统：前端分片采集音频 → WebSocket 传输 → 后端 VAD + ASR + 说话人分离 → LLM 教练在关键节点生成辅助提示 → TTS 合成回传 → 完整对话时序归档。

场景：2-4 人对话（销售 + 客户 + 可能的其他参与者），非双人场景。

### 整体结论

方案方向正确，核心模块选型合理。关键调整：用分段近实时替代流式 ASR（Whisper 架构限制），去掉 PyAnnotate（PostgreSQL JSONB 更合适），说话人分离针对 2-4 人场景做在线聚类。分 4 阶段实施，MVP 延迟目标 <1s。

### 核心模块评估

| 模块 | 可行性 | 判断 |
|------|--------|------|
| **Silero-VAD** | ✅ 可行 | 成熟方案，5ms 级延迟，人声检测 >95%。VAD 切出的音频段由 Pyannote 做二次人声校验，消除误触发 |
| **Faster-Whisper 分段 ASR** | ✅ 可行 | Whisper 架构不支持流式。改用 VAD 切段(0.3-1s) → faster-whisper base 模型逐段转写 → 累积拼接，延迟 <500ms |
| **Pyannote 说话人分离（2-4人）** | ✅ 可行 | 在线聚类策略：每段新人声提取 speaker embedding → 余弦相似度匹配已有聚类 → 超阈值绑定、低于阈值新建 → 后续可对接声纹库绑定实名 |
| **PyAnnotate 标注** | ❌ 不必要 | PyAnnotate 是通用标注工具，"音频-文本-说话人时序结构化存储"用 PostgreSQL JSONB 自己存即可，不需要额外依赖 |
| **LLM 实时应答** | ✅ 可行 | DeepSeek streaming API，不等完整句子，规则触发为主（已知延迟）+ LLM 补充深度分析 |
| **TTS + 打断** | ⚠️ 前端实现 | TTS 合成本身成熟。人声打断逻辑在前端：MediaRecorder 检测新人声 → AudioContext 停止播放 → 重启识别 |
| **JWT + WebSocket** | ✅ 可行 | FastAPI 原生 WebSocket，JWT 握手时校验一次，连接级鉴权，不需要每条消息校验 |

### 2-4 人场景的特殊处理

与双人场景的关键差异：

1. **在线聚类而非固定映射**：不能用"第1个=销售、第2个=客户"的简单规则。需要维护 speaker embedding buffer，新 segment 进来做实时匹配
2. **重叠说话人更频繁**：3-4 人对话中重叠概率显著增加。重叠片段标记为 `"overlap"`，不做文本分配，后续人工复核
3. **声纹注册流程**：2 人以上需要声纹注册才能稳定区分身份。建议在训练会话创建时要求参与者各读一段注册短语
4. **LLM 上下文复杂度**：多发言人对话需要结构化 prompt 输入，按时间序列组织发言，标注 speaker_id

```
多发言人 prompt 格式:
[00:00:03] Speaker_A: 你好，我想了解一下你们的产品
[00:00:06] Speaker_B: 好的，我先给您介绍一下我们的稳健系列
[00:00:10] Speaker_C: 稳健型最近收益怎么样？

LLM 需要在 4 维教练提示的基础上，额外识别：
- 谁是决策者（提问最多的客户方角色）
- 谁是影响者（帮腔/质疑的人）
- 多客户场景下的分角色应对话术
```

### 关键节点触发规则（用户可配置）

```python
# backend/app/services/realtime_trigger.py
TRIGGER_RULES = [
    {"id": "hesitation",   "condition": "client_hesitation",  "pattern": r"嗯+|呃+|这个...+",               "action": "coach_tip",     "priority": 1},
    {"id": "price",        "condition": "price_objection",    "pattern": r"太贵|便宜|折扣|优惠|费率",      "action": "coach_tip",     "priority": 1},
    {"id": "competitor",   "condition": "competitor_mention", "pattern": r"别的|其他公司|某行|某平台|对比",  "action": "strategy_alert", "priority": 1},
    {"id": "commitment",   "condition": "commitment_signal",  "pattern": r"可以试试|怎么签约|先买|办一个",   "action": "closing_guide",  "priority": 1},
    {"id": "silence",      "condition": "long_silence",       "timeout": 10,                              "action": "break_tip",     "priority": 2},
    {"id": "multi_speaker","condition": "multi_party_debate",  "speaker_count": ">=3",                     "action": "role_analysis", "priority": 2},
    {"id": "overlap",      "condition": "speech_overlap",      "overlap_duration": ">2s",                  "action": "moderate_tip",  "priority": 2},
    {"id": "objection",    "condition": "objection_pattern",   "pattern": r"不行|不考虑|算了|不需要|再说",  "action": "objection_handle", "priority": 1},
]
```

规则文件放在 `backend/app/services/trigger_rules.yaml`，用户可自行修改 YAML，不需要改代码。

### 推荐实现路径

```
阶段 1: 实时 ASR 管道（1-2天）
├── 前端 MediaRecorder → WebSocket 分片发送(Opus编码，8k采样)
├── 后端 Silero-VAD + faster-whisper base 分段转写
├── WebSocket 回传实时文本
└── 验证：延迟 <1s，单/双/四人轮流说话均可正确转写

阶段 2: 多人说话人分离（2-3天）
├── speaker embedding 提取 + 在线增量聚类(上限4人)
├── ASR 文本绑定 speaker 标签
├── 重叠段检测与标记
└── 验证：2-4 人交替说话 90%+ 正确区分，重叠段正确标记

阶段 3: AI 教练触发（2-3天）
├── 规则引擎加载 YAML 配置
├── 规则命中 → LLM streaming 生成教练建议
├── 规则未命中但上下文异常 → LLM fallback 分析
└── 验证：关键节点触发准确，建议适时不干扰

阶段 4: TTS + 打断 + 归档（2-3天）
├── TTS 合成语音输出
├── 前端打断检测 + 重启识别
├── 完整对话时序归档
└── 验证：全链路延迟 <2s（含 TTS），打断体感流畅

阶段 5（后续）: 声纹库构建
├── 注册短语采集 speaker embedding → 入库
├── 对话中 embedding 匹配声纹库 → 绑定实名身份
└── 产出带身份标签的对话记录
```

### 性能约束

| 环节 | 目标延迟 | 备注 |
|------|----------|------|
| VAD | <10ms | Silero ONNX 推理 |
| ASR (per segment) | <300ms | faster-whisper base INT8 |
| Speaker embedding | <50ms | pyannote embedding model |
| 在线聚类匹配 | <10ms | NumPy 余弦相似度 |
| LLM 流式输出 | <800ms | DeepSeek streaming |
| TTS 合成 | <300ms | Edge TTS / CosyVoice |
| **端到端总延迟** | **<1.5s** | 不含网络传输 |

### 技术选型对比

| 环节 | 选择的方案 | 不选的方案 | 原因 |
|------|-----------|-----------|------|
| ASR | faster-whisper base INT8 | SenseVoice / FunASR | 已有依赖，CTranslate2 加速成熟 |
| VAD | Silero-VAD | WebRTC VAD | Silero 中文场景准确率更高 |
| Speaker | pyannote embedding + 在线聚类 | pyannote streaming diarization | 流式 API 不成熟，在线聚类更可控 |
| 标注存储 | PostgreSQL JSONB | PyAnnotate | 无需额外依赖，JSONB 灵活可查 |
| TTS | Edge TTS (免费) | OpenAI TTS | 免费 + 中文自然度高 |
| 传输 | WebSocket + Opus 编码 | WebRTC | WebSocket 更简单，Opus 压缩率够用 |

### 风险与缓解

| 风险 | 严重度 | 缓解措施 |
|------|--------|----------|
| Whisper base 中文识别率不稳定 | 高 | 先用 large-v3（已有）对比；关键节点文本做拼音容错匹配 |
| 3-4 人重叠说话频繁 | 中 | 重叠段标记跳过 + fallback 上下文推断；VAD 窗口缩短减少重叠概率 |
| 冷启动无已知 speaker embeddings | 中 | 前 5 秒快速构建 embedding 集；支持手动标注矫正 |
| LLM 延迟叠加累积 | 中 | 规则触发为主（0ms LLM 延迟），LLM 仅关键节点深度分析 |
| WebSocket 长时间断连 | 低 | 前端自动重连 + 服务端对话上下文内存缓存（5 分钟 TTL） |

### 关键节点配置设计

用户可通过 YAML 配置触发规则，无需修改代码：

```yaml
# backend/app/services/trigger_rules.yaml
triggers:
  - id: hesitation
    condition: client_hesitation
    pattern: "嗯+|呃+|这个...+"
    action: coach_tip
    priority: 1
    cooldown: 15  # 同一规则触发后冷却秒数

  - id: price_objection
    condition: price_objection
    pattern: "太贵|便宜|折扣|优惠|费率|费用"
    action: coach_tip
    priority: 1
    cooldown: 20

  - id: competitor_mention
    condition: competitor_mention
    pattern: "别的|其他公司|某行|某平台|对比|别家"
    action: strategy_alert
    priority: 1
    cooldown: 30

  - id: commitment_signal
    condition: commitment_signal
    pattern: "可以试试|怎么签约|先买|办一个|来一份"
    action: closing_guide
    priority: 1
    cooldown: 30

  - id: long_silence
    condition: long_silence
    timeout: 10
    action: break_tip
    priority: 2
    cooldown: 60

  - id: multi_party
    condition: multi_party_debate
    speaker_count: ">=3"
    action: role_analysis
    priority: 2
    cooldown: 45

  - id: objection
    condition: objection_pattern
    pattern: "不行|不考虑|算了|不需要|再说|再想想"
    action: objection_handle
    priority: 1
    cooldown: 20

  - id: emotional_shift
    condition: sentiment_change
    threshold: 0.4  # 情绪波动阈值
    action: emotion_alert
    priority: 2
    cooldown: 30
```

---

## 2026-05-20 — 客户列表分页

### 后端

- `GET /api/customers` 新增 `page`（默认1）/ `page_size`（默认10，上限100）查询参数
- SQL: `offset((page-1) * page_size).limit(page_size)`
- 响应新增 `page`, `page_size`, `total_pages` 三个字段

### 前端

- 分页栏：`«` / 页码按钮（省略号算法，当前页±1显示） / `»` + "2/5 页" + 跳转输入框
- 搜索时自动重置到第1页
- 切换页面时清除已选客户
- 跳转输入框限制仅数字，Enter 跳转


