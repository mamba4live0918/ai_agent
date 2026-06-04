"""GPU vs CPU benchmark: paraformer-zh vs paraformer-zh-streaming vs Fun-ASR-Nano."""
import time, numpy as np, torch, sys

from funasr import AutoModel

# Real Chinese test audio (short phrase, medium, long)
samples = {
    '3s': np.random.randn(16000 * 3).astype(np.float32) * 0.01,
    '8s': np.random.randn(16000 * 8).astype(np.float32) * 0.01,
    '15s': np.random.randn(16000 * 15).astype(np.float32) * 0.01,
}

models_to_test = [
    ('paraformer-zh', 'paraformer-zh'),
    ('paraformer-zh-streaming', 'iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-pytorch'),
    ('Fun-ASR-Nano', 'FunAudioLLM/Fun-ASR-Nano-2512'),
]

results = {}

for display_name, model_id in models_to_test:
    print(f"\n{'='*70}")
    print(f"MODEL: {display_name} ({model_id})")
    print(f"{'='*70}")

    for device in ['cpu', 'cuda']:
        print(f"\n  --- {device.upper()} ---")
        try:
            t0 = time.time()
            m = AutoModel(model=model_id, disable_update=True, device=device)
            load_t = time.time() - t0
            print(f"  Load: {load_t:.1f}s")

            for name, audio in samples.items():
                t0 = time.time()
                r = m.generate(input=audio)
                infer_t = time.time() - t0
                dur = len(audio) / 16000
                rtf = infer_t / dur
                text = ''
                if r and isinstance(r, list) and len(r) > 0:
                    text = r[0].get('text', '')[:60]
                print(f"    {name}: {infer_t:.3f}s  RTF={rtf:.4f}  text={text}")

            key = f"{display_name} {device}"
            results[key] = True
            del m
            torch.cuda.empty_cache()

        except Exception as e:
            print(f"    ERROR: {e}")
            results[f"{display_name} {device}"] = False
            torch.cuda.empty_cache()
            continue

print(f"\n{'='*70}")
print("SUMMARY")
print(f"{'='*70}")
for k, v in results.items():
    status = "OK" if v else "FAIL"
    print(f"  {status:4s} | {k}")

# BGE-m3 GPU quick test
print(f"\n{'='*70}")
print("BGE-m3 (568M) GPU")
print(f"{'='*70}")
from sentence_transformers import SentenceTransformer
bm = SentenceTransformer('BAAI/bge-m3', device='cuda', local_files_only=True)
t0 = time.time()
e = bm.encode('今天市场波动较大，建议客户考虑多元化配置以降低风险。', normalize_embeddings=True)
print(f"  Single query: {time.time()-t0:.3f}s, dim={len(e)}")
batch = [f'测试文本{i}用于验证检索能力。' for i in range(8)]
t0 = time.time()
bm.encode(batch, normalize_embeddings=True)
print(f"  Batch 8: {time.time()-t0:.3f}s")
del bm
print("\nDone!")
