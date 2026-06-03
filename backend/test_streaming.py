"""Test realtime streaming pipeline with TTS-generated 2-speaker dialogue."""
import time, wave, sys
sys.path.insert(0, ".")

from app.services.realtime_asr import StreamingTranscriber

AUDIO = "test_data/dialogue_2spk_16k.wav"

print("=== Loading audio ===")
with wave.open(AUDIO, "rb") as wf:
    sr = wf.getframerate()
    assert sr == 16000 and wf.getnchannels() == 1
    audio = wf.readframes(wf.getnframes())
    duration = len(audio) / (sr * 2)
print(f"Duration: {duration:.1f}s | Sample rate: {sr}Hz | Size: {len(audio)} bytes")

print("\n=== StreamingTranscriber (FunASR fsmn-vad + paraformer-zh + cam++) ===")
tc = StreamingTranscriber(
    sample_rate=16000,
    min_speech_duration_ms=1000,  # shorter than TTS lines but filters noise
    max_speech_duration_s=12.0,
    enable_speaker_clustering=True,
)

t0 = time.perf_counter()
chunk_size = 3200  # 100ms chunks at 16kHz
all_segments = []
for i in range(0, len(audio), chunk_size):
    chunk = audio[i:i+chunk_size]
    if len(chunk) < chunk_size:
        break
    try:
        segs = tc.feed_chunk(chunk)
        all_segments.extend(segs)
    except Exception as e:
        print(f"  [chunk {i//chunk_size}] Error: {e}")

total_time = time.perf_counter() - t0
tc.reset()

print(f"\nTotal: {len(all_segments)} segments in {total_time:.1f}s (RTF {total_time/duration:.3f})")
speakers = tc.get_speaker_names()
print(f"Speakers detected: {speakers}")

if all_segments:
    print("\n--- Transcript ---")
    for seg in all_segments[:20]:
        spk = seg.speaker
        label = speakers.get(spk, spk)
        print(f"  [{label}] {seg.start:.1f}s-{seg.end:.1f}s: {seg.text}")
else:
    print("\n[WARN] No segments detected. VAD may need larger buffers.")
    print("(This is expected if the TTS audio has no silent gaps — fsmn-vad needs pauses to split)")
