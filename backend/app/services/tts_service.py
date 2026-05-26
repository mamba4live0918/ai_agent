"""
Text-to-Speech (TTS) synthesis service using Microsoft Edge TTS.

Provides free, natural-sounding Chinese speech synthesis via edge-tts,
which uses Microsoft Edge's built-in neural voices without requiring
API keys or cloud credentials.

Supports both batch (all bytes at once) and streaming (async generator)
synthesis modes.  The output format is MP3.

Voice reference
---------------
- ``zh-CN-XiaoxiaoNeural`` — female, warm and natural (default)
- ``zh-CN-YunxiNeural``   — male, clear and professional
- ``zh-CN-XiaoyiNeural``  — female, lively
- ``zh-CN-YunjianNeural`` — male, older / senior style

Full list: ``edge_tts.list_voices()``
"""

from __future__ import annotations

import asyncio
import base64
import logging
from typing import AsyncIterator, Optional

import edge_tts

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Pre-selected Chinese voices with good quality
VOICE = {
    "female": "zh-CN-XiaoxiaoNeural",  # default — warm female voice
    "male": "zh-CN-YunxiNeural",       # clear male voice
    "xiaoyi": "zh-CN-XiaoyiNeural",    # lively female
    "yunjian": "zh-CN-YunjianNeural",  # senior male
}

# Shorter aliases for convenience
VOICE_ALIASES = {
    "zh-CN-female": VOICE["female"],
    "zh-CN-male": VOICE["male"],
}

# ---------------------------------------------------------------------------
# TTSService
# ---------------------------------------------------------------------------


class TTSService:
    """Text-to-speech synthesis using Microsoft Edge TTS (free, no API key).

    Usage::

        tts = TTSService()

        # Batch mode — get all audio bytes
        audio: bytes = await tts.synthesize("你好，欢迎使用销售辅助平台")

        # Streaming mode — yield MP3 chunks as they arrive
        async for chunk in tts.synthesize_stream("你好"):
            play(chunk)

    Parameters
    ----------
    default_voice : str
        Edge TTS voice name to use when *voice* is omitted in calls.
        Defaults to ``zh-CN-XiaoxiaoNeural``.
    """

    def __init__(self, default_voice: str = VOICE["female"]):
        self.default_voice = default_voice

    # -- public API -----------------------------------------------------------

    async def synthesize(
        self,
        text: str,
        voice: Optional[str] = None,
    ) -> bytes:
        """Synthesize text to MP3 audio bytes.

        Parameters
        ----------
        text : str
            Chinese (or mixed) text to speak.  Edge TTS handles Chinese,
            English, and mixed-language text natively.
        voice : str, optional
            Edge TTS voice name.  Falls back to *default_voice*.

        Returns
        -------
        bytes
            MP3 audio bytes.  Returns empty ``b""`` on failure (the caller
            should check and handle gracefully).
        """
        if not text.strip():
            logger.debug("TTSService.synthesize called with empty text; returning empty bytes")
            return b""

        used_voice = voice or self.default_voice

        try:
            chunks: list[bytes] = []
            async for chunk in self.synthesize_stream(text, used_voice):
                chunks.append(chunk)
            return b"".join(chunks)
        except Exception:
            logger.exception(
                "TTS synthesis failed (voice=%s, text_len=%d)",
                used_voice, len(text),
            )
            return b""

    async def synthesize_stream(
        self,
        text: str,
        voice: Optional[str] = None,
    ) -> AsyncIterator[bytes]:
        """Stream-synthesize text to MP3 audio, yielding chunks as they arrive.

        Useful for low-latency playback — the client can start playing
        the first chunk before the full utterance has been synthesised.

        Parameters
        ----------
        text : str
            Chinese (or mixed) text to speak.
        voice : str, optional
            Edge TTS voice name.  Falls back to *default_voice*.

        Yields
        ------
        bytes
            MP3 audio chunks.  Yields nothing (empty generator) on failure.
        """
        if not text.strip():
            return

        used_voice = voice or self.default_voice

        try:
            communicate = edge_tts.Communicate(text, used_voice)
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    yield chunk["data"]
        except Exception:
            logger.exception(
                "TTS streaming synthesis failed (voice=%s, text_len=%d)",
                used_voice, len(text),
            )
            # generator exits cleanly — caller receives what was yielded so far

    async def synthesize_base64(
        self,
        text: str,
        voice: Optional[str] = None,
    ) -> str:
        """Synthesize text and return base64-encoded MP3 string.

        Convenience for embedding audio directly in JSON messages sent
        over WebSocket or HTTP responses.

        Parameters
        ----------
        text : str
            Text to speak.
        voice : str, optional
            Edge TTS voice name.

        Returns
        -------
        str
            Base64-encoded MP3 audio (RFC 4648).  Empty string on failure.
        """
        audio_bytes = await self.synthesize(text, voice)
        if audio_bytes:
            return base64.b64encode(audio_bytes).decode("ascii")
        return ""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def resolve_voice(voice: Optional[str] = None) -> str:
    """Resolve a short voice alias to a full Edge TTS voice name.

    >>> resolve_voice("zh-CN-female")
    'zh-CN-XiaoxiaoNeural'
    >>> resolve_voice("zh-CN-XiaoxiaoNeural")
    'zh-CN-XiaoxiaoNeural'
    >>> resolve_voice(None)
    'zh-CN-XiaoxiaoNeural'
    """
    if voice is None:
        return VOICE["female"]
    if voice in VOICE_ALIASES:
        return VOICE_ALIASES[voice]
    return voice


async def synthesize_tts(text: str, voice: Optional[str] = None) -> bytes:
    """Module-level convenience function for one-shot TTS.

    Equivalent to::

        svc = TTSService()
        audio = await svc.synthesize(text, voice)

    Returns empty ``b""`` on failure.
    """
    svc = TTSService()
    return await svc.synthesize(text, voice)
