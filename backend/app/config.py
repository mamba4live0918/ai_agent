from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:postgres@localhost:5432/ai_agent"
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    llm_model: str = "deepseek-reasoner"
    chroma_db_dir: str = "./chroma_db"
    documents_dir: str = "./documents"
    secret_key: str = "change-me-in-production-use-a-real-random-string"
    access_token_expire_hours: int = 24

    # Jina Embedding (OpenAI-compatible)
    jina_api_key: str = ""
    jina_base_url: str = "https://api.jina.ai/v1"
    embed_model: str = "jina-embeddings-v3"

    model_config = {"env_file": "../.env", "extra": "ignore"}


settings = Settings()
