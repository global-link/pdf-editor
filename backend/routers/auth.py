"""Auth routes – returns current user identity from JWT claims."""

from fastapi import APIRouter

from middleware.auth import CurrentUser

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/me")
async def me(user: CurrentUser) -> dict:
    """Return the authenticated user's identity derived from JWT claims."""
    return {
        "id": user.get("sub"),
        "email": user.get("email"),
    }
