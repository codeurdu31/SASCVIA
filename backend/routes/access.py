"""
Routes de gestion des accès utilisateurs.
- Vérification du statut d'accès
- Demande d'accès
- Liste des demandes en attente (admin)
- Approbation / refus (admin)
"""
import os

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from services.email_notifier import (
    send_access_approved_notification,
    send_access_request_notification,
)

router = APIRouter(prefix="/access", tags=["Access Control"])

# Email admin — exempt de contrôle d'accès, toujours approuvé
_ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "simonskydu31@gmail.com").lower()

# Stockage en mémoire + fichier JSON (comme les quotas)
import json

_ACCESS_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "access.json")

# Structure : {"email": {"name": "...", "avatar_url": "...", "status": "pending|approved|denied", "role": "user|admin", "quota_limit": 20, "requested_at": "..."}}
_access_db: dict[str, dict] = {}
_loaded = False


def _load() -> None:
    """Charge les données d'accès depuis le fichier JSON."""
    global _access_db, _loaded
    if _loaded:
        return
    try:
        if os.path.exists(_ACCESS_FILE):
            with open(_ACCESS_FILE, "r", encoding="utf-8") as f:
                _access_db = json.load(f)
    except (json.JSONDecodeError, OSError):
        _access_db = {}

    # Auto-ajouter l'admin si absent
    if _ADMIN_EMAIL and _ADMIN_EMAIL not in _access_db:
        _access_db[_ADMIN_EMAIL] = {
            "name": "Admin",
            "avatar_url": "",
            "status": "approved",
            "role": "admin",
            "quota_limit": 9999,
            "requested_at": "",
        }
        _save()

    _loaded = True


def _save() -> None:
    """Persiste les données d'accès dans un fichier JSON."""
    try:
        os.makedirs(os.path.dirname(_ACCESS_FILE), exist_ok=True)
        with open(_ACCESS_FILE, "w", encoding="utf-8") as f:
            json.dump(_access_db, f, indent=2, ensure_ascii=False)
    except OSError:
        pass


def is_user_approved(email: str) -> bool:
    """Vérifie si un utilisateur a accès à l'app."""
    _load()
    if email.lower() == _ADMIN_EMAIL:
        return True
    entry = _access_db.get(email.lower())
    return entry is not None and entry.get("status") == "approved"


def get_user_quota_limit(email: str) -> int:
    """Retourne la limite de quota personnalisée pour un utilisateur."""
    _load()
    entry = _access_db.get(email.lower())
    if entry:
        return entry.get("quota_limit", 20)
    return 20


# ---------- Schémas ----------

class AccessStatusResponse(BaseModel):
    status: str  # "approved" | "pending" | "denied" | "unknown"
    role: str    # "admin" | "user"
    quota_limit: int


class AccessRequestBody(BaseModel):
    name: str
    avatar_url: str = ""


class AccessDecisionBody(BaseModel):
    email: str
    decision: str  # "approved" | "denied"
    quota_limit: int = 20


class PendingUser(BaseModel):
    email: str
    name: str
    avatar_url: str
    status: str
    role: str
    quota_limit: int
    requested_at: str


# ---------- Routes ----------

@router.get("/status")
async def get_access_status(
    x_user_email: str = Header(None, alias="X-User-Email"),
) -> AccessStatusResponse:
    """Vérifie le statut d'accès de l'utilisateur connecté."""
    if not x_user_email:
        raise HTTPException(400, "Header X-User-Email requis.")

    _load()
    email = x_user_email.lower()

    # Admin toujours approuvé
    if email == _ADMIN_EMAIL:
        return AccessStatusResponse(status="approved", role="admin", quota_limit=9999)

    entry = _access_db.get(email)
    if not entry:
        return AccessStatusResponse(status="unknown", role="user", quota_limit=0)

    return AccessStatusResponse(
        status=entry.get("status", "pending"),
        role=entry.get("role", "user"),
        quota_limit=entry.get("quota_limit", 20),
    )


@router.post("/request")
async def request_access(
    body: AccessRequestBody,
    x_user_email: str = Header(None, alias="X-User-Email"),
) -> AccessStatusResponse:
    """Enregistre une demande d'accès et notifie l'admin par email."""
    if not x_user_email:
        raise HTTPException(400, "Header X-User-Email requis.")

    _load()
    email = x_user_email.lower()

    # Admin auto-approuvé
    if email == _ADMIN_EMAIL:
        return AccessStatusResponse(status="approved", role="admin", quota_limit=9999)

    # Déjà enregistré ?
    existing = _access_db.get(email)
    if existing:
        return AccessStatusResponse(
            status=existing["status"],
            role=existing.get("role", "user"),
            quota_limit=existing.get("quota_limit", 20),
        )

    # Nouvelle demande
    from datetime import datetime
    _access_db[email] = {
        "name": body.name,
        "avatar_url": body.avatar_url,
        "status": "pending",
        "role": "user",
        "quota_limit": 20,
        "requested_at": datetime.now().isoformat(),
    }
    _save()

    # Notification email à l'admin (non bloquant si ça échoue)
    send_access_request_notification(body.name, email)

    print(f"[access] Nouvelle demande : {body.name} ({email})")
    return AccessStatusResponse(status="pending", role="user", quota_limit=20)


@router.get("/pending")
async def list_pending(
    x_user_email: str = Header(None, alias="X-User-Email"),
) -> list[PendingUser]:
    """Liste toutes les demandes (admin uniquement)."""
    if not x_user_email or x_user_email.lower() != _ADMIN_EMAIL:
        raise HTTPException(403, "Accès réservé à l'administrateur.")

    _load()
    result = []
    for email, data in _access_db.items():
        if email == _ADMIN_EMAIL:
            continue
        result.append(PendingUser(
            email=email,
            name=data.get("name", ""),
            avatar_url=data.get("avatar_url", ""),
            status=data.get("status", "pending"),
            role=data.get("role", "user"),
            quota_limit=data.get("quota_limit", 20),
            requested_at=data.get("requested_at", ""),
        ))
    # Pending d'abord, puis par date
    result.sort(key=lambda u: (0 if u.status == "pending" else 1, u.requested_at), reverse=False)
    return result


@router.post("/decide")
async def decide_access(
    body: AccessDecisionBody,
    x_user_email: str = Header(None, alias="X-User-Email"),
) -> dict:
    """Approuve ou refuse une demande d'accès (admin uniquement)."""
    if not x_user_email or x_user_email.lower() != _ADMIN_EMAIL:
        raise HTTPException(403, "Accès réservé à l'administrateur.")

    if body.decision not in ("approved", "denied"):
        raise HTTPException(400, "decision doit être 'approved' ou 'denied'.")

    _load()
    email = body.email.lower()
    entry = _access_db.get(email)
    if not entry:
        raise HTTPException(404, f"Aucune demande trouvée pour {email}.")

    from datetime import datetime
    entry["status"] = body.decision
    entry["quota_limit"] = body.quota_limit
    entry["decided_at"] = datetime.now().isoformat()
    _save()

    # Notifier l'utilisateur s'il est approuvé
    if body.decision == "approved":
        send_access_approved_notification(entry.get("name", ""), email)

    print(f"[access] {email} → {body.decision} (quota: {body.quota_limit})")
    return {"ok": True, "email": email, "status": body.decision}
