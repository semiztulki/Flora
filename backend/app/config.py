from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///./flora.db"
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7
    max_attachment_bytes: int = 8 * 1024 * 1024
    attachment_retention_days: int = 30
    upload_dir: str = "./uploads"
    # Comma-separated UINs granted admin/moderator powers (ban, etc). Look up
    # your own UIN after registering (it's on your profile). Membership is
    # re-synced to User.is_admin on every authenticated request, so editing
    # this and restarting the server is enough — no migration.
    admin_uins: str = ""

    @property
    def admin_uin_set(self) -> set[int]:
        return {int(u.strip()) for u in self.admin_uins.split(",") if u.strip()}

    class Config:
        env_file = ".env"


settings = Settings()
