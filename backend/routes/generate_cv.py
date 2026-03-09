"""
Routes CV Generator :
  POST /generate-cv/preview      → réécrit le CV via Claude, retourne texte éditable
  POST /generate-cv/pdf-from-text → convertit le texte (édité) en PDF (pas de Claude)
  POST /generate-cv/             → flow direct : réécrit + PDF en une étape (legacy)
"""
import anthropic
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from models.schemas import CVFromTextRequest, CVGenerateRequest, CVPreviewResponse
from services.cv_generator import cv_preview_to_docx, cv_preview_to_pdf, generate_cv_preview, generate_improved_cv
from services.cv_templates import (
    AVAILABLE_TEMPLATES,
    WEASYPRINT_AVAILABLE,
    parse_preview_text_to_cv_data,
    render_template_html,
    render_template_pdf,
    suggest_template,
)

router = APIRouter(prefix="/generate-cv", tags=["CV Generator"])


def _anthropic_error_to_http(exc: Exception) -> None:
    """Convertit une erreur Anthropic en HTTPException appropriée."""
    if isinstance(exc, anthropic.AuthenticationError):
        raise HTTPException(status_code=500, detail="Clé API Anthropic invalide.")
    if isinstance(exc, anthropic.BadRequestError):
        msg = str(exc)
        if "credit balance" in msg.lower():
            raise HTTPException(status_code=402, detail="Solde Anthropic insuffisant.")
        raise HTTPException(status_code=400, detail=f"Erreur Anthropic : {msg}")
    if isinstance(exc, anthropic.APIError):
        raise HTTPException(status_code=502, detail=f"Erreur API Anthropic : {exc}")


@router.post("/preview", response_model=CVPreviewResponse)
async def preview_cv(body: CVGenerateRequest) -> CVPreviewResponse:
    """
    Étape 1 du flow éditable : Claude réécrit le CV et retourne un texte lisible.
    L'utilisateur peut modifier ce texte avant de demander le PDF.
    """
    try:
        text, change_pct = await generate_cv_preview(
            cv_text=body.cv_text,
            improvements=body.improvements,
            suggested_project=body.suggested_project,
            language=body.language,
        )
    except (anthropic.AuthenticationError, anthropic.BadRequestError, anthropic.APIError) as exc:
        _anthropic_error_to_http(exc)
        raise
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return CVPreviewResponse(preview_text=text, change_percentage=change_pct)


@router.post("/pdf-from-text")
async def pdf_from_text(body: CVFromTextRequest) -> Response:
    """
    Étape 2 du flow éditable : convertit le texte du CV (modifié ou non) en PDF.
    Aucun appel Claude — traitement local uniquement (fpdf2).
    """
    try:
        pdf_bytes = cv_preview_to_pdf(body.content)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erreur génération PDF : {exc}") from exc

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="cv_ameliore.pdf"'},
    )


@router.post("/docx-from-text")
async def docx_from_text(body: CVFromTextRequest) -> Response:
    """
    Convertit le texte du CV (modifié ou non) en fichier .docx téléchargeable.
    Aucun appel Claude — traitement local (python-docx).
    """
    try:
        docx_bytes = cv_preview_to_docx(body.content)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erreur génération DOCX : {exc}") from exc

    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": 'attachment; filename="cv_ameliore.docx"'},
    )


@router.get("/templates")
async def list_templates() -> dict:
    """Liste les templates CV disponibles."""
    return {
        "available": WEASYPRINT_AVAILABLE,
        "templates": AVAILABLE_TEMPLATES,
    }


@router.get("/templates/suggest")
async def suggest(job_title: str = "", job_content: str = "") -> dict:
    """Suggere un template en fonction du poste."""
    template_id = suggest_template(job_title, job_content)
    return {"suggested": template_id}


@router.post("/html-from-template")
async def html_from_template(body: CVFromTextRequest, template: str = "general") -> Response:
    """Retourne le HTML rendu du template (preview sans WeasyPrint)."""
    try:
        cv_data = parse_preview_text_to_cv_data(body.content)
        html = render_template_html(cv_data, template)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erreur generation HTML template : {exc}") from exc

    return Response(content=html, media_type="text/html")


@router.post("/pdf-from-template")
async def pdf_from_template(body: CVFromTextRequest, template: str = "general") -> Response:
    """
    Genere un PDF avec un template design (WeasyPrint).
    Le body.content est le meme texte preview que pour pdf-from-text.
    Le query param 'template' choisit le design (finance, tech, creative, general).
    """
    if not WEASYPRINT_AVAILABLE:
        raise HTTPException(
            status_code=501,
            detail="WeasyPrint non installe sur ce serveur. Utilise le PDF classique.",
        )

    try:
        cv_data = parse_preview_text_to_cv_data(body.content)
        pdf_bytes = render_template_pdf(cv_data, template)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erreur generation PDF template : {exc}") from exc

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="cv_{template}.pdf"'},
    )


@router.post("/")
async def generate_cv(body: CVGenerateRequest) -> Response:
    """
    Flow direct (sans étape d'édition) : réécrit le CV et retourne le PDF immédiatement.
    """
    try:
        pdf_bytes = await generate_improved_cv(
            cv_text=body.cv_text,
            job_title=body.job_title,
            improvements=body.improvements,
            suggested_project=body.suggested_project,
            language=body.language,
        )
    except (anthropic.AuthenticationError, anthropic.BadRequestError, anthropic.APIError) as exc:
        _anthropic_error_to_http(exc)
        raise
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="cv_ameliore.pdf"'},
    )
