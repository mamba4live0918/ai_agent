# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目目标

构建"陪跑助手 + 仿真培训"双核心场景的销售辅助平台：

**陪跑助手** — 覆盖售前/售中/售后的全流程销售辅助系统：
- 客户分析：导入客户信息（文字/图片），画像分析，信息存档查询，导出电子文档
- 资产配置方案：导入金融产品信息，联网搜索产品详情，生成配置方案，导出文档
- 售前准备：基于客户生命周期生成营销建议（潜在难点、应对话术、心态准备、维护动作），支持仿真培训预演
- 售中辅助：记录销售过程，（后续：实时语音识别客户情绪/意向/问题，提供应对话术/避坑建议/促销策略）
- 售后分析：生成客户销售档案（分类/查询/萃取/删除），导出电子表格，给出评价与行动建议
- 销售辅助知识库：财经法税知识、沟通技巧、行业知识、销售案例等（图文/短视频）
- 30秒客户宣教视频生成及分发
- 用户激励：评价、反馈、分享

**仿真培训** — AI数字人对练系统：
- AI数字人客户：根据客户信息自动生成合适的数字人画像（年龄/性别/职业/性格等），沉浸式语音对话模拟不同销售场景（客诉处理、产品讲解、异议处理）
- AI数字人教练：实时提供策略建议、话术矫正、销售金句，复盘点评表达逻辑/专业准确度/情绪情商，记录训练过程并归档
- 预留讲师端口：统计训练结果，导出报表，学练考评闭环

**终端支持**：PC端 + 移动端双端访问
**当前开发阶段**：文字交互优先，语音功能暂不处理

## 当前状态

`main.py` 是目前的原型代码 — 一个基于 RAG 的文档问答系统（LangChain + ChromaDB + DeepSeek + Gradio）。它是技术验证的一部分，后续会按功能模块拆分为正式项目结构。

## 技术栈

- **Python 3.11**（虚拟环境 `.venv/`）
- **LangChain**: 文档加载、文本分割、ChromaDB 封装
- **ChromaDB**: 本地向量存储 (`./chroma_db/`)
- **Ollama**: 本地 Embedding 模型 (`nomic-embed-text`)
- **DeepSeek API**: 推理 LLM (`deepseek-reasoner`)，通过 OpenAI 兼容客户端调用 `https://api.deepseek.com`
- **Gradio**: Chat UI（原型阶段）

## 命令

```bash
# 激活虚拟环境
source .venv/Scripts/activate

# 运行当前原型
python main.py

# 安装依赖
pip install <package>
```

## 架构说明

当前 `main.py` (~390行) 的管道流程：
1. 配置：从环境变量读取 `DEEPSEEK_API_KEY`，设置模型名称和目录路径
2. 文档加载：遍历 `./documents/`，按扩展名选择 LangChain loader（PDF/DOCX/TXT/MD/PPTX），附加来源元数据
3. 文本分割：`RecursiveCharacterTextSplitter`，chunk_size=2000，chunk_overlap=400
4. 向量存储：每次启动删除并重建 `./chroma_db/`，通过 `OllamaEmbeddings` 嵌入
5. 检索：`vectorstore.as_retriever()` 检索 top-8 chunk
6. LLM 查询：构建含对话历史（最近3轮）和检索上下文的 prompt，调用 DeepSeek，移除 `{const think}` 标签
7. Gradio UI：`gr.ChatInterface` 连接 `ask_question()` 函数

## 关键约束

- 对话历史仅在内存中，重启丢失。ChromaDB 每次启动从 `./documents/` 重建
- 本地需运行 Ollama 并已拉取 `nomic-embed-text` 模型
- 必须设置 `DEEPSEEK_API_KEY` 环境变量，否则启动报错
- DeepSeek reasoner 响应需后处理移除 `{const think}...{/const think}` 块
