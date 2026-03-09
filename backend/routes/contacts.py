"""
Routes networking :
  POST /contacts/find          → trouve les 3 contacts pertinents (Claude + web_search)
  POST /contacts/draft-emails  → rédige les emails de networking personnalisés
"""
import anthropic
from fastapi import APIRouter, Header, HTTPException
from typing import Optional

from models.schemas import (
    DraftEmailsRequest,
    DraftEmailsResponse,
    FindContactsRequest,
    FindContactsResponse,
)
from services.contact_finder import find_relevant_contacts
from services.email_drafter import draft_contact_emails
from services.quota import check_quota, increment_usage

router = APIRouter(prefix="/contacts", tags=["Contacts & Emails"])


def _anthropic_to_http(exc: Exception) -> None:
    if isinstance(exc, anthropic.AuthenticationError):
        raise HTTPException(status_code=500, detail="Clé API Anthropic invalide.")
    if isinstance(exc, anthropic.BadRequestError):
        msg = str(exc)
        if "credit balance" in msg.lower():
            raise HTTPException(status_code=402, detail="Solde Anthropic insuffisant.")
        raise HTTPException(status_code=400, detail=f"Erreur Anthropic : {msg}")
    if isinstance(exc, anthropic.APIError):
        raise HTTPException(status_code=502, detail=f"Erreur API Anthropic : {exc}")


@router.post("/find", response_model=FindContactsResponse)
async def find_contacts(
    body: FindContactsRequest,
    x_user_email: Optional[str] = Header(None),
) -> FindContactsResponse:
    """
    Identifie les contacts les plus pertinents pour cette candidature.
    Claude effectue des recherches web (web_search) pour trouver de vraies personnes.
    Fallback : connaissance training data de Claude si web_search indisponible.
    """
    # Vérification quota
    allowed, remaining = check_quota(x_user_email)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Quota mensuel atteint (10 analyses/mois). Réessaie le mois prochain.",
        )

    try:
        result = await find_relevant_contacts(
            job_content=body.job_content,
            job_title=body.job_title,
            company=body.company,
        )
    except (anthropic.AuthenticationError, anthropic.BadRequestError, anthropic.APIError) as exc:
        _anthropic_to_http(exc)
        raise
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    increment_usage(x_user_email)
    return result


@router.post("/draft-emails", response_model=DraftEmailsResponse)
async def draft_emails(body: DraftEmailsRequest) -> DraftEmailsResponse:
    """
    Rédige 3 emails de networking courts et personnalisés, un par contact.
    """
    try:
        emails = await draft_contact_emails(
            cv_text=body.cv_text,
            job_title=body.job_title,
            company=body.company,
            contacts=body.contacts,
            language=body.language,
            job_content=body.job_content,
        )
    except (anthropic.AuthenticationError, anthropic.BadRequestError, anthropic.APIError) as exc:
        _anthropic_to_http(exc)
        raise
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return DraftEmailsResponse(emails=emails)
