"""
Service d'extraction du texte d'une offre d'emploi depuis une URL.
Supporte LinkedIn, Indeed, Welcome to the Jungle, et les pages generiques.
"""
import re
import json
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup


# Headers navigateur pour eviter le blocage basique
_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
}

# Selecteurs CSS par plateforme
_PLATFORM_SELECTORS: dict[str, list[str]] = {
    "linkedin": [
        ".description__text",
        ".show-more-less-html__markup",
        ".decorated-job-posting__details",
        '[class*="description"]',
    ],
    "indeed": [
        "#jobDescriptionText",
        ".jobsearch-jobDescriptionText",
        '[class*="jobDescription"]',
    ],
    "welcometothejungle": [
        '[data-testid="job-section-description"]',
        ".sc-bXCLTC",
        "article",
    ],
}


def _detect_platform(url: str) -> str:
    """Detecte la plateforme a partir de l'URL."""
    host = urlparse(url).hostname or ""
    if "linkedin" in host:
        return "linkedin"
    if "indeed" in host:
        return "indeed"
    if "welcometothejungle" in host or "wttj" in host:
        return "welcometothejungle"
    return "generic"


def _extract_json_ld(soup: BeautifulSoup) -> str | None:
    """Extrait la description depuis le JSON-LD (schema.org JobPosting)."""
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
            # Peut etre une liste ou un objet unique
            items = data if isinstance(data, list) else [data]
            for item in items:
                if item.get("@type") == "JobPosting":
                    desc = item.get("description", "")
                    if desc:
                        # Le champ description contient souvent du HTML
                        desc_soup = BeautifulSoup(desc, "html.parser")
                        return desc_soup.get_text(separator="\n", strip=True)
        except (json.JSONDecodeError, AttributeError):
            continue
    return None


def _extract_meta_description(soup: BeautifulSoup) -> str | None:
    """Extrait la meta description de la page."""
    meta = soup.find("meta", attrs={"name": "description"})
    if meta and meta.get("content"):
        content = meta["content"]
        if len(content) > 100:  # Assez long pour etre utile
            return content
    return None


def _extract_by_selectors(soup: BeautifulSoup, selectors: list[str]) -> str | None:
    """Essaie chaque selecteur CSS et retourne le premier resultat non-vide."""
    for selector in selectors:
        el = soup.select_one(selector)
        if el:
            text = el.get_text(separator="\n", strip=True)
            if len(text) > 100:
                return text
    return None


def _extract_generic(soup: BeautifulSoup) -> str:
    """Extraction generique : cherche le plus grand bloc de texte."""
    # Supprimer les elements non pertinents
    for tag in soup.find_all(["nav", "header", "footer", "script", "style", "noscript", "aside"]):
        tag.decompose()

    # Chercher les blocs potentiels de description
    candidates: list[tuple[int, str]] = []
    for el in soup.find_all(["article", "main", "section", "div"]):
        text = el.get_text(separator="\n", strip=True)
        if 200 < len(text) < 20000:
            candidates.append((len(text), text))

    if candidates:
        # Trier par taille et prendre le plus grand bloc raisonnable
        candidates.sort(key=lambda x: x[0], reverse=True)
        return candidates[0][1]

    # Fallback : tout le body
    body = soup.find("body")
    if body:
        return body.get_text(separator="\n", strip=True)[:10000]
    return ""


def _clean_text(text: str) -> str:
    """Nettoie le texte extrait : lignes vides multiples, espaces."""
    # Supprimer les lignes vides multiples
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Supprimer les espaces multiples
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


async def scrape_job_url(url: str) -> dict[str, str]:
    """
    Telecharge et extrait le texte d'une offre d'emploi depuis une URL.

    Returns:
        dict avec "text" (le contenu de l'offre) et "source" (la plateforme detectee)

    Raises:
        ValueError si l'URL est invalide ou le contenu introuvable
    """
    # Validation URL basique
    parsed = urlparse(url)
    if not parsed.scheme or not parsed.hostname:
        raise ValueError("URL invalide. Colle un lien complet (ex: https://linkedin.com/jobs/view/...).")

    platform = _detect_platform(url)

    try:
        async with httpx.AsyncClient(
            timeout=15,
            follow_redirects=True,
            headers=_BROWSER_HEADERS,
        ) as client:
            response = await client.get(url)
            response.raise_for_status()
    except httpx.TimeoutException:
        raise ValueError("Le site met trop de temps a repondre. Reessaie ou colle le texte manuellement.")
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 403:
            raise ValueError(
                "Acces refuse par le site. Copie-colle le texte de l'offre directement."
            )
        raise ValueError(f"Erreur HTTP {exc.response.status_code} en accedant a l'URL.")
    except httpx.RequestError:
        raise ValueError("Impossible de se connecter au site. Verifie l'URL.")

    html = response.text
    soup = BeautifulSoup(html, "html.parser")

    # Strategie d'extraction par priorite
    text = None

    # 1. JSON-LD (le plus fiable, present sur LinkedIn, Indeed, etc.)
    text = _extract_json_ld(soup)

    # 2. Selecteurs specifiques a la plateforme
    if not text and platform in _PLATFORM_SELECTORS:
        text = _extract_by_selectors(soup, _PLATFORM_SELECTORS[platform])

    # 3. Extraction generique
    if not text:
        text = _extract_generic(soup)

    if not text or len(text) < 50:
        raise ValueError(
            "Impossible d'extraire le texte de l'offre depuis cette page. "
            "Le site bloque peut-etre l'acces automatique. "
            "Copie-colle le texte de l'offre directement."
        )

    return {
        "text": _clean_text(text),
        "source": platform,
    }
