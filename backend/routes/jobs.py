"""
Route POST /analyze-match
Reçoit le texte du CV et le texte de l'offre, retourne score + améliorations.
"""
import anthropic
from fastapi import APIRouter, Header, HTTPException
from typing import Optional

from models.schemas import MatchAnalysisRequest, MatchAnalysisResponse
from services.job_analyzer import analyze_cv_match
from services.quota import check_quota, increment_usage

router = APIRouter(prefix="/analyze-match", tags=["Match"])


@router.post("/", response_model=MatchAnalysisResponse)
async def analyze_match(
    body: MatchAnalysisRequest,
    x_user_email: Optional[str] = Header(None),
) -> MatchAnalysisResponse:
    """
    Analyse la compatibilité CV ↔ offre et retourne un score + suggestions.
    """
    # Vérification quota
    allowed, remaining = check_quota(x_user_email)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Quota mensuel atteint (10 analyses/mois). Réessaie le mois prochain.",
        )

    try:
        result = await analyze_cv_match(body.cv_text, body.job_content)

    except anthropic.AuthenticationError:
        raise HTTPException(
            status_code=500,
            detail="Clé API Anthropic invalide. Vérifie ANTHROPIC_API_KEY dans ton .env.",
        )

    except anthropic.BadRequestError as exc:
        msg = str(exc)
        if "credit balance" in msg.lower():
            raise HTTPException(
                status_code=402,
                detail="Solde Anthropic insuffisant. Va sur console.anthropic.com → Plans & Billing.",
            )
        raise HTTPException(status_code=400, detail=f"Erreur Anthropic : {msg}") from exc

    except anthropic.APIError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Erreur de l'API Anthropic : {exc}",
        ) from exc

    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # Incrémenter le quota après succès
    increment_usage(x_user_email)
    return result
