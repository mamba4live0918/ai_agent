"""Generate 3-speaker and 4-speaker dialogue audio for speaker diarization testing."""
import asyncio, wave, struct, subprocess
import edge_tts

# 4 distinct Chinese voices
VOICES = {
    "销售": "zh-CN-XiaoxiaoNeural",   # female, cheerful
    "客户A": "zh-CN-YunxiNeural",      # male
    "客户B": "zh-CN-XiaoyiNeural",     # female, different tone
    "客户C": "zh-CN-YunjianNeural",    # male, deeper
}

DIALOGUE_3 = [
    ("销售", "您好张先生，我是您的理财顾问小李。"),
    ("客户A", "哦你好小李，我看了一下那些理财产品，但说实话还不太放心。"),
    ("销售", "完全理解。要不我们先看看您之前基金的表现？"),
    ("客户B", "那个我觉得信托好像也不错，我朋友买的收益挺高的。"),
    ("销售", "信托门槛比较高。债券基金在流动性和风控上更适合您目前情况。"),
    ("客户A", "那这个债券基金最低投多少钱？收益率大概多少？"),
    ("销售", "起投五万元，去年年化百分之四点二，风险等级二级。"),
    ("客户B", "才四点二啊，我朋友那个信托有百分之七呢。"),
    ("销售", "收益和风险是成正比的，二级稳健型更安全。"),
]

DIALOGUE_4 = [
    ("销售", "大家好，今天我们开个家庭理财会议。"),
    ("客户A", "我主要是想给孩子的教育存一笔钱。"),
    ("客户B", "我更关心我们夫妻俩的养老问题。"),
    ("客户C", "我觉得还是先看看有没有合适的保险产品吧。"),
    ("销售", "好的，教育金、养老金、保险，三个需求我都记下了。"),
    ("客户A", "教育金的话大概需要存多少年？"),
    ("销售", "一般建议十年起步，每月定投的方式比较灵活。"),
    ("客户B", "养老金呢？我们离退休还有二十年。"),
    ("客户C", "保险的话我希望保额高一点，最好能覆盖重大疾病。"),
    ("销售", "没问题，我今天先给大家出一个初步方案框架。"),
    ("客户A", "好的谢谢小李。"),
    ("客户B", "嗯麻烦你了。"),
]

async def gen_dialogue(name: str, lines: list[tuple[str, str]], silence_ms: int = 500):
    combined = b""
    silence = struct.pack("<h", 0) * (16000 * silence_ms // 1000)  # 16kHz mono

    for speaker, text in lines:
        voice = VOICES[speaker]
        tts = edge_tts.Communicate(text, voice)
        audio = b""
        async for chunk in tts.stream():
            if chunk["type"] == "audio":
                audio += chunk["data"]
        combined += audio + silence
        print(f"  [{speaker}] ({voice}) {text[:30]}...")

    # Save 24kHz then resample
    raw = f"test_data/{name}_raw.wav"
    out = f"test_data/{name}_16k.wav"
    with wave.open(raw, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(24000)
        wf.writeframes(combined)

    subprocess.run(["ffmpeg", "-y", "-i", raw, "-ar", "16000", "-ac", "1", out], capture_output=True)
    result = subprocess.run(["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", out], capture_output=True, text=True)
    print(f"  -> {out} ({float(result.stdout.strip()):.1f}s)\n")

async def main():
    print("=== 3 speakers ===")
    await gen_dialogue("dialogue_3spk", DIALOGUE_3)
    print("=== 4 speakers ===")
    await gen_dialogue("dialogue_4spk", DIALOGUE_4)

asyncio.run(main())
