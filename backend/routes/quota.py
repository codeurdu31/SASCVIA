"""
Route GET /quota — retourne les infos de quota pour l'utilisateur connecté.
"""
from fastapi import APIRouter, Header
from typing import Optional

from services.quota import get_usage_info

router = APIRouter(prefix="/quota", tags=["Quota"])


@router.get("/")
async def get_quota(x_user_email: Optional[str] = Header(None)) -> dict:
    """Retourne les infos de quota pour cet email."""
    return get_usage_info(x_user_email)
