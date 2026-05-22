"""Re-index all documents in ChromaDB with user_id metadata.

Run this after the user_id security migration to ensure all existing
chunks have the user_id field needed for retrieval filtering.
Requires backend to be stopped (ChromaDB file lock).
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.knowledge import Document
from app.services.embedding_service import reset_chroma, index_document

db = SessionLocal()
try:
    docs = db.query(Document).all()
    reset_chroma()
    print(f"Re-indexing {len(docs)} documents...")
    for doc in docs:
        if os.path.exists(doc.file_path):
            uid = str(doc.user_id) if doc.user_id else None
            count = index_document(doc.file_path, user_id=uid)
            print(f"  OK  {doc.title}: {count} chunks (user_id={uid})")
        else:
            print(f"  SKIP {doc.title}: file not found at {doc.file_path}")
    print("Done.")
finally:
    db.close()
