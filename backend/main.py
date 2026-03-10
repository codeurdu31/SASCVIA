"""
Point d'entrée de l'API FastAPI — ProjetSASIA Backend.
Lance avec : uvicorn main:app --reload
"""
import os
from dotenv import load_dotenv

# DOIT être appelé avant tout import local qui lit os.environ au niveau module
load_dotenv(override=True)  # override=True : le .env prime sur les variables système

# Vérification au démarrage — affiche si les clés sont bien chargées (sans les révéler)
_api_key = os.getenv("ANTHROPIC_API_KEY", "")
if not _api_key or _api_key.startswith("sk-ant-..."):
    print("⚠️  ANTHROPIC_API_KEY manquante ou placeholder dans .env !")
else:
    print(f"✅ ANTHROPIC_API_KEY chargée ({_api_key[:18]}...)")

# Vérification Hunter.io — test réel via l'endpoint /account
import httpx as _httpx
_hunter_key = os.getenv("HUNTER_API_KEY", "")
if not _hunter_key:
    print("⚠️  HUNTER_API_KEY manquante dans .env — fallback Claude uniquement.")
else:
    try:
        _h_resp = _httpx.get(
            "https://api.hunter.io/v2/account",
            params={"api_key": _hunter_key},
            timeout=5,
        )
        if _h_resp.status_code == 200:
            _plan = _h_resp.json().get("data", {}).get("plan_name", "?")
            _searches_left = _h_resp.json().get("data", {}).get("requests", {}).get("searches", {}).get("available", "?")
            print(f"✅ HUNTER_API_KEY valide — plan : {_plan}, recherches restantes : {_searches_left} ({_hunter_key[:8]}...)")
        else:
            print(f"❌ HUNTER_API_KEY invalide (HTTP {_h_resp.status_code}) — vérifier dans .env")
    except Exception as _he:
        print(f"⚠️  Impossible de joindre Hunter.io au démarrage : {_he}")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.cv import router as cv_router
from routes.jobs import router as match_router
from routes.generate_cv import router as generate_cv_router
from routes.cover_letter import router as cover_letter_router
from routes.contacts import router as contacts_router
from routes.interview import router as interview_router
from routes.quota import router as quota_router
from routes.job_import import router as job_import_router
from routes.access import router as access_router

app = FastAPI(
    title="ProjetSASIA API",
    description="Backend IA pour aide à la candidature — CV, offres, emails.",
    version="0.1.0",
)

# CORS : autorise le frontend Next.js en développement et en production
_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enregistrement des routers
app.include_router(cv_router)
app.include_router(match_router)
app.include_router(generate_cv_router)
app.include_router(cover_letter_router)
app.include_router(contacts_router)
app.include_router(interview_router)
app.include_router(quota_router)
app.include_router(job_import_router)
app.include_router(access_router)


@app.get("/", tags=["Health"])
async def health_check() -> dict[str, str]:
    """Endpoint de vérification que l'API est vivante."""
    return {"status": "ok", "service": "ProjetSASIA API"}
