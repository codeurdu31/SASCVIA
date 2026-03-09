"""
Service de quotas — limite le nombre d'utilisations par email et par mois.
Stockage en mémoire (reset au redémarrage) + fichier JSON pour persistance légère.
"""
import json
import os
from datetime import datetime

_QUOTA_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "quotas.json")
_MAX_USES_PER_MONTH = 10

# Emails admin exemptés de quota
_ADMIN_EMAILS: set[str] = {
    "simonskydu31@gmail.com",
}

# Structure : {"2026-03": {"user@example.com": 5, ...}}
_usage: dict[str, dict[str, int]] = {}


def _current_month() -> str:
    """Retourne le mois courant au format 'YYYY-MM'."""
    return datetime.now().strftime("%Y-%m")


def _load() -> None:
    """Charge les quotas depuis le fichier JSON si disponible."""
    global _usage
    if _usage:
        return  # Deja charge
    try:
        if os.path.exists(_QUOTA_FILE):
            with open(_QUOTA_FILE, "r") as f:
                _usage = json.load(f)
    except (json.JSONDecodeError, OSError):
        _usage = {}


def _save() -> None:
    """Persiste les quotas dans un fichier JSON."""
    try:
        os.makedirs(os.path.dirname(_QUOTA_FILE), exist_ok=True)
        with open(_QUOTA_FILE, "w") as f:
            json.dump(_usage, f, indent=2)
    except OSError:
        pass  # Pas critique — les quotas restent en memoire


def check_quota(user_email: str | None) -> tuple[bool, int]:
    """
    Verifie si l'utilisateur peut encore utiliser le service.

    Returns:
        (allowed, remaining) — True si autorise, nombre d'utilisations restantes.
    """
    if not user_email:
        return True, _MAX_USES_PER_MONTH  # Pas d'email = pas de quota (dev/test)

    if user_email.lower() in _ADMIN_EMAILS:
        return True, 9999  # Admin : quota illimite

    _load()
    month = _current_month()
    month_usage = _usage.get(month, {})
    count = month_usage.get(user_email, 0)
    remaining = max(0, _MAX_USES_PER_MONTH - count)
    return count < _MAX_USES_PER_MONTH, remaining


def increment_usage(user_email: str | None) -> int:
    """
    Incremente le compteur d'utilisation pour cet email ce mois-ci.

    Returns:
        Nombre d'utilisations restantes apres increment.
    """
    if not user_email:
        return _MAX_USES_PER_MONTH

    if user_email.lower() in _ADMIN_EMAILS:
        return 9999

    _load()
    month = _current_month()
    if month not in _usage:
        _usage[month] = {}
    _usage[month][user_email] = _usage[month].get(user_email, 0) + 1
    _save()

    remaining = max(0, _MAX_USES_PER_MONTH - _usage[month][user_email])
    print(f"[quota] {user_email} — {_usage[month][user_email]}/{_MAX_USES_PER_MONTH} ce mois ({remaining} restantes)")
    return remaining


def get_usage_info(user_email: str | None) -> dict:
    """Retourne les infos de quota pour affichage."""
    if not user_email:
        return {"used": 0, "limit": _MAX_USES_PER_MONTH, "remaining": _MAX_USES_PER_MONTH}

    if user_email.lower() in _ADMIN_EMAILS:
        return {"used": 0, "limit": 9999, "remaining": 9999}

    _load()
    month = _current_month()
    used = _usage.get(month, {}).get(user_email, 0)
    return {
        "used": used,
        "limit": _MAX_USES_PER_MONTH,
        "remaining": max(0, _MAX_USES_PER_MONTH - used),
    }
