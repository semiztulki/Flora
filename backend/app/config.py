from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///./flora.db"
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7
    max_attachment_bytes: int = 8 * 1024 * 1024
    attachment_retention_days: int = 30
    upload_dir: str = "./uploads"

    class Config:
        env_file = ".env"


settings = Settings()
