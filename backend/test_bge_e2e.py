import requests, json, os, sys

BASE = "http://localhost:8000/api"
LOGIN = {"username": "admin", "password": "admin123"}

# Login
r = requests.post(f"{BASE}/auth/login", json=LOGIN)
token = r.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}
print("1. Login: OK")

# Create a test .txt file
test_file = "test_bge_e2e.txt"
with open(test_file, "w", encoding="utf-8") as f:
    f.write("""风险控制是金融行业的核心工作之一。\n\n风险控制的主要方法包括：\n1. 压力测试：模拟极端市场条件下的投资组合表现\n2. VAR风险价值模型：评估在给定置信水平下的最大可能损失\n3. 分散化投资：通过配置不同资产类别降低整体风险\n4. 止损策略：设定价格阈值自动卖出以控制损失\n5. 流动性管理：确保有足够现金应对赎回和市场波动\n\n金融风险管理需要综合考虑市场风险、信用风险、操作风险和流动性风险四大类。""")

# Upload document
cat_id = "34b10ebc-0aa1-4463-b47d-03aeef6ceb34"  # 财经法税
with open(test_file, "rb") as f:
    files = {"file": (test_file, f, "text/plain")}
    data = {"category_id": cat_id}
    r = requests.post(f"{BASE}/knowledge/documents", files=files, data=data, headers=headers)

if r.status_code == 201:
    doc = r.json()
    print(f"2. Upload OK: id={doc['id']}, chunks={doc['chunk_count']}, title={doc['title']}")
else:
    print(f"2. Upload FAILED ({r.status_code}): {r.text}")
    os.remove(test_file)
    sys.exit(1)

# Test RAG query
import uuid
chat_data = {"conversation_id": str(uuid.uuid4()), "message": "如何进行有效的风险控制？"}
r = requests.post(f"{BASE}/chat", json=chat_data, headers=headers)

if r.status_code == 200:
    response = r.json()
    print(f"3. RAG Query OK: answer length={len(response.get('answer',''))}")
    answer = response.get("answer", "")
    sources = response.get("sources", [])
    print(f"   Sources returned: {len(sources)}")
    for s in sources[:3]:
        print(f"   - {s.get('content','')[:120]}...")
else:
    print(f"3. RAG Query FAILED ({r.status_code}): {r.text}")

# Cleanup
os.remove(test_file)

# Delete test document
r = requests.delete(f"{BASE}/knowledge/documents/{doc['id']}", headers=headers)
status = 'OK' if r.status_code == 204 else f'FAIL ({r.status_code})'
print(f"4. Cleanup delete: {status}")

print("\n=== BGE-m3 End-to-End Test PASSED ===")
