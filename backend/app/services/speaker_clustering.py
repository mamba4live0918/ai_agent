"""
Online speaker diarization for real-time audio streams.

Provides speaker embedding extraction (via FunASR cam++), incremental
clustering for 2-4 speakers, and overlap detection for VAD segments.

All classes are designed to work with raw PCM 16-bit mono audio bytes, following
the same conventions as realtime_asr.py.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Speaker Embedder — FunASR cam++ (7.2M params, 192-dim)
# ---------------------------------------------------------------------------

_campp_model = None


def _get_campp():
    global _campp_model
    if _campp_model is None:
        from funasr import AutoModel

        _campp_model = AutoModel(model="cam++", disable_update=True)
    return _campp_model


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
    """Extract speaker embeddings using FunASR cam++ model (7.2M params, 192-dim).

    Falls back to random embedding when the model cannot be loaded,
    so the pipeline never crashes.
    """

    EMBEDDING_DIM = 192  # cam++ output dimension (pyannote was 512)

    def __init__(self):
        self._model = None
        self._model_available = False
        self._load_attempted = False
        self._cache: dict[int, np.ndarray] = {}

    def _ensure_model(self) -> bool:
        if self._load_attempted:
            return self._model_available
        self._load_attempted = True

        try:
            self._model = _get_campp()
            self._model_available = True
            logger.info("SpeakerEmbedder: cam++ model loaded")
            return True
        except Exception:
            logger.warning(
                "SpeakerEmbedder: failed to load cam++. "
                "Speaker embeddings will be random.",
                exc_info=True,
            )
            return False

    def extract_embedding(self, audio_bytes: bytes, sample_rate: int) -> np.ndarray:
        """Return a ``EMBEDDING_DIM``-dim speaker embedding vector."""
        if not audio_bytes or len(audio_bytes) < sample_rate // 10:
            return np.zeros(self.EMBEDDING_DIM, dtype=np.float32)

        key = hash(audio_bytes)
        if key in self._cache:
            return self._cache[key].copy()

        embedding = self._extract_impl(audio_bytes, sample_rate)

        if len(self._cache) >= 200:
            oldest = next(iter(self._cache))
            del self._cache[oldest]
        self._cache[key] = embedding

        return embedding.copy()

    def _extract_impl(self, audio_bytes: bytes, sample_rate: int) -> np.ndarray:
        if not self._ensure_model():
            return self._random_embedding()

        try:
            import tempfile
            import wave
            import os

            tmp_fd, tmp_path = tempfile.mkstemp(suffix=".wav")
            try:
                with os.fdopen(tmp_fd, "wb") as tmp:
                    with wave.open(tmp, "wb") as wf:
                        wf.setnchannels(1)
                        wf.setsampwidth(2)
                        wf.setframerate(sample_rate)
                        wf.writeframes(audio_bytes)

                result = self._model.generate(input=tmp_path)
            finally:
                os.unlink(tmp_path)

            if isinstance(result, list) and len(result) > 0:
                r = result[0]
            elif isinstance(result, dict):
                r = result
            else:
                return self._random_embedding()

            emb = r.get("embedding", r.get("spk_embedding", None))
            if emb is not None:
                emb = np.array(emb, dtype=np.float32).flatten()
            else:
                return self._random_embedding()

            if emb.shape[0] == 0:
                return self._random_embedding()

            # L2-normalize
            norm = np.linalg.norm(emb)
            if norm > 0:
                emb = emb / norm
            return emb.astype(np.float32)

        except Exception as e:
            logger.warning("SpeakerEmbedder: extraction failed", exc_info=True)
            return self._random_embedding()

    def _random_embedding(self) -> np.ndarray:
        emb = np.random.RandomState().randn(self.EMBEDDING_DIM).astype(np.float32)
        norm = np.linalg.norm(emb)
        if norm > 0:
            emb = emb / norm
        return emb

    def clear_cache(self) -> None:
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
        (default 0.45 — was 0.35 for pyannote 512-dim; cam++ 192-dim needs higher).
    min_segment_duration_ms : int
        Minimum segment duration in ms for reliable embedding extraction.
        Segments shorter than this are assigned to the nearest existing
        speaker instead of creating a new cluster (default 800).
    """

    # Role labels assigned by speech frequency (most → least)
    ROLE_LABELS = ["销售", "客户", "其他", "其他"]

    def __init__(
        self,
        max_speakers: int = 4,
        similarity_threshold: float = 0.45,
        min_segment_duration_ms: int = 1500,
    ):
        if max_speakers < 1:
            raise ValueError("max_speakers must be >= 1")
        if not 0.0 <= similarity_threshold <= 1.0:
            raise ValueError("similarity_threshold must be in [0, 1]")

        self._max_speakers = max_speakers
        self._threshold = similarity_threshold
        self._min_segment_ms = min_segment_duration_ms
        self._embedder = SpeakerEmbedder()
        self._clusters: list[SpeakerCluster] = []
        self._next_speaker_id = 0
        self._last_speaker_id: str | None = None

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
        # Compute segment duration
        duration_ms = (len(audio_bytes) / (sample_rate * 2)) * 1000

        # Short segments produce unreliable embeddings — assign to last
        # speaker or the dominant cluster instead of creating a new one.
        if duration_ms < self._min_segment_ms and self._clusters:
            if self._last_speaker_id is not None:
                logger.debug(
                    "Short segment (%.0f ms) — reusing last speaker %s",
                    duration_ms, self._last_speaker_id,
                )
                return self._last_speaker_id
            # Fallback: assign to the cluster with the most segments
            dominant = max(self._clusters, key=lambda c: len(c.embeddings))
            logger.debug(
                "Short segment (%.0f ms) — assigned to dominant %s",
                duration_ms, dominant.speaker_id,
            )
            return dominant.speaker_id

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
            self._last_speaker_id = cluster.speaker_id
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
            self._last_speaker_id = best_cluster.speaker_id
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
            self._last_speaker_id = cluster.speaker_id
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
            self._last_speaker_id = best_cluster.speaker_id
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
        self._last_speaker_id = None
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

    def assign_speaker_roles(self) -> dict[str, str]:
        """Map speaker IDs to human-readable role names.

        Speaker 0 (the first person detected, usually the salesperson who
        initiates the recording) is labeled "销售". Speaker 1+ are labeled
        "客户". Any additional speakers get "其他".

        Returns
        -------
        dict[str, str]
            Mapping from ``speaker_id`` (e.g. ``"speaker_0"``) to role name
            (e.g. ``"销售"``).
        """
        if not self._clusters:
            return {}

        role_map: dict[str, str] = {}
        # Sort by speaker_id number for deterministic ordering
        sorted_clusters = sorted(
            self._clusters, key=lambda c: int(c.speaker_id.split("_")[1])
        )
        for i, cluster in enumerate(sorted_clusters):
            label = self.ROLE_LABELS[i] if i < len(self.ROLE_LABELS) else "其他"
            role_map[cluster.speaker_id] = label

        logger.debug("Speaker roles assigned: %s", role_map)
        return role_map

    # -- internals ------------------------------------------------------------

    @staticmethod
    def _update_centroid(cluster: SpeakerCluster, alpha: float = 0.2) -> None:
        """Update centroid via exponential moving average (EMA) for stability.

        EMA prevents a single noisy embedding from pulling the centroid away
        from the true speaker identity, reducing the chance that the same
        person is split across multiple clusters.

        Parameters
        ----------
        alpha : float
            Weight for the newest embedding (0 < alpha <= 1). Lower values
            make the centroid more conservative (default 0.2). With 0.2,
            each new segment only shifts the centroid 20% toward itself,
            so a single unusual tone/volume won't cause misclassification.
        """
        if not cluster.embeddings:
            return
        newest = cluster.embeddings[-1]
        if cluster.centroid.size == 0:
            cluster.centroid = newest.copy()
        else:
            cluster.centroid = (
                alpha * newest + (1.0 - alpha) * cluster.centroid
            ).astype(np.float32)
        # L2-normalize for consistent comparison
        norm = np.linalg.norm(cluster.centroid)
        if norm > 0:
            cluster.centroid = cluster.centroid / norm

