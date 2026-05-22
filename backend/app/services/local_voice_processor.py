"""Local voice processor using pyannote-audio (diarization) + faster-whisper (transcription)."""

import os
import warnings
from ..config import settings

_diarization_pipeline = None
_whisper_model = None


def _load_diarization():
    global _diarization_pipeline
    if _diarization_pipeline is None:
        # Suppress symlink warnings on Windows
        warnings.filterwarnings("ignore", category=UserWarning, module="pyannote")
        from pyannote.audio import Pipeline
        _diarization_pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=settings.hf_auth_token,
        )
        if settings.whisper_device == "cuda":
            import torch
            _diarization_pipeline.to(torch.device("cuda"))
    return _diarization_pipeline


def _load_whisper():
    global _whisper_model
    if _whisper_model is None:
        from faster_whisper import WhisperModel
        _whisper_model = WhisperModel(
            settings.whisper_model_size,
            device=settings.whisper_device,
            compute_type=settings.whisper_compute_type,
        )
    return _whisper_model


def _map_speakers(segments: list[dict]) -> dict[str, str]:
    """Map SPEAKER_XX labels to 销售/客户 using heuristics.
    Strategy 'first_longest': the speaker who talks first AND more is 销售."""
    speaker_durations: dict[str, float] = {}
    first_speaker = None
    for seg in segments:
        dur = seg["end"] - seg["start"]
        speaker_durations[seg["speaker"]] = speaker_durations.get(seg["speaker"], 0) + dur
        if first_speaker is None:
            first_speaker = seg["speaker"]

    if not speaker_durations:
        return {}

    # The speaker with longest total duration (who also starts) is 销售
    longest = max(speaker_durations, key=speaker_durations.get)
    if longest == first_speaker:
        sales_speaker = longest
    else:
        # Prefer first speaker if they're within 30% of longest
        first_dur = speaker_durations.get(first_speaker, 0)
        longest_dur = speaker_durations[longest]
        if first_dur >= longest_dur * 0.7:
            sales_speaker = first_speaker
        else:
            sales_speaker = longest

    mapping = {sales_speaker: "销售"}
    for spk in speaker_durations:
        if spk != sales_speaker:
            mapping[spk] = "客户"
    return mapping


def _merge_segments(segments: list[dict]) -> list[dict]:
    """Merge consecutive segments from the same speaker."""
    if not segments:
        return []
    merged = [dict(segments[0])]
    for seg in segments[1:]:
        if seg["speaker"] == merged[-1]["speaker"]:
            merged[-1]["end"] = seg["end"]
            merged[-1]["text"] = merged[-1]["text"] + seg["text"]
        else:
            merged.append(dict(seg))
    return merged


class LocalVoiceProcessor:
    def diarize(self, audio_path: str) -> list[dict]:
        pipeline = _load_diarization()
        output = pipeline(audio_path)
        segments = []
        for turn, _, speaker in output.itertracks(yield_label=True):
            segments.append({
                "speaker": speaker,
                "start": round(turn.start, 2),
                "end": round(turn.end, 2),
            })
        return segments

    def transcribe(self, audio_path: str, diarization_segments: list[dict]) -> list[dict]:
        model = _load_whisper()
        segments_result, info = model.transcribe(audio_path, word_timestamps=True, language="zh")

        speaker_map = _map_speakers(diarization_segments)
        results = []
        for seg in segments_result:
            # Align with diarization: find dominant speaker for this time range
            speaker = self._resolve_speaker(seg.start, seg.end, diarization_segments, speaker_map)
            results.append({
                "speaker": speaker,
                "start": round(seg.start, 2),
                "end": round(seg.end, 2),
                "text": seg.text.strip(),
                "confidence": round(seg.avg_logprob, 4),
            })

        return _merge_segments(results)

    def _resolve_speaker(self, start: float, end: float, diarization: list[dict], speaker_map: dict[str, str]) -> str:
        """Find which speaker dominates the given time range."""
        overlap_by_speaker: dict[str, float] = {}
        mid = (start + end) / 2
        for d in diarization:
            d_s = d["start"]
            d_e = d["end"]
            # Overlap detection
            if d_e > start and d_s < end:
                overlap = min(end, d_e) - max(start, d_s)
                raw_speaker = d["speaker"]
                speaker = speaker_map.get(raw_speaker, "未知")
                overlap_by_speaker[speaker] = overlap_by_speaker.get(speaker, 0) + overlap
        if overlap_by_speaker:
            return max(overlap_by_speaker, key=overlap_by_speaker.get)
        return "未知"
