"""
Routes lettre de motivation :
  POST /cover-letter/generate  → génère le texte via Claude
  POST /cover-letter/pdf       → convertit le texte (édité) en PDF téléchargeable
"""
import anthropic
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from models.schemas import CoverLetterPDFRequest, CoverLetterRequest, CoverLetterResponse
from services.cover_letter import cover_letter_to_docx, cover_letter_to_pdf, generate_cover_letter

router = APIRouter(prefix="/cover-letter", tags=["Cover Letter"])


def _handle_anthropic_errors(exc: Exception) -> None:
    """Lève une HTTPException appropriée selon le type d'erreur Anthropic."""
    if isinstance(exc, anthropic.AuthenticationError):
        raise HTTPException(status_code=500, detail="Clé API Anthropic invalide.")
    if isinstance(exc, anthropic.BadRequestError):
        msg = str(exc)
        if "credit balance" in msg.lower():
            raise HTTPException(status_code=402, detail="Solde Anthropic insuffisant.")
        raise HTTPException(status_code=400, detail=f"Erreur Anthropic : {msg}")
    if isinstance(exc, anthropic.APIError):
        raise HTTPException(status_code=502, detail=f"Erreur API Anthropic : {exc}")


@router.post("/generate", response_model=CoverLetterResponse)
async def generate(body: CoverLetterRequest) -> CoverLetterResponse:
    """
    Génère une lettre de motivation personnalisée basée sur le CV et l'offre.
    Retourne le texte brut, éditable côté frontend avant export PDF.
    """
    try:
        text = await generate_cover_letter(
            cv_text=body.cv_text,
            job_content=body.job_content,
            job_title=body.job_title,
            company=body.company,
            language=body.language,
        )
    except (anthropic.AuthenticationError, anthropic.BadRequestError, anthropic.APIError) as exc:
        _handle_anthropic_errors(exc)
        raise  # satisfait le type checker
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return CoverLetterResponse(content=text)


@router.post("/pdf")
async def pdf(body: CoverLetterPDFRequest) -> Response:
    """
    Convertit le texte de la lettre (potentiellement édité) en PDF téléchargeable.
    Pas d'appel Claude ici — traitement purement local (fpdf2).
    """
    try:
        pdf_bytes = cover_letter_to_pdf(body.content)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erreur génération PDF : {exc}") from exc

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="lettre_motivation.pdf"'},
    )


@router.post("/docx")
async def docx(body: CoverLetterPDFRequest) -> Response:
    """
    Convertit le texte de la lettre en fichier .docx téléchargeable.
    Pas d'appel Claude — traitement local (python-docx).
    """
    try:
        docx_bytes = cover_letter_to_docx(body.content)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erreur génération DOCX : {exc}") from exc

    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": 'attachment; filename="lettre_motivation.docx"'},
    )
