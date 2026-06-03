"""Generate Chinese sales dialogue audio using edge-tts for ASR benchmark."""
import asyncio
import subprocess
import wave
import edge_tts

LINES = [
    ("zh-CN-XiaoxiaoNeural", "您好张先生，我是您的理财顾问小李。上次我们聊到的那个资产配置方案您觉得怎么样？"),
    ("zh-CN-YunxiNeural", "哦你好小李，我看了一下，但是说实话我对这些理财产品还不太放心。之前买的基金好像也没怎么赚钱。"),
    ("zh-CN-XiaoxiaoNeural", "我完全理解您的担心。很多客户一开始也有同样的顾虑。要不我们先一起看看您之前的基金现在的表现？"),
    ("zh-CN-YunxiNeural", "嗯好吧。不过我最近听朋友说他买的那个信托产品收益还不错，你能帮我分析一下吗？"),
    ("zh-CN-XiaoxiaoNeural", "没问题。信托确实是一种选择，但门槛通常比较高。其实我们这边的债券基金在流动性和风险控制上可能更适合您目前的情况。"),
    ("zh-CN-YunxiNeural", "那这个债券基金最低要投多少钱？还有它的收益率大概是多少？"),
    ("zh-CN-XiaoxiaoNeural", "起投金额是五万元，去年的年化收益率在百分之四点二左右。风险等级是二级，属于稳健型产品。"),
]

async def main():
    print("Generating sales dialogue audio...")
    combined = b""
    for voice, text in LINES:
        tts = edge_tts.Communicate(text, voice)
        audio = b""
        async for chunk in tts.stream():
            if chunk["type"] == "audio":
                audio += chunk["data"]
        combined += audio
        speaker = "销售" if "Xiaoxiao" in voice else "客户"
        print(f"  [{speaker}] {text[:40]}...")

    # Save 24kHz WAV
    with wave.open("test_data/sales_dialogue.wav", "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(24000)
        wf.writeframes(combined)

    # Resample to 16kHz
    subprocess.run([
        "ffmpeg", "-y", "-i", "test_data/sales_dialogue.wav",
        "-ar", "16000", "-ac", "1", "test_data/sales_dialogue_16k.wav",
    ], capture_output=True)

    result = subprocess.run([
        "ffprobe", "-v", "quiet", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        "test_data/sales_dialogue_16k.wav",
    ], capture_output=True, text=True)
    duration = float(result.stdout.strip())
    print(f"\nAudio: test_data/sales_dialogue_16k.wav ({duration:.1f}s, 16kHz mono)")
    print("\n=== GROUND TRUTH ===")
    for voice, text in LINES:
        speaker = "销售" if "Xiaoxiao" in voice else "客户"
        print(f"[{speaker}] {text}")

asyncio.run(main())
