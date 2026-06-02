import os
import re
import shutil
import gradio as gr

from openai import OpenAI

from langchain_text_splitters import RecursiveCharacterTextSplitter

from langchain_community.document_loaders import (
    PyMuPDFLoader,
    TextLoader,
    UnstructuredWordDocumentLoader,
    UnstructuredMarkdownLoader,
    UnstructuredPowerPointLoader
)

from langchain_ollama import OllamaEmbeddings
from langchain_chroma import Chroma


# =========================================================
# CONFIG
# =========================================================

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")

DOCUMENTS_DIR = "./documents"

CHROMA_DB_DIR = "./chroma_db"

EMBED_MODEL = "nomic-embed-text"

LLM_MODEL = "deepseek-reasoner"


# =========================================================
# CHECK API KEY
# =========================================================

if not DEEPSEEK_API_KEY:
    raise ValueError(
        "Please set DEEPSEEK_API_KEY environment variable."
    )


# =========================================================
# LOAD DOCUMENTS
# =========================================================

print("=" * 60)
print("LOADING DOCUMENTS")
print("=" * 60)

all_documents = []

for filename in os.listdir(DOCUMENTS_DIR):

    filepath = os.path.join(DOCUMENTS_DIR, filename)

    print(f"Loading: {filename}")

    try:

        # PDF
        if filename.endswith(".pdf"):

            loader = PyMuPDFLoader(filepath)

        # TXT
        elif filename.endswith(".txt"):

            loader = TextLoader(
                filepath,
                encoding="utf-8"
            )

        # DOCX
        elif filename.endswith(".docx"):

            loader = UnstructuredWordDocumentLoader(filepath)

        # Markdown
        elif filename.endswith(".md"):

            loader = UnstructuredMarkdownLoader(filepath)

        # PPTX
        elif filename.endswith(".pptx"):

            loader = UnstructuredPowerPointLoader(filepath)

        else:

            print(f"Skipping unsupported file: {filename}")

            continue

        docs = loader.load()

        # Add source metadata
        for doc in docs:

            doc.metadata["filename"] = filename

        all_documents.extend(docs)

        print(f"Loaded {len(docs)} pages/chunks")

    except Exception as e:

        print(f"Error loading {filename}: {e}")

print("=" * 60)
print(f"TOTAL DOCUMENTS: {len(all_documents)}")
print("=" * 60)


# =========================================================
# SPLIT DOCUMENTS
# =========================================================

print("=" * 60)
print("SPLITTING DOCUMENTS")
print("=" * 60)

text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=2000,
    chunk_overlap=400,
    separators=[
        "\n\n",
        "\n",
        ". ",
        " ",
        ""
    ]
)

chunks = text_splitter.split_documents(all_documents)

print(f"Created {len(chunks)} chunks")


# =========================================================
# EMBEDDING MODEL
# =========================================================

embedding_function = OllamaEmbeddings(
    model=EMBED_MODEL
)


# =========================================================
# RESET CHROMADB
# =========================================================

if os.path.exists(CHROMA_DB_DIR):

    shutil.rmtree(CHROMA_DB_DIR)


# =========================================================
# CREATE VECTOR DATABASE
# =========================================================

print("=" * 60)
print("CREATING VECTOR DATABASE")
print("=" * 60)

vectorstore = Chroma.from_documents(
    documents=chunks,
    embedding=embedding_function,
    persist_directory=CHROMA_DB_DIR
)

print("Vector database created")


# =========================================================
# RETRIEVER
# =========================================================

retriever = vectorstore.as_retriever(
    search_kwargs={
        "k": 8
    }
)


# =========================================================
# DEEPSEEK CLIENT
# =========================================================

client = OpenAI(
    api_key=DEEPSEEK_API_KEY,
    base_url="https://api.deepseek.com"
)


# =========================================================
# CHAT MEMORY
# =========================================================

conversation_history = []


# =========================================================
# RETRIEVE CONTEXT
# =========================================================

def retrieve_context(question):

    results = retriever.invoke(question)

    context_parts = []

    for i, doc in enumerate(results):

        filename = doc.metadata.get(
            "filename",
            "Unknown"
        )

        page = doc.metadata.get(
            "page",
            "Unknown"
        )

        content = doc.page_content

        chunk_text = f"""
[Document {i + 1}]

File:
{filename}

Page:
{page}

Content:
{content}
"""

        context_parts.append(chunk_text)

    context = "\n\n".join(context_parts)

    return context


# =========================================================
# QUERY MODEL
# =========================================================

def query_deepseek(question, context):

    history_text = ""

    for human, assistant in conversation_history[-3:]:

        history_text += f"""
User:
{human}

Assistant:
{assistant}

"""

    prompt = f"""
You are an advanced AI knowledge base assistant.

Your job is to synthesize information across
multiple documents.

Rules:
- Use only provided context
- Compare information across files
- Explain relationships
- Summarize intelligently
- Avoid hallucinations

Conversation History:
{history_text}

Question:
{question}

Retrieved Context:
{context}

Provide:
1. Direct answer
2. Detailed explanation
3. Cross-document insights
4. Important relationships
"""

    response = client.chat.completions.create(
        model=LLM_MODEL,
        messages=[
            {
                "role": "system",
                "content": """
You are an expert research assistant
with strong reasoning ability.
"""
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        temperature=0.2,
        max_tokens=15000
    )

    answer = response.choices[0].message.content

    answer = re.sub(
        r"<think>.*?</think>",
        "",
        answer,
        flags=re.DOTALL
    ).strip()

    return answer


# =========================================================
# MAIN CHAT FUNCTION
# =========================================================

def ask_question(message, history):

    if not message.strip():
        return "Please enter a question."

    context = retrieve_context(message)

    answer = query_deepseek(
        message,
        context
    )

    conversation_history.append(
        (message, answer)
    )

    return answer


# =========================================================
# GRADIO UI
# =========================================================

demo = gr.ChatInterface(
    fn=ask_question,

    title="Enterprise Knowledge Base RAG",

    description="""
Multi-Document RAG System

Supported:
- PDF
- DOCX
- TXT
- Markdown
- PPTX

Powered by:
- DeepSeek Reasoner
- ChromaDB
- Ollama Embeddings
- LangChain
""",

    textbox=gr.Textbox(
        placeholder="Ask questions across all documents...",
        lines=2
    )
)


# =========================================================
# LAUNCH
# =========================================================

demo.launch()