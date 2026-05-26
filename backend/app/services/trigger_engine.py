"""
Rule-based trigger engine for real-time sales coaching.

Evaluates transcribed speech segments against a YAML rule-set and generates
real-time coach prompts via DeepSeek LLM when triggers fire.

Architecture
------------
1. RuleEngine  — loads trigger_rules.yaml, evaluates incoming text/context
                against rules with cooldown management
2. CoachPromptBuilder — builds action-specific LLM prompts and streams
                coaching tips from DeepSeek
"""

from __future__ import annotations

import logging
import os
import re
import time
from dataclasses import dataclass, field
from typing import Optional

import yaml
from openai import OpenAI

from ..config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class TriggerRule:
    """A single trigger rule loaded from YAML configuration."""

    id: str
    condition: str
    action: str
    priority: int
    cooldown: float
    pattern: Optional[str] = None       # regex pattern for text matching
    timeout: Optional[float] = None     # seconds of silence threshold
    speaker_count: Optional[str] = None # comparison string e.g. ">=3"
    threshold: Optional[float] = None   # sentiment change threshold

    _compiled_pattern: Optional[re.Pattern] = field(default=None, repr=False, init=False)

    def get_pattern(self) -> Optional[re.Pattern]:
        """Return compiled regex pattern, compiling on first access."""
        if self.pattern is None:
            return None
        if self._compiled_pattern is None:
            self._compiled_pattern = re.compile(self.pattern)
        return self._compiled_pattern

    def evaluate_speaker_count(self, count: int) -> bool:
        """Check if the speaker count matches the rule's condition string."""
        if self.speaker_count is None:
            return False
        spec = self.speaker_count.strip()
        for op in (">=", "<=", ">", "<", "==", "!="):
            if spec.startswith(op):
                try:
                    threshold_val = int(spec[len(op):].strip())
                except ValueError:
                    logger.warning(
                        "Invalid speaker_count '%s' for rule '%s'", spec, self.id
                    )
                    return False
                return _compare(count, op, threshold_val)
        logger.warning(
            "Unparseable speaker_count '%s' for rule '%s'", spec, self.id
        )
        return False


@dataclass
class TriggerMatch:
    """A matched trigger with context for downstream prompt building."""

    rule_id: str
    action: str
    matched_text: str
    context: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _compare(value: int, op: str, threshold: int) -> bool:
    """Evaluate integer comparison expressions."""
    if op == ">=":
        return value >= threshold
    if op == "<=":
        return value <= threshold
    if op == ">":
        return value > threshold
    if op == "<":
        return value < threshold
    if op == "==":
        return value == threshold
    if op == "!=":
        return value != threshold
    return False


# ---------------------------------------------------------------------------
# RuleEngine
# ---------------------------------------------------------------------------


