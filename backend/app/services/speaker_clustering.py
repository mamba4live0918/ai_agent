"""
Online speaker diarization for real-time audio streams.

Provides speaker embedding extraction (via pyannote/embedding), incremental
clustering for 2-4 speakers, and overlap detection for VAD segments.

All classes are designed to work with raw PCM 16-bit mono audio bytes, following
the same conventions as realtime_asr.py.
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

from ..config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helper: PCM bytes -> torch waveform
# ---------------------------------------------------------------------------


def _pcm_bytes_to_waveform(audio_bytes: bytes, sample_rate: int):
    """Convert raw PCM 16-bit mono bytes to a torch waveform tensor.

    Returns
    -------
    waveform : torch.Tensor
        Shape (1, num_samples), float32.
    sample_rate : int
        The sample rate (passed through for convenience).
    """
    import torch
    import torchaudio

    # Wrap raw PCM in a WAV container so torchaudio can load it
    buf = io.BytesIO()
    with __import__("wave").open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sample_rate)
        wf.writeframes(audio_bytes)

    buf.seek(0)
    waveform, sr = torchaudio.load(buf)
    return waveform, sr


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity between two 1-D numpy arrays."""
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


# ---------------------------------------------------------------------------
# SpeakerEmbedder
# ---------------------------------------------------------------------------


class SpeakerEmbedder:
    """Extract 512-dim speaker embeddings from audio segments.

    Uses the ``pyannote/embedding`` model via pyannote.audio.  Requires
    ``HUGGINGFACE_TOKEN`` in settings.  Falls back to a random embedding when
    the model cannot be loaded, so the pipeline never crashes.

    Embeddings are extracted once and cached via a simple per-instance dict
    keyed on a hash of the audio bytes (to avoid re-extracting identical
    segments within a session).
    """

    # pyannote/embedding output dimension
    EMBEDDING_DIM = 512

    def __init__(self):
        self._model = None
        self._model_available = False
        self._load_attempted = False
        self._cache: dict[int, np.ndarray] = {}

    def _ensure_model(self) -> bool:
        """Lazy-load the embedding model. Returns True on success."""
        if self._load_attempted:
            return self._model_available

        self._load_attempted = True

        if not settings.huggingface_token:
            logger.warning(
                "SpeakerEmbedder: HUGGINGFACE_TOKEN not set. "
                "Speaker embeddings will be random (no diarization)."
            )
            return False

        try:
            from pyannote.audio import Model

            self._model = Model.from_pretrained(
                "pyannote/embedding",
                token=settings.huggingface_token,
            )
            self._model_available = True
            logger.info("SpeakerEmbedder: pyannote/embedding model loaded")
            return True
        except Exception:
            logger.warning(
                "SpeakerEmbedder: failed to load pyannote/embedding model. "
                "Speaker embeddings will be random.",
                exc_info=True,
            )
            return False

    def extract_embedding(self, audio_bytes: bytes, sample_rate: int) -> np.ndarray:
        """Return a ``EMBEDDING_DIM``-dim speaker embedding vector.

        Parameters
        ----------
        audio_bytes : bytes
            Raw PCM 16-bit mono audio for a speech segment.
        sample_rate : int
            Sample rate of the audio bytes.

        Returns
        -------
        np.ndarray
            Shape ``(EMBEDDING_DIM,)``, float32.
        """
        if not audio_bytes or len(audio_bytes) < sample_rate // 10:
            # Too short for meaningful embedding — return zeros
            logger.debug("SpeakerEmbedder: segment too short (%d bytes)", len(audio_bytes))
            return np.zeros(self.EMBEDDING_DIM, dtype=np.float32)

        # Check cache (hash of audio bytes)
        key = hash(audio_bytes)
        if key in self._cache:
            return self._cache[key].copy()

        embedding = self._extract_impl(audio_bytes, sample_rate)

        # Cap cache size at 200 entries
        if len(self._cache) >= 200:
            # Remove oldest entry (dict insertion-ordered in Python 3.7+)
            oldest = next(iter(self._cache))
            del self._cache[oldest]
        self._cache[key] = embedding

        return embedding.copy()

    def _extract_impl(self, audio_bytes: bytes, sample_rate: int) -> np.ndarray:
        """Actual extraction logic, with fallback to random embedding."""
        if not self._ensure_model():
            return self._random_embedding()

        try:
            import torch

            waveform, sr = _pcm_bytes_to_waveform(audio_bytes, sample_rate)

            # Resample to 16 kHz if needed (pyannote/embedding expects 16 kHz)
            if sr != 16000:
                import torchaudio.functional as F

                waveform = F.resample(waveform, sr, 16000)
                sr = 16000

            with torch.no_grad():
                # pyannote.audio Model.__call__ expects (batch, samples) or
                # {'waveform': ..., 'sample_rate': ...}
                emb = self._model({"waveform": waveform, "sample_rate": sr})
                # emb is typically a (1, embedding_dim) or (embedding_dim,) tensor
                if isinstance(emb, torch.Tensor):
                    emb = emb.squeeze().detach().cpu().numpy()
                elif isinstance(emb, np.ndarray):
                    emb = emb.squeeze()
                else:
                    logger.warning("Unexpected embedding type: %s", type(emb))
                    return self._random_embedding()

                # Ensure correct shape
                if emb.ndim == 0:
                    logger.warning("Embedding is scalar, falling back to random")
                    return self._random_embedding()
                if emb.shape[-1] != self.EMBEDDING_DIM:
                    logger.warning(
                        "Unexpected embedding dim %s (expected %d), falling back to random",
                        emb.shape,
                        self.EMBEDDING_DIM,
                    )
                    return self._random_embedding()

                emb = emb.astype(np.float32)
                # L2-normalize for consistent cosine similarity
                norm = np.linalg.norm(emb)
                if norm > 0:
                    emb = emb / norm

                return emb

        except Exception:
            logger.warning(
                "SpeakerEmbedder: extraction failed, using random embedding",
                exc_info=True,
            )
            return self._random_embedding()

    def _random_embedding(self) -> np.ndarray:
        """Return a random L2-normalized embedding as fallback."""
        rng = np.random.RandomState()
        emb = rng.randn(self.EMBEDDING_DIM).astype(np.float32)
        norm = np.linalg.norm(emb)
        if norm > 0:
            emb = emb / norm
        return emb

    def clear_cache(self) -> None:
        """Clear the embedding cache."""
        self._cache.clear()


