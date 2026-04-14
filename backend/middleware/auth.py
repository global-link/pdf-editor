"""Provider-agnostic JWT verification (supports HS256 and RS256/JWKS)."""

import time
from typing import Annotated

import httpx
import jwt as pyjwt
from fastapi import Depends, Header, HTTPException

from config import settings

# ── JWKS cache (RS256 path) ────────────────────────────────────────────────────

_jwks_cache: dict = {"data": None, "fetched_at": 0.0}
_CACHE_TTL = 3600  # seconds


async def _get_jwks() -> dict:
    now = time.monotonic()
    if _jwks_cache["data"] is not None and now - _jwks_cache["fetched_at"] < _CACHE_TTL:
        return _jwks_cache["data"]
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(settings.oidc_jwks_uri)
        resp.raise_for_status()
        data = resp.json()
    _jwks_cache["data"] = data
    _jwks_cache["fetched_at"] = now
    return data


def _rs256_public_key(jwks: dict, token: str):
    """Return the RSA public key from JWKS that matches the token's kid header."""
    header = pyjwt.get_unverified_header(token)
    kid = header.get("kid")
    for key_data in jwks.get("keys", []):
        if kid is None or key_data.get("kid") == kid:
            return pyjwt.algorithms.RSAAlgorithm.from_jwk(key_data)
    raise pyjwt.exceptions.InvalidKeyError("No matching key found in JWKS")


# ── FastAPI dependency ─────────────────────────────────────────────────────────

async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization[7:]

    if not settings.oidc_secret and not settings.oidc_jwks_uri:
        raise HTTPException(
            status_code=503,
            detail="Auth not configured: set OIDC_SECRET (HS256) or OIDC_JWKS_URI (RS256) in .env",
        )

    try:
        if settings.oidc_secret:
            # HS256 path — Supabase JWT secret
            decode_kwargs: dict = {"algorithms": ["HS256"]}
            options: dict = {}
            if settings.oidc_audience:
                decode_kwargs["audience"] = settings.oidc_audience
            else:
                options["verify_aud"] = False
            if settings.oidc_issuer:
                decode_kwargs["issuer"] = settings.oidc_issuer
            payload = pyjwt.decode(token, settings.oidc_secret, options=options, **decode_kwargs)
        else:
            # RS256 JWKS path
            jwks = await _get_jwks()
            public_key = _rs256_public_key(jwks, token)
            decode_kwargs = {"algorithms": ["RS256"]}
            options = {}
            if settings.oidc_audience:
                decode_kwargs["audience"] = settings.oidc_audience
            else:
                options["verify_aud"] = False
            if settings.oidc_issuer:
                decode_kwargs["issuer"] = settings.oidc_issuer
            payload = pyjwt.decode(token, public_key, options=options, **decode_kwargs)

    except pyjwt.exceptions.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except pyjwt.exceptions.PyJWTError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}")

    return payload


CurrentUser = Annotated[dict, Depends(get_current_user)]
