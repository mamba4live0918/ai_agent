"""E2E verification for FunASR migration."""
import time
import sys
sys.path.insert(0, ".")

print("=== Import check ===")
from app.services.post_sales_service import transcribe_audio
from app.services.realtime_asr import StreamingTranscriber, VADProcessor, ASRProcessor, VADSegment, ASRSegment
from app.services.speaker_clustering import SpeakerEmbedder, OnlineSpeakerClustering
print("All imports OK")

print("\n=== Post-sales transcription ===")
t0 = time.perf_counter()
segs = transcribe_audio("test_data/sales_dialogue_16k.wav")
t = time.perf_counter() - t0
print(f"Segments: {len(segs)} | Time: {t:.1f}s | RTF: {t/64.5:.3f}")
for s in segs[:3]:
    print(f"  [{s['speaker']}] {s['start']:.1f}s: {s['text'][:60]}")

print("\n=== Speaker embedding ===")
e = SpeakerEmbedder()
emb = e.extract_embedding(b"\x00" * 32000, 16000)
print(f"Embedding dim: {emb.shape[0]}, norm: {sum(emb**2):.3f}")

print("\n=== VAD processor ===")
vad = VADProcessor(sample_rate=16000)
print("VAD processor created OK")

print("\n[PASS] E2E verification completed")
