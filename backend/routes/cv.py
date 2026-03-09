"""
Route POST /upload-cv
Accepte un fichier PDF, extrait son texte et retourne un aperçu.
"""
from fastapi import APIRouter, UploadFile, File, HTTPException
from models.schemas import CVUploadResponse
from services.cv_parser import extract_text_from_pdf

router = APIRouter(prefix="/upload-cv", tags=["CV"])

# Taille max autorisée : 5 Mo
MAX_FILE_SIZE = 5 * 1024 * 1024


@router.post("/", response_model=CVUploadResponse)
async def upload_cv(file: UploadFile = File(...)) -> CVUploadResponse:
    """
    Reçoit un PDF, valide son type et sa taille, puis extrait le texte.
    Retourne un aperçu des 500 premiers caractères et le nombre total.
    """
    # Validation du type MIME
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(
            status_code=415,
            detail="Seuls les fichiers PDF sont acceptés.",
        )

    file_bytes = await file.read()

    # Validation de la taille
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="Fichier trop volumineux (max 5 Mo).",
        )

    try:
        text = extract_text_from_pdf(file_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return CVUploadResponse(
        filename=file.filename or "cv.pdf",
        full_text=text,
        text_preview=text[:500],
        char_count=len(text),
        success=True,
    )
