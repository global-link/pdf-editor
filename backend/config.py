"""Application configuration – reads from environment variables / .env file."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class OIDCSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # ── OIDC / JWT verification ────────────────────────────────────────────────
    # For RS256 (recommended): set oidc_jwks_uri and leave oidc_secret empty.
    # For HS256 (Supabase default): set oidc_secret (JWT secret from dashboard).
    oidc_issuer: str = ""
    oidc_jwks_uri: str = ""       # e.g. https://<ref>.supabase.co/auth/v1/.well-known/jwks.json
    oidc_audience: str = "authenticated"
    oidc_secret: str = ""         # Supabase JWT secret (HS256 path)

    # ── Supabase admin (Phase 2 – user profiles) ───────────────────────────────
    supabase_url: str = ""
    supabase_service_role_key: str = ""

    # ── App ────────────────────────────────────────────────────────────────────
    cors_allowed_origins: str = "http://localhost:5173"


settings = OIDCSettings()
