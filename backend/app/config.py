import secrets
import warnings
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

    # Voice Processing
    voice_processor_mode: str = "local"  # "local" or "cloud"
    hf_endpoint: str = ""  # Set to "https://hf-mirror.com" if not using VPN
    hf_auth_token: str = ""  # HuggingFace token for pyannote models
    whisper_model_size: str = "large-v3"
    whisper_compute_type: str = "int8"
    whisper_device: str = "cpu"  # "cuda" or "cpu"
    speaker_label_strategy: str = "first_longest"
    audio_upload_dir: str = "./documents/audio"
    max_audio_duration_seconds: int = 3600
    max_upload_mb: int = 500

    model_config = {"env_file": "../.env", "extra": "ignore"}


settings = Settings()


def check_secret_key():
    if settings.secret_key == "change-me-in-production-use-a-real-random-string":
        warnings.warn(
            "SECURITY WARNING: JWT secret_key is using the default value. "
            "A random secret has been generated for this session. "
            "Set SECRET_KEY in your .env for production deployments.",
            RuntimeWarning,
        )
        settings.secret_key = secrets.token_urlsafe(64)