# ---------------------------------------------------------------------------
# OnlineSpeakerClustering
# ---------------------------------------------------------------------------


@dataclass
class SpeakerCluster:
    """A single speaker identity tracked during a session."""

    speaker_id: str
    embeddings: list[np.ndarray] = field(default_factory=list)
    centroid: np.ndarray = field(
        default_factory=lambda: np.zeros(0, dtype=np.float32)
    )


class OnlineSpeakerClustering:
    """Incremental speaker clustering for 2-4 speakers in a real-time stream.

    Each new speech segment gets a speaker embedding.  That embedding is
    compared via cosine similarity to the centroids of existing clusters.
    If the maximum similarity exceeds the threshold the segment is assigned
    to that speaker and the centroid is updated (moving average). Otherwise
    a new cluster is created (up to *max_speakers*).

    Parameters
    ----------
    max_speakers : int
        Maximum number of distinct speakers to track (default 4).
    similarity_threshold : float
        Cosine similarity threshold for assigning to an existing cluster
        (default 0.65).
    """

    def __init__(
        self,
        max_speakers: int = 4,
        similarity_threshold: float = 0.65,
    ):
        if max_speakers < 1:
            raise ValueError("max_speakers must be >= 1")
        if not 0.0 <= similarity_threshold <= 1.0:
            raise ValueError("similarity_threshold must be in [0, 1]")

        self._max_speakers = max_speakers
        self._threshold = similarity_threshold
        self._embedder = SpeakerEmbedder()
        self._clusters: list[SpeakerCluster] = []
        self._next_speaker_id = 0

    # -- public API -----------------------------------------------------------

    def add_segment(self, audio_bytes: bytes, sample_rate: int) -> str:
        """Process a VAD speech segment and return its ``speaker_id``.

        Parameters
        ----------
        audio_bytes : bytes
            Raw PCM 16-bit mono audio for the segment.
        sample_rate : int
            Sample rate of *audio_bytes*.

        Returns
        -------
        str
            Speaker identifier, e.g. ``"speaker_0"``, ``"speaker_1"``, etc.
        """
        # Extract embedding
        embedding = self._embedder.extract_embedding(audio_bytes, sample_rate)

        # First segment — always creates speaker_0
        if not self._clusters:
            cluster = SpeakerCluster(
                speaker_id=f"speaker_{self._next_speaker_id}",
                embeddings=[embedding],
                centroid=embedding.copy(),
            )
            self._clusters.append(cluster)
            self._next_speaker_id += 1
            logger.debug(
                "Created first cluster: %s (threshold=%.2f)",
                cluster.speaker_id,
                self._threshold,
            )
            return cluster.speaker_id

        # Compare against all existing cluster centroids
        best_sim = -1.0
        best_cluster: Optional[SpeakerCluster] = None
        for cluster in self._clusters:
            sim = _cosine_similarity(embedding, cluster.centroid)
            if sim > best_sim:
                best_sim = sim
                best_cluster = cluster

        # Assign to best match if above threshold
        if best_sim >= self._threshold and best_cluster is not None:
            best_cluster.embeddings.append(embedding)
            self._update_centroid(best_cluster)
            logger.debug(
                "Assigned segment to %s (sim=%.3f, n=%d)",
                best_cluster.speaker_id,
                best_sim,
                len(best_cluster.embeddings),
            )
            return best_cluster.speaker_id

        # Create new cluster (if under limit)
        if len(self._clusters) < self._max_speakers:
            cluster = SpeakerCluster(
                speaker_id=f"speaker_{self._next_speaker_id}",
                embeddings=[embedding],
                centroid=embedding.copy(),
            )
            self._clusters.append(cluster)
            self._next_speaker_id += 1
            logger.info(
                "Created new cluster: %s (best_sim=%.3f < threshold=%.2f, n_clusters=%d)",
                cluster.speaker_id,
                best_sim,
                self._threshold,
                len(self._clusters),
            )
            return cluster.speaker_id

        # At max speakers — assign to the closest cluster anyway
        if best_cluster is not None:
            best_cluster.embeddings.append(embedding)
            self._update_centroid(best_cluster)
            logger.debug(
                "Assigned segment to %s at max speakers (sim=%.3f, fallback)",
                best_cluster.speaker_id,
                best_sim,
            )
            return best_cluster.speaker_id

        # Should never reach here, but safety fallback
        return self._clusters[0].speaker_id

    def reset(self) -> None:
        """Clear all clusters and the embedding cache for a new session."""
        self._clusters.clear()
        self._next_speaker_id = 0
        self._embedder.clear_cache()
        logger.info("OnlineSpeakerClustering: reset")

    @property
    def speaker_count(self) -> int:
        """Current number of distinct speaker clusters."""
        return len(self._clusters)

    @property
    def speakers(self) -> list[dict]:
        """Return summary info about each cluster.

        Returns
        -------
        list[dict]
            Each dict has keys: ``speaker_id``, ``num_segments``.
        """
        return [
            {
                "speaker_id": c.speaker_id,
                "num_segments": len(c.embeddings),
            }
            for c in self._clusters
        ]

    @property
    def similarity_threshold(self) -> float:
        return self._threshold

    # -- internals ------------------------------------------------------------

    @staticmethod
    def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
        """Compute cosine similarity between two vectors."""
        return _cosine_similarity(a, b)

    @staticmethod
    def _update_centroid(cluster: SpeakerCluster) -> None:
        """Recompute the centroid as the mean of all embeddings."""
        if not cluster.embeddings:
            return
        stacked = np.stack(cluster.embeddings, axis=0)
        cluster.centroid = stacked.mean(axis=0).astype(np.float32)
        # L2-normalize for consistent comparison
        norm = np.linalg.norm(cluster.centroid)
        if norm > 0:
            cluster.centroid = cluster.centroid / norm


