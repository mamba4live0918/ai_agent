import requests, json

BASE = "http://localhost:8000/api"
t = requests.post(f"{BASE}/auth/login", json={"username":"admin","password":"admin123"}).json()["access_token"]
h = {"Authorization": f"Bearer {t}"}

r = requests.get(f"{BASE}/knowledge/documents?page_size=100", headers=h)
items = r.json()["items"]
print(f"Total documents in DB: {len(items)}")
for d in items:
    print(f"  {d['id']} | {d['title']} | chunks={d['chunk_count']} | type={d['file_type']}")
