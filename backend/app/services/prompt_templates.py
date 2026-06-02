"""
Shared LLM interaction utilities used across services. Single source of truth.

Duplicated code extracted from:
- training_service.py / post_sales_service.py: identical _extract_json (7 lines)
- customer_service / training_service / allocation_service / post_sales_service /
  quiz_service / rag_service: identical _client = OpenAI(...) (4 lines)
- 7 locations across 5 services: identical think-block + markdown-fence cleanup

Note on KB-first preambles:
  Each service has its own KB-first rule line (【KB优先原则】...) in its prompt.
  All variants are similar but NOT exact duplicates — each is customized for its
  specific prompt context (different KB sources, different annotation wording).
  Example variants:
  - customer_service ANALYSIS: "KB支撑的分析在reasoning中标注..."
  - customer_service PRESALES: "KB支撑的建议标注'📚'，KB未覆盖、AI自行判断的标注'💡AI分析'..."
  - training_service BRIEFING: "AI自行补充的标注'💡AI分析'"
  - training_service COACH:   "KB支撑的建议标注'📚'，AI自行判断的标注'💡AI分析'"
  - training_service REVIEW:  "KB支撑的点评标注'📚'..."
  - allocation_service:       "KB支撑的方案逻辑标注'📚'，KB未覆盖、AI自行设计的标注'💡AI分析'"
  - post_sales_service REPORT: "KB支撑的分析标注'📚'..."
  These customizations are intentional — each prompt tailors the KB-first rule to
  its specific output format (reasoning vs suggestions vs analysis vs plan logic).
  DO NOT force-unify them without a deliberate standardization pass.

Note on DISC framework text:
  The DISC personality framework appears in 4 distinct forms across services:
  - customer_service ANALYSIS_PROMPT: professional DISC model description (English,
    banking standard, with product suitability)
  - customer_service PRESALES_PREP_PROMPT: DISC Communication Quick Reference
    (Chinese, communication strategies per type)
  - training_service CUSTOMER_AGENT_PROMPT: DISC behavior guidelines for simulation
    (English, imperative commands per type)
  - training_service COACH_AGENT_PROMPT: DISC Coaching Framework (English,
    evaluation checklist per type)
  Each is a DIFFERENT text block for a DIFFERENT purpose. Not duplicated.

Note on coach dimensions (策略建议/话术矫正/销售金句/情绪感知):
  These 4 dimensions appear in training_service COACH_AGENT_PROMPT as JSON field
  descriptions, and in trigger_engine.py as action prompt sections. The text differs
  (one describes expected output, the other instructs what to generate).
"""

import json
import re
from openai import OpenAI

from ..config import settings


def get_deepseek_client() -> OpenAI:
    """Create a configured DeepSeek API client.

    Appears in: customer_service, training_service, allocation_service,
    post_sales_service, quiz_service, rag_service (6 copies of identical 4-line block)
    """
    return OpenAI(
        api_key=settings.deepseek_api_key,
        base_url=settings.deepseek_base_url,
    )


def clean_llm_content(content: str) -> str:
    """Remove think blocks, extract JSON from markdown fences, strip control chars.

    Appears in: customer_service (x2), allocation_service, post_sales_service,
    training_service, quiz_service, rag_service (7 locations, 5 files)
    """
    content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", content)
    if m:
        content = m.group(1).strip()
    # Strip control characters that break JSON parsing (except \t, \n, \r)
    content = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", content)
    return content.strip()


def extract_json(content: str) -> dict:
    """Clean LLM response and parse as JSON. Returns dict with error key on failure.

    Appears in: training_service._extract_json, post_sales_service._extract_json
    (identical 7-line functions)
    """
    content = clean_llm_content(content)
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {"raw": content, "error": "JSON parse failed"}