# ---------------------------------------------------------------------------
# OverlapDetector
# ---------------------------------------------------------------------------


@dataclass
class OverlapSegment:
    """A region where two or more speakers overlap."""

    start: float
    end: float


class OverlapDetector:
    """Detect overlapping speech regions from recent VAD segments.

    An overlap is flagged when two segments overlap by more than 50% of
    the shorter segment's duration AND the overlapping region is at least
    2 seconds long.

    Parameters
    ----------
    min_overlap_ratio : float
        Minimum overlap ratio (0-1) relative to the shorter segment's duration.
        Default 0.5 (50%).
    min_overlap_duration : float
        Minimum overlap duration in seconds. Default 2.0.
    """

    def __init__(
        self,
        min_overlap_ratio: float = 0.5,
        min_overlap_duration: float = 2.0,
    ):
        self._min_overlap_ratio = min_overlap_ratio
        self._min_overlap_duration = min_overlap_duration

    def detect(self, segments: list[dict]) -> list[OverlapSegment]:
        """Detect overlapping speech regions.

        Parameters
        ----------
        segments : list[dict]
            Each dict must have keys: ``start`` (float), ``end`` (float),
            and optionally ``speaker`` (str).  Segments with the same speaker
            are not considered as overlapping.

        Returns
        -------
        list[OverlapSegment]
            Sorted by start time, merged where adjacent overlaps touch.
        """
        if len(segments) < 2:
            return []

        # Sort by start time
        sorted_segs = sorted(segments, key=lambda s: (s["start"], s["end"]))

        overlaps: list[OverlapSegment] = []

        # Compare every pair — O(n^2) is fine for small n (VAD windows are
        # typically <20 segments in a 30 s window)
        n = len(sorted_segs)
        for i in range(n):
            si = sorted_segs[i]
            for j in range(i + 1, n):
                sj = sorted_segs[j]

                # Skip same-speaker segments
                if si.get("speaker") is not None and sj.get("speaker") is not None:
                    if si["speaker"] == sj["speaker"]:
                        continue

                # Compute overlapping region
                overlap_start = max(si["start"], sj["start"])
                overlap_end = min(si["end"], sj["end"])
                overlap_duration = overlap_end - overlap_start

                if overlap_duration <= 0:
                    continue

                # Compute overlap ratio relative to the shorter segment
                si_dur = si["end"] - si["start"]
                sj_dur = sj["end"] - sj["start"]
                shorter_dur = min(si_dur, sj_dur)

                if shorter_dur <= 0:
                    continue

                overlap_ratio = overlap_duration / shorter_dur

                if (
                    overlap_ratio >= self._min_overlap_ratio
                    and overlap_duration >= self._min_overlap_duration
                ):
                    overlaps.append(
                        OverlapSegment(start=overlap_start, end=overlap_end)
                    )

        # Merge overlapping/adjacent overlap regions
        return self._merge_overlaps(overlaps)

    @staticmethod
    def _merge_overlaps(overlaps: list[OverlapSegment]) -> list[OverlapSegment]:
        """Merge overlapping or adjacent OverlapSegments into contiguous regions."""
        if not overlaps:
            return []

        sorted_ov = sorted(overlaps, key=lambda o: o.start)
        merged: list[OverlapSegment] = [sorted_ov[0]]

        for current in sorted_ov[1:]:
            last = merged[-1]
            if current.start <= last.end:
                # Overlapping or adjacent — merge
                last.end = max(last.end, current.end)
            else:
                merged.append(current)

        return merged
