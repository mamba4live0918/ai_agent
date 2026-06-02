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

import logging



logger = logging.getLogger(__name__)
