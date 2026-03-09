"""
Routes de preparation a l'entretien — multi-etapes.
  POST /interview/overview   → evaluation + plan grandes lignes
  POST /interview/topic      → approfondir un sujet
  POST /interview/questions  → questions d'entretien
"""
import anthropic
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from models.schemas import (
    EvaluateAnswerRequest,
    EvaluateAnswerResponse,
    EvaluateBatchRequest,
    EvaluateBatchResponse,
    InterviewOverviewResponse,
    InterviewPrepRequest,
    QuestionsRequest,
    QuestionsResponse,
    TopicDetailRequest,
    TopicDetailResponse,
    TTSRequest,
)
from services.interview_prep import (
    evaluate_batch_answers,
    evaluate_single_answer,
    interview_overview,
    interview_questions,
    topic_detail,
)
from services.tts import text_to_speech

router = APIRouter(prefix="/interview", tags=["Interview Prep"])


def _handle_anthropic_error(exc: Exception) -> None:
    """Gestion centralisee des erreurs Anthropic."""
    if isinstance(exc, anthropic.AuthenticationError):
        raise HTTPException(status_code=500, detail="Cle API Anthropic invalide.")
    if isinstance(exc, anthropic.BadRequestError):
        msg = str(exc)
        if "credit balance" in msg.lower():
            raise HTTPException(status_code=402, detail="Solde Anthropic insuffisant.")
        raise HTTPException(status_code=400, detail=f"Erreur Anthropic : {msg}")
    if isinstance(exc, anthropic.APIError):
        raise HTTPException(status_code=502, detail=f"Erreur API Anthropic : {exc}")


@router.post("/overview", response_model=InterviewOverviewResponse)
async def overview(body: InterviewPrepRequest) -> InterviewOverviewResponse:
    """Etape 1 : evaluation rapide + plan de revision."""
    try:
        return await interview_overview(
            cv_text=body.cv_text,
            job_content=body.job_content,
            extra_skills=body.extra_skills,
        )
    except (anthropic.AuthenticationError, anthropic.BadRequestError, anthropic.APIError) as exc:
        _handle_anthropic_error(exc)
        raise  # unreachable mais satisfait le type checker
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/topic", response_model=TopicDetailResponse)
async def detail(body: TopicDetailRequest) -> TopicDetailResponse:
    """Etape 2 : approfondir un sujet precis."""
    try:
        return await topic_detail(
            cv_text=body.cv_text,
            job_content=body.job_content,
            topic=body.topic,
        )
    except (anthropic.AuthenticationError, anthropic.BadRequestError, anthropic.APIError) as exc:
        _handle_anthropic_error(exc)
        raise
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/questions", response_model=QuestionsResponse)
async def questions(body: QuestionsRequest) -> QuestionsResponse:
    """Etape 3 : generer les questions d'entretien."""
    try:
        return await interview_questions(
            cv_text=body.cv_text,
            job_content=body.job_content,
            extra_skills=body.extra_skills,
            total=body.total,
            distribution=body.distribution,
        )
    except (anthropic.AuthenticationError, anthropic.BadRequestError, anthropic.APIError) as exc:
        _handle_anthropic_error(exc)
        raise
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/evaluate", response_model=EvaluateAnswerResponse)
async def evaluate_answer(body: EvaluateAnswerRequest) -> EvaluateAnswerResponse:
    """Evalue une seule reponse (mode entrainement)."""
    try:
        return await evaluate_single_answer(
            answer=body.answer,
            job_title=body.job_title,
            cv_text=body.cv_text,
            job_content=body.job_content,
        )
    except (anthropic.AuthenticationError, anthropic.BadRequestError, anthropic.APIError) as exc:
        _handle_anthropic_error(exc)
        raise
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/tts")
async def tts(body: TTSRequest) -> Response:
    """Synthese vocale via OpenAI TTS-1. Retourne un fichier audio MP3."""
    try:
        audio = await text_to_speech(body.text, body.voice)
        return Response(content=audio, media_type="audio/mpeg")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Erreur TTS : {exc}") from exc


@router.post("/evaluate-batch", response_model=EvaluateBatchResponse)
async def evaluate_batch(body: EvaluateBatchRequest) -> EvaluateBatchResponse:
    """Evalue toutes les reponses (mode vrai entretien)."""
    try:
        return await evaluate_batch_answers(
            answers=body.answers,
            job_title=body.job_title,
            cv_text=body.cv_text,
            job_content=body.job_content,
        )
    except (anthropic.AuthenticationError, anthropic.BadRequestError, anthropic.APIError) as exc:
        _handle_anthropic_error(exc)
        raise
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