class RuleEngine:
    """Evaluates trigger rules against transcribed text and session context.

    Features
    --------
    - Regex-based text matching for Priority-1 rules (coach_tip, strategy_alert,
      closing_guide, objection_handle).
    - Context-based triggers for Priority-2 rules (silence timeout, multi-party
      detection, sentiment shifts).
    - Per-rule cooldown management to prevent repeated triggers in a short window.
    """

    def __init__(self, yaml_path: Optional[str] = None):
        if yaml_path is None:
            yaml_path = os.path.join(os.path.dirname(__file__), "trigger_rules.yaml")

        self._rules: list[TriggerRule] = []
        self._cooldowns: dict[str, float] = {}  # rule_id -> last trigger timestamp
        self._load_rules(yaml_path)
        logger.info("RuleEngine loaded %d rules from %s", len(self._rules), yaml_path)

    # -- public API ---------------------------------------------------------

    def evaluate(
        self,
        text: str,
        speaker_id: str = "",
        speaker_count: int = 0,
        silence_duration: float = 0.0,
    ) -> list[TriggerMatch]:
        """Check all rules against the given inputs.

        Parameters
        ----------
        text : str
            The latest transcribed text to match regex patterns against.
        speaker_id : str
            Identifier of the speaker who produced *text*.
        speaker_count : int
            Current number of distinct speakers detected.
        silence_duration : float
            Duration of ongoing silence in seconds.

        Returns
        -------
        list[TriggerMatch]
            Matching triggers, sorted by priority (lowest first), respecting
            per-rule cooldowns.
        """
        now = time.time()
        matches: list[TriggerMatch] = []

        for rule in self._rules:
            # 1. Cooldown check
            last_trigger = self._cooldowns.get(rule.id, 0.0)
            if now - last_trigger < rule.cooldown:
                continue

            # 2. Evaluate condition
            match_context: Optional[dict] = None

            if rule.pattern is not None:
                # Regex-based text matching (Priority-1 rules)
                match_context = self._eval_regex(rule, text)
            elif rule.timeout is not None:
                # Silence timeout (long_silence rule)
                match_context = self._eval_silence(rule, silence_duration)
            elif rule.speaker_count is not None:
                # Multi-party detection
                match_context = self._eval_multi_party(rule, speaker_count)
            elif rule.threshold is not None:
                # Sentiment change check — context-only, fires when external
                # sentiment delta is provided via a separate evaluate_sentiment() call
                # Here we only handle cases where text is present and we rely on
                # external sentiment tracking to pass the delta in context.
                continue  # handled via evaluate_sentiment()

            if match_context is None:
                continue

            # 3. Record match and update cooldown
            matched_text = match_context.pop("matched_text", text)
            trigger = TriggerMatch(
                rule_id=rule.id,
                action=rule.action,
                matched_text=matched_text,
                context=match_context,
            )
            matches.append(trigger)
            self._cooldowns[rule.id] = now
            logger.info(
                "Trigger fired: rule=%s action=%s matched=%r",
                rule.id,
                rule.action,
                matched_text[:80],
            )

        # Sort by priority (lower number = higher priority = first)
        matches.sort(key=lambda m: self._get_rule_priority(m.rule_id))
        return matches

    def evaluate_sentiment(self, delta: float) -> Optional[TriggerMatch]:
        """Check sentiment-based triggers separately.

        Parameters
        ----------
        delta : float
            Absolute sentiment change since the last check (0.0-1.0).

        Returns
        -------
        TriggerMatch or None
        """
        now = time.time()

        for rule in self._rules:
            if rule.threshold is None:
                continue

            last_trigger = self._cooldowns.get(rule.id, 0.0)
            if now - last_trigger < rule.cooldown:
                continue

            if delta >= rule.threshold:
                trigger = TriggerMatch(
                    rule_id=rule.id,
                    action=rule.action,
                    matched_text="",
                    context={
                        "condition": rule.condition,
                        "sentiment_delta": round(delta, 3),
                        "threshold": rule.threshold,
                    },
                )
                self._cooldowns[rule.id] = now
                logger.info(
                    "Trigger fired: rule=%s action=%s delta=%.3f",
                    rule.id,
                    rule.action,
                    delta,
                )
                return trigger

        return None

    def reset(self) -> None:
        """Reset all cooldowns (e.g. when starting a new session)."""
        self._cooldowns.clear()
        logger.info("RuleEngine cooldowns reset")

    @property
    def rules(self) -> list[TriggerRule]:
        """Return the loaded rule list (read-only view)."""
        return list(self._rules)

    # -- internals -----------------------------------------------------------

    def _load_rules(self, yaml_path: str) -> None:
        """Parse trigger_rules.yaml into TriggerRule objects."""
        with open(yaml_path, "r", encoding="utf-8") as f:
            config = yaml.safe_load(f)

        if config is None or "triggers" not in config:
            logger.warning("No 'triggers' key found in %s", yaml_path)
            return

        self._rules = []
        for entry in config["triggers"]:
            rule = TriggerRule(
                id=entry["id"],
                condition=entry["condition"],
                action=entry["action"],
                priority=entry.get("priority", 1),
                cooldown=entry.get("cooldown", 30),
                pattern=entry.get("pattern"),
                timeout=entry.get("timeout"),
                speaker_count=entry.get("speaker_count"),
                threshold=entry.get("threshold"),
            )
            # Validate action is known
            if rule.action not in CoachPromptBuilder.ACTION_PROMPTS:
                logger.warning(
                    "Unknown action '%s' for rule '%s' — no prompt template defined",
                    rule.action,
                    rule.id,
                )
            self._rules.append(rule)

        # Sort by priority for deterministic evaluation order
        self._rules.sort(key=lambda r: r.priority)

    @staticmethod
    def _eval_regex(rule: TriggerRule, text: str) -> Optional[dict]:
        """Evaluate a regex-based rule against text."""
        pattern = rule.get_pattern()
        if pattern is None:
            return None
        match = pattern.search(text)
        if match:
            return {
                "matched_text": match.group(),
                "condition": rule.condition,
            }
        return None

    @staticmethod
    def _eval_silence(rule: TriggerRule, silence_duration: float) -> Optional[dict]:
        """Evaluate a silence timeout rule."""
        if rule.timeout is None:
            return None
        if silence_duration >= rule.timeout:
            return {
                "matched_text": "",
                "condition": rule.condition,
                "silence_duration": silence_duration,
                "timeout": rule.timeout,
            }
        return None

    @staticmethod
    def _eval_multi_party(rule: TriggerRule, speaker_count: int) -> Optional[dict]:
        """Evaluate a multi-party detection rule."""
        if rule.evaluate_speaker_count(speaker_count):
            return {
                "matched_text": "",
                "condition": rule.condition,
                "speaker_count": speaker_count,
                "threshold": rule.speaker_count,
            }
        return None

    def _get_rule_priority(self, rule_id: str) -> int:
        """Look up the priority of a rule by ID."""
        for rule in self._rules:
            if rule.id == rule_id:
                return rule.priority
        return 99


