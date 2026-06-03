"""Test 3-speaker and 4-speaker diarization with cam++."""
import time, wave, sys
sys.path.insert(0, ".")
from app.services.realtime_asr import StreamingTranscriber

def test_diarization(audio_path: str, expected_speakers: int):
    print(f"\n{'='*60}")
    print(f"Testing: {audio_path} (expected >= {expected_speakers} speakers)")
    print(f"{'='*60}")

    with wave.open(audio_path, "rb") as wf:
        sr = wf.getframerate()
        audio = wf.readframes(wf.getnframes())
        duration = len(audio) / (sr * 2)

    tc = StreamingTranscriber(
        sample_rate=16000,
        min_speech_duration_ms=1000,
        max_speech_duration_s=12.0,
        enable_speaker_clustering=True,
    )

    t0 = time.perf_counter()
    chunk_size = 3200
    all_segs = []
    for i in range(0, len(audio), chunk_size):
        chunk = audio[i:i+chunk_size]
        if len(chunk) < chunk_size:
            break
        segs = tc.feed_chunk(chunk)
        all_segs.extend(segs)

    total_time = time.perf_counter() - t0
    tc.reset()

    speakers = tc.get_speaker_names()
    spk_count = len(speakers)
    spk_set = set()
    for seg in all_segs:
        spk_set.add(seg.speaker)

    print(f"  Audio: {duration:.1f}s | Segments: {len(all_segs)} | Time: {total_time:.1f}s")
    print(f"  Unique speaker IDs in segments: {spk_set}")
    print(f"  Speaker names: {speakers}")
    print(f"  Result: {spk_count} speakers detected (target: {expected_speakers})")

    if spk_count >= expected_speakers:
        print(f"  [PASS] >= {expected_speakers} speakers detected")
    else:
        print(f"  [FAIL] only {spk_count} of {expected_speakers} speakers detected")

    # Show per-speaker segment counts
    spk_counts = {}
    for seg in all_segs:
        spk_counts[seg.speaker] = spk_counts.get(seg.speaker, 0) + 1
    for spk, count in sorted(spk_counts.items()):
        label = speakers.get(spk, spk)
        print(f"    {spk} ({label}): {count} segments")

# Test both
test_diarization("test_data/dialogue_3spk_16k.wav", 3)
test_diarization("test_data/dialogue_4spk_16k.wav", 4)
