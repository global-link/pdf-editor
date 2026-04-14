"""Auth routes – user identity and profile management."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from supabase import create_client

from config import settings
from middleware.auth import CurrentUser

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _db():
    """Return a Supabase admin client. Raises 503 if not configured."""
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise HTTPException(
            status_code=503,
            detail="Profile service not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env",
        )
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


# ── Identity ───────────────────────────────────────────────────────────────────

@router.get("/me")
async def me(user: CurrentUser) -> dict:
    """Return the authenticated user's identity derived from JWT claims."""
    return {
        "id": user.get("sub"),
        "email": user.get("email"),
    }


# ── Profile ────────────────────────────────────────────────────────────────────

@router.get("/profile")
async def get_profile(user: CurrentUser) -> dict:
    """Return the current user's profile."""
    uid = user.get("sub")
    db = _db()
    result = db.table("profiles").select("*").eq("id", uid).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return result.data


class ProfileUpdate(BaseModel):
    display_name: str


@router.patch("/profile")
async def update_profile(body: ProfileUpdate, user: CurrentUser) -> dict:
    """Update the current user's display name."""
    uid = user.get("sub")
    db = _db()
    result = (
        db.table("profiles")
        .update({"display_name": body.display_name})
        .eq("id", uid)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return result.data[0]


# ── Onboarding ─────────────────────────────────────────────────────────────────

class OnboardingStepUpdate(BaseModel):
    step: int


@router.patch("/onboarding/step")
async def update_onboarding_step(body: OnboardingStepUpdate, user: CurrentUser) -> dict:
    """Persist the current onboarding wizard step (for resumability)."""
    uid = user.get("sub")
    db = _db()
    result = (
        db.table("profiles")
        .update({"onboarding_step": body.step})
        .eq("id", uid)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return result.data[0]


@router.post("/onboarding/complete")
async def complete_onboarding(user: CurrentUser) -> dict:
    """Mark onboarding as completed for the current user."""
    uid = user.get("sub")
    db = _db()
    result = (
        db.table("profiles")
        .update({"onboarding_completed": True, "onboarding_step": 4})
        .eq("id", uid)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return result.data[0]
