"""Re-index all existing documents with BGE-m3 embeddings."""
import requests, json
import os, sys
sys.path.insert(0, ".")

from app.services.embedding_service import index_document, get_or_create_vectorstore

BASE = "http://localhost:8000/api"
t = requests.post(f"{BASE}/auth/login", json={"username":"admin","password":"admin123"}).json()["access_token"]
h = {"Authorization": f"Bearer {t}"}

r = requests.get(f"{BASE}/knowledge/documents?page_size=100", headers=h)
items = r.json()["items"]
print(f"Total documents in DB: {len(items)}")

for d in items:
    file_path = f"./documents/{d['title']}"
    if not os.path.exists(file_path):
        print(f"  SKIP: {d['title']} (file not found)")
        continue
    try:
        chunk_count = index_document(file_path, user_id=str(d.get("user_id") or "shared"))
        print(f"  REINDEXED: {d['title']} → {chunk_count} chunks")
    except Exception as e:
        print(f"  FAIL: {d['title']} → {e}")

# Verify
vs = get_or_create_vectorstore()
count = vs._collection.count()
print(f"\nChromaDB total vectors after reindex: {count}")
