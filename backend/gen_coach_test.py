"""Generate 2-speaker dialogue with coach trigger phrases for E2E testing."""
import asyncio, wave, struct, subprocess, sys
import edge_tts

VOICES = {
    "销售": "zh-CN-XiaoxiaoNeural",   # female, cheerful
    "客户": "zh-CN-YunxiNeural",      # male
}

# Dialogue designed to trigger multiple coach rules:
# - hesitation: "嗯...这个..."
# - price_objection: "太贵了"
# - competitor_mention: "别的公司"
# - objection: "算了，不考虑了"
# - commitment_signal: "可以试试...先买"
DIALOGUE = [
    ("销售", "您好王先生，我是您的理财顾问小李，今天想跟您聊聊资产配置的事。"),
    ("客户", "哦你好小李，我确实想了解一下，但是不太懂这些。"),
    ("销售", "没关系，我先简单介绍一下我们这边的产品体系。"),
    ("客户", "嗯...这个产品太贵了吧，我朋友在别的公司买好像便宜很多。"),
    ("销售", "我理解您对价格的关注，我们的产品虽然在费率上没有特别优势，但是在风控和售后方面是有保障的。"),
    ("客户", "可是别家公司我看收益率更高啊，你们这个优势在哪里呢。"),
    ("销售", "收益和风险是成正比的，我们主打稳健型产品，历史回撤控制在百分之二以内。"),
    ("客户", "嗯...让我再想想，毕竟不是小数目。"),
    ("销售", "完全理解，要不我们先从小额定投开始试试？几千块就可以起步。"),
    ("客户", "可以试试，先买一点点看看效果。"),
    ("销售", "好的，那我现在就帮您开通定投账户，每月最低一千元。"),
    ("客户", "算了算了，我再考虑考虑吧，今天先不办了。"),
    ("销售", "没关系王先生，您有疑问随时找我，我把刚才聊的产品资料发您看看。"),
]

async def gen_dialogue(output_path: str = "test_data/coach_dialogue_16k.wav"):
    combined = b""
    silence = struct.pack("<h", 0) * (16000 * 600 // 1000)  # 600ms silence between turns

    for speaker, text in DIALOGUE:
        voice = VOICES[speaker]
        tts = edge_tts.Communicate(text, voice)
        audio = b""
        async for chunk in tts.stream():
            if chunk["type"] == "audio":
                audio += chunk["data"]
        combined += audio + silence
        print(f"  [{speaker}] {text[:40]}...")

    # Save 24kHz raw then resample to 16kHz
    raw_path = "test_data/coach_dialogue_raw.wav"
    with wave.open(raw_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(24000)
        wf.writeframes(combined)

    subprocess.run(
        ["ffmpeg", "-y", "-i", raw_path, "-ar", "16000", "-ac", "1", output_path],
        capture_output=True,
    )
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", output_path],
        capture_output=True, text=True,
    )
    duration = float(result.stdout.strip())
    print(f"\nSaved: {output_path} ({duration:.1f}s)")
    return output_path


async def main():
    print("=== Generating coach trigger test dialogue ===\n")
    await gen_dialogue()
    print("\nTrigger phrases included:")
    print("  - hesitation: '嗯...这个...'")
    print("  - price_objection: '太贵了'")
    print("  - competitor_mention: '别的公司'")
    print("  - objection: '算了，不考虑了' / '再考虑考虑'")
    print("  - commitment_signal: '可以试试...先买'")

if __name__ == "__main__":
    asyncio.run(main())
