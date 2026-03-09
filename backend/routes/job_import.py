"""
Route d'importation d'offre d'emploi depuis une URL.
Supporte LinkedIn, Indeed, Welcome to the Jungle, et les pages generiques.
"""
from fastapi import APIRouter, HTTPException

from models.schemas import JobImportRequest, JobImportResponse
from services.job_scraper import scrape_job_url

router = APIRouter(prefix="/import-job", tags=["Import offre"])


@router.post("/", response_model=JobImportResponse)
async def import_job_from_url(body: JobImportRequest) -> JobImportResponse:
    """Extrait le texte d'une offre d'emploi depuis une URL."""
    try:
        result = await scrape_job_url(body.url)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return JobImportResponse(text=result["text"], source=result["source"])