# ---------------------------------------------------------------------------
# CoachPromptBuilder
# ---------------------------------------------------------------------------


class CoachPromptBuilder:
    """Builds LLM coaching prompts and streams responses from DeepSeek.

    Each trigger action type maps to a Chinese-language prompt template designed
    to produce concise, actionable sales coaching advice.

    Uses the same OpenAI client pattern as other services in the project
    (customer_service, training_service, etc.).
    """

    ACTION_PROMPTS: dict[str, str] = {
        "coach_tip": (
            "你是销售教练，正在实时辅助销售人员与客户对话。\n\n"
            "【最近对话记录】\n"
            "{transcript}\n\n"
            "【触发语句】\n"
            "客户刚说了：“{matched_text}”\n\n"
            "{customer_profile}"
            "请提供以下指导（2-3句话，简洁可操作）：\n"
            "1. 策略建议：当前情况下的最佳应对方向\n"
            "2. 推荐应对话术：给出一句可直接使用的销售用语"
        ),
        "strategy_alert": (
            "你是销售教练，正在辅助销售人员应对竞品对比场景。\n\n"
            "【最近对话记录】\n"
            "{transcript}\n\n"
            "【触发语句】\n"
            "客户提到了竞品：“{matched_text}”\n\n"
            "{customer_profile}"
            "请提供以下指导（3-4句话）：\n"
            "1. 竞品对比策略：如何在不贬低竞品的情况下突出我方优势\n"
            "2. 话术示例：给出一句自然的话题转移话术\n"
            "3. 注意事项：回应竞品时的禁忌表达"
        ),
        "closing_guide": (
            "你是销售教练，客户已表现出成交意向。\n\n"
            "【最近对话记录】\n"
            "{transcript}\n\n"
            "【触发语句】\n"
            "客户表现出购买信号：“{matched_text}”\n\n"
            "{customer_profile}"
            "请提供以下指导（3-4句话）：\n"
            "1. 促单策略：当前阶段的最佳促成方法\n"
            "2. 行动建议：下一步具体操作（如：确认意向→准备合同→预约签约）\n"
            "3. 风险提示：促单过急可能导致的反效果"
        ),
        "objection_handle": (
            "你是销售教练，客户提出了异议或抗拒。\n\n"
            "【最近对话记录】\n"
            "{transcript}\n\n"
            "【触发语句】\n"
            "客户说：“{matched_text}”\n\n"
            "{customer_profile}"
            "请提供以下指导（3-4句话）：\n"
            "1. 异议分析：客户抗拒的真实可能原因\n"
            "2. 应对话术：给出一句化解异议的具体说法\n"
            "3. 情绪管理：如何保持对话氛围不冷场"
        ),
        "break_tip": (
            "你是销售教练，对话中出现了较长时间的沉默。\n\n"
            "【最近对话记录】\n"
            "{transcript}\n\n"
            "【情况】\n"
            "当前沉默已持续约 {silence_duration} 秒。\n\n"
            "{customer_profile}"
            "请提供以下指导（2-3句话）：\n"
            "1. 破冰建议：如何自然地重新开启话题\n"
            "2. 话术示例：一句轻松自然的过渡用语\n"
            "注意：保持轻松自然的语气，不要让客户感到压力"
        ),
        "role_analysis": (
            "你是销售教练，当前对话中有多个参与方。\n\n"
            "【最近对话记录】\n"
            "{transcript}\n\n"
            "【情况】\n"
            "检测到 {speaker_count} 位说话人参与对话。\n\n"
            "{customer_profile}"
            "请提供以下指导（4-5句话）：\n"
            "1. 角色识别：分析各说话人的可能身份和立场\n"
            "2. 分角色策略：对每位参与者的差异化沟通建议\n"
            "3. 控场技巧：如何在多人场景中掌握对话主导权\n"
            "4. 注意事项：避免被次要角色分散注意力"
        ),
        "emotion_alert": (
            "你是销售教练，检测到客户情绪出现明显变化。\n\n"
            "【最近对话记录】\n"
            "{transcript}\n\n"
            "{customer_profile}"
            "请提供以下指导（3-4句话）：\n"
            "1. 情绪判断：当前客户可能的情绪状态\n"
            "2. 调整策略：如何根据情绪变化调整沟通方式\n"
            "3. 安抚话术：一句缓和情绪或强化积极情绪的话术"
        ),
    }

    def __init__(self):
        self._client = OpenAI(
            api_key=settings.deepseek_api_key,
            base_url=settings.deepseek_base_url,
        )

    # -- public API ---------------------------------------------------------

    def build_prompt(
        self,
        trigger: TriggerMatch,
        recent_transcript: list[dict],
        customer_profile: str = "",
    ) -> str:
        """Build the full LLM prompting string for a trigger match.

        Parameters
        ----------
        trigger : TriggerMatch
            The fired trigger with action type and context.
        recent_transcript : list[dict]
            Recent conversation turns, each dict with keys:
            ``"speaker"`` (str) and ``"text"`` (str).
        customer_profile : str
            Optional customer profile summary for context-aware coaching.

        Returns
        -------
        str
            The formatted prompt ready to send to the LLM.
        """
        template = self.ACTION_PROMPTS.get(trigger.action)
        if template is None:
            logger.warning("No prompt template for action '%s'", trigger.action)
            template = self.ACTION_PROMPTS["coach_tip"]

        # Format transcript
        transcript_str = self._format_transcript(recent_transcript) if recent_transcript else "（暂无对话记录）"

        # Format customer profile section
        profile_section = ""
        if customer_profile:
            profile_section = f"【客户画像】\n{customer_profile}\n\n"

        # Build context variables from trigger
        ctx_vars = {
            "transcript": transcript_str,
            "matched_text": trigger.matched_text or "（无具体文本）",
            "customer_profile": profile_section,
        }

        # Inject extra context from trigger (silence_duration, speaker_count, etc.)
        for key, value in trigger.context.items():
            if key not in ctx_vars and key != "matched_text" and key != "condition":
                ctx_vars[key] = str(value)

        prompt = template.format(**ctx_vars)
        return prompt

    async def generate_coach_tip(
        self,
        trigger: TriggerMatch,
        recent_transcript: list[dict],
        customer_profile: str = "",
        stream: bool = True,
    ) -> str:
        """Call DeepSeek LLM and return the coaching response.

        Parameters
        ----------
        trigger : TriggerMatch
            The fired trigger.
        recent_transcript : list[dict]
            Recent conversation turns.
        customer_profile : str
            Optional customer profile summary.
        stream : bool
            If True, stream tokens from the model. If False, return the
            complete response at once.

        Returns
        -------
        str
            The full accumulated coaching response text.
        """
        prompt = self.build_prompt(trigger, recent_transcript, customer_profile)

        try:
            response = self._client.chat.completions.create(
                model=settings.llm_model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "你是一位资深的销售教练，拥有20年金融销售经验。"
                            "你的回答必须简洁（不超过4句话）、具体、可立即执行。"
                            "用中文回复，避免空洞的理论，给出一线销售人员能直接使用的建议。"
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,  # low temperature for consistent coaching
                max_tokens=512,
                stream=stream,
            )

            if stream:
                accumulated = self._collect_stream(response)
            else:
                accumulated = response.choices[0].message.content or ""

            logger.info(
                "Coach tip generated: rule=%s action=%s length=%d",
                trigger.rule_id,
                trigger.action,
                len(accumulated),
            )
            return accumulated

        except Exception:
            logger.exception(
                "DeepSeek API call failed for trigger rule=%s action=%s",
                trigger.rule_id,
                trigger.action,
            )
            return ""

    # -- internals -----------------------------------------------------------

    @staticmethod
    def _format_transcript(transcript: list[dict]) -> str:
        """Format a list of conversation turns into a readable transcript string."""
        lines: list[str] = []
        for turn in transcript[-20:]:  # keep last 20 turns to avoid prompt overflow
            speaker = turn.get("speaker", "未知")
            text = turn.get("text", "")
            if not text:
                continue
            # Map speaker IDs to friendly labels
            speaker_label = _map_speaker_label(speaker)
            lines.append(f"{speaker_label}: {text}")
        return "\n".join(lines) if lines else "（暂无对话记录）"

    @staticmethod
    def _collect_stream(response) -> str:
        """Accumulate tokens from a streaming response."""
        chunks: list[str] = []
        for chunk in response:
            if chunk.choices and chunk.choices[0].delta.content:
                chunks.append(chunk.choices[0].delta.content)
        return "".join(chunks)


def _map_speaker_label(speaker_id: str) -> str:
    """Convert speaker identifiers to human-readable labels.

    Uses the convention from OnlineSpeakerClustering:
    ``speaker_0`` is typically the salesperson, others are clients/participants.
    """
    mapping = {
        "speaker_0": "销售",
        "speaker_1": "客户",
        "speaker_2": "参与方2",
        "speaker_3": "参与方3",
    }
    return mapping.get(speaker_id, speaker_id)
