"""Generate 2-speaker dialogue with silent gaps for VAD testing."""
import asyncio, wave, struct, subprocess
import edge_tts

LINES = [
    ("zh-CN-XiaoxiaoNeural", "您好张先生，我是您的理财顾问小李。"),
    ("zh-CN-YunxiNeural", "哦你好小李，我看了一下那些理财产品，但是说实话还不太放心。"),
    ("zh-CN-XiaoxiaoNeural", "完全理解。很多客户一开始也有同样的顾虑。要不我们先看看您之前基金的表现？"),
    ("zh-CN-YunxiNeural", "嗯好吧。不过我听说朋友买的信托产品收益还不错。"),
    ("zh-CN-XiaoxiaoNeural", "信托确实是一种选择，但门槛高。我们债券基金在流动性和风控上更适合您。"),
    ("zh-CN-YunxiNeural", "那这个债券基金最低投多少钱？收益率大概多少？"),
    ("zh-CN-XiaoxiaoNeural", "起投五万元，去年年化收益率百分之四点二，风险等级二级稳健型。"),
]

async def main():
    print("Generating 2-speaker dialogue with pauses...")
    combined = b""
    silence = struct.pack("<h", 0) * 8000  # 0.5s silence at 16kHz

    for voice, text in LINES:
        tts = edge_tts.Communicate(text, voice)
        audio = b""
        async for chunk in tts.stream():
            if chunk["type"] == "audio":
                audio += chunk["data"]
        combined += audio + silence
        speaker = "销售" if "Xiaoxiao" in voice else "客户"
        print(f"  [{speaker}] {text[:30]}... ({len(audio)} bytes)")

    out = "test_data/dialogue_2spk.wav"
    with wave.open(out, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(24000)
        wf.writeframes(combined)

    # Resample to 16kHz
    subprocess.run([
        "ffmpeg", "-y", "-i", out,
        "-ar", "16000", "-ac", "1", "test_data/dialogue_2spk_16k.wav",
    ], capture_output=True)

    result = subprocess.run([
        "ffprobe", "-v", "quiet", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        "test_data/dialogue_2spk_16k.wav",
    ], capture_output=True, text=True)
    print(f"\nSaved: test_data/dialogue_2spk_16k.wav ({float(result.stdout.strip()):.1f}s)")

asyncio.run(main())
