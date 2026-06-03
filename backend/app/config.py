import os
import secrets
import warnings
from pydantic import field_validator, ValidationInfo
from pydantic_settings import BaseSettings


class ServiceError(Exception):
    """Raised when an external service (LLM, Embedding, etc.) returns an unexpected response."""
    pass


def _require(key: str) -> str:
    """Return env var value. Raise immediately if unset — fail fast, not silently."""
    val = os.getenv(key)
    if not val:
        raise RuntimeError(
            f"Required environment variable '{key}' is not set. "
            f"Add it to your .env file in the backend directory."
        )
    return val


class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:postgres@localhost:5432/ai_agent"
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    llm_model: str = "deepseek-chat"
    chroma_db_dir: str = "./chroma_db"
    documents_dir: str = "./documents"
    secret_key: str = "change-me-in-production-use-a-real-random-string"
    access_token_expire_hours: int = 24

    # Jina Embedding (OpenAI-compatible)
    jina_api_key: str = ""
    jina_base_url: str = "https://api.jina.ai/v1"
    embed_model: str = "jina-embeddings-v3"
    audio_upload_dir: str = "./audio_uploads"
    # Legacy — kept for rollback
    huggingface_token: str = ""
    asr_model_size: str = "large-v3-turbo"  # deprecated: replaced by FunASR paraformer-zh
    # FunASR feature flag (set to "false" to rollback to legacy whisper+pyannote)
    use_funasr: bool = True

    model_config = {"env_file": "../.env", "extra": "ignore"}

    @field_validator("deepseek_api_key", "jina_api_key")
    @classmethod
    def check_required(cls, v: str, info: ValidationInfo) -> str:
        if not v:
            return _require(info.field_name.upper())
        return v


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
