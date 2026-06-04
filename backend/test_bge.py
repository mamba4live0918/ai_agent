"""Test BGE-small-zh embedding model."""
import time, numpy as np
from sentence_transformers import SentenceTransformer

print("Loading BAAI/bge-small-zh-v1.5...")
t0 = time.time()
model = SentenceTransformer("BAAI/bge-small-zh-v1.5")
print(f"Loaded in {time.time()-t0:.1f}s")

texts = ["今天天气真好", "我想买一个理财产品", "风险控制是关键"]
t0 = time.time()
embeddings = model.encode(texts, normalize_embeddings=True)
print(f"Embedded {len(texts)} texts in {time.time()-t0:.3f}s")
print(f"Dimension: {embeddings.shape[1]}")

sim = np.dot(embeddings[0], embeddings[1])
print(f"Sim('{texts[0]}', '{texts[1]}'): {sim:.4f}")
sim = np.dot(embeddings[1], embeddings[2])
print(f"Sim('{texts[1]}', '{texts[2]}'): {sim:.4f}")
print("\nOK - BGE model works!")
