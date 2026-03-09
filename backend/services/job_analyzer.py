"""
Service d'analyse de compatibilité entre un CV et une offre d'emploi.
Claude note le CV objectivement sur 10 points (avec décimales) selon les
correspondances réelles entre le contenu du CV et les exigences de l'offre.

Critères de notation (total : 10 pts) :
  - Pertinence du titre / headline      : 1.0 pt
  - Compétences techniques requises     : 2.5 pts
  - Projets et expériences pertinents   : 3.0 pts
  - Mots-clés et vocabulaire de l'offre : 2.0 pts
  - Adéquation formation / parcours     : 1.5 pts
"""
import json
import os
import re

import anthropic

from models.schemas import CVImprovement, MatchAnalysisResponse, SuggestedProject


_SYSTEM_PROMPT = """Tu es un expert SENIOR en recrutement et optimisation de CV avec 15 ans d'expérience.
On te donne le texte d'un CV et d'une offre d'emploi.

Tu dois produire une analyse RIGOUREUSE et DÉTAILLÉE. Prends le temps de bien examiner chaque élément.

ÉTAPE 1 — EXTRACTION (fais-le mentalement avant de noter) :
A) Liste TOUTES les compétences/outils/technologies demandés dans l'offre.
B) Liste TOUTES les compétences/outils/technologies présents dans le CV.
C) Identifie les correspondances exactes et les correspondances partielles.
D) Identifie les mots-clés métier de l'offre absents du CV.

ÉTAPE 2 — NOTATION selon 5 critères DE CONTENU (pas de forme) :
1. Pertinence du titre / headline (1.0 pt) — le titre correspond-il au poste visé ? Un titre générique "étudiant en X" perd des points face à un titre ciblé.
2. Compétences techniques requises (2.5 pts) — pour chaque compétence demandée dans l'offre, vérifie si elle est mentionnée dans le CV. Score = (nb trouvées / nb demandées) * 2.5. MONTRE le calcul.
3. Projets et expériences pertinents (3.0 pts) — les réalisations sont-elles directement applicables au poste ? Évalue chaque projet/expérience individuellement.
4. Mots-clés et vocabulaire de l'offre (2.0 pts) — le CV reprend-il les termes exacts de l'offre (outils, frameworks, méthodes, jargon métier) ? Score = (nb repris / nb total dans l'offre) * 2.0.
5. Adéquation formation / parcours (1.5 pts) — le parcours académique et la trajectoire professionnelle sont-ils logiques pour ce poste ?

RÈGLES DE NOTATION STRICTES :
- Note au DIXIÈME près (ex: 6.3, 7.8, 4.1). Jamais d'arrondi à l'entier.
- CHAQUE sous-score doit résulter d'un COMPTAGE explicite. Pas d'estimation vague.
- Additionne les 5 sous-scores pour obtenir score_current (sur 10.0).
- Ne donne JAMAIS 5.0/10 par défaut. Chaque dixième doit être justifié par le comptage.
- Sois SÉVÈRE sur les correspondances : une compétence vaguement liée ne compte pas comme une correspondance exacte.
- score_potential = score atteignable si le candidat applique TOUTES les améliorations suggérées.
  Le score_potential doit être ambitieux mais réaliste : vise au minimum 7.5/10 (sauf si le profil est totalement hors sujet).
  score_potential est toujours >= score_current.

FORMAT DES AMÉLIORATIONS (IMPORTANT) :
- "suggestion" : la PHRASE EXACTE ou le TEXTE EXACT à utiliser (c'est l'élément principal, le plus visible).
  Exemple : "Étudiant ingénieur en finance — Stage de 6 mois en banque (Communication, Marketing ou Analyse de données)"
- "key_actions" : 2-4 sous-points concrets et actionnables qui détaillent quoi faire.
  Exemple : ["Remplacer le titre actuel par la phrase ci-dessus", "Mentionner explicitement les métiers de l'offre", "Ajouter la durée du stage"]
- "keywords" : les mots-clés EXACTS à insérer dans le CV (ceux qui manquent et qui sont dans l'offre).
  Exemple : ["analyse de données", "communication digitale", "marketing"]

PROJET SUGGÉRÉ (uniquement si le poste est technique et implique du code) :
- Propose UN projet concret, réalisable en 2 à 4 jours.
- Le titre doit inclure la stack technique (ex: "API REST de scoring crédit — FastAPI, scikit-learn, PostgreSQL").
- Fournis 3-4 bullet_points concrets décrivant ce que le candidat va implémenter (ex: "Développement d'une API REST avec authentification JWT", "Entraînement d'un modèle de classification sur un dataset public").
- Précise quel projet ou expérience peu pertinent du CV remplacer.
- Si le poste n'est PAS technique, mets "suggested_project": null.

Réponds UNIQUEMENT avec un objet JSON valide (sans markdown, sans explication) :
{
  "job_title": "string",
  "company": "string",
  "score_breakdown": {
    "titre": <float 0.0-1.0>,
    "competences": <float 0.0-2.5>,
    "projets": <float 0.0-3.0>,
    "mots_cles": <float 0.0-2.0>,
    "formation": <float 0.0-1.5>
  },
  "score_current": <float — SOMME EXACTE des 5 sous-scores ci-dessus>,
  "score_potential": <float 0.0-10.0, toujours >= score_current>,
  "strengths": ["point fort 1", "point fort 2", "point fort 3"],
  "improvements": [
    {
      "category": "string (ex: Titre, Compétences techniques, Projets, Mots-clés, Formation)",
      "current": "string — ce qui est présent ou absent actuellement dans le CV",
      "suggestion": "string — LA PHRASE ou LE TEXTE EXACT recommandé (c'est le plus important)",
      "key_actions": ["sous-point 1 concret", "sous-point 2 concret", "sous-point 3"],
      "keywords": ["mot-clé 1", "mot-clé 2"],
      "impact": "string — pourquoi ça améliore les chances de passer le screening"
    }
  ],
  "summary": "string — synthèse en 2-3 phrases",
  "suggested_project": {
    "title": "string — titre du projet avec la stack (ex: 'Plateforme de scoring crédit — FastAPI, scikit-learn, PostgreSQL')",
    "bullet_points": ["sous-point 1 concret", "sous-point 2 concret", "sous-point 3 concret"],
    "tech_stack": ["tech1", "tech2", "tech3"],
    "why_relevant": "string — pourquoi ce projet est pertinent pour ce poste precis",
    "to_replace": "string — quel projet/experience du CV remplacer et pourquoi ce choix",
    "duration": "string — ex: 2-3 jours de travail"
  }
}

IMPORTANT : score_current DOIT être la somme exacte de score_breakdown. Vérifie l'addition avant de répondre.

Donne entre 3 et 6 améliorations. Sois précis et actionnable — spécifique à CE CV et CETTE offre."""


def _get_async_client() -> anthropic.AsyncAnthropic:
    """Retourne un client Anthropic async, initialisé après load_dotenv()."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY manquante. Vérifie ton fichier .env.")
    return anthropic.AsyncAnthropic(api_key=api_key)


async def analyze_cv_match(cv_text: str, job_content: str) -> MatchAnalysisResponse:
    """
    Analyse la compatibilité d'un CV avec une offre d'emploi.

    Args:
        cv_text: Texte extrait du CV PDF.
        job_content: Texte brut de l'offre collé par l'utilisateur.

    Returns:
        MatchAnalysisResponse avec score, points forts, améliorations et projet suggéré.

    Raises:
        ValueError: Si Claude retourne un JSON invalide.
        anthropic.APIError: Si l'appel à l'API échoue.
    """
    client = _get_async_client()

    user_message = (
        f"=== CV ===\n{cv_text}\n\n"
        f"=== OFFRE D'EMPLOI ===\n{job_content}"
    )

    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4000,
        system=[{
            "type": "text",
            "text": _SYSTEM_PROMPT,
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{"role": "user", "content": user_message}],
    )

    raw_json = message.content[0].text.strip()

    # Retire les éventuels blocs ```json ... ``` que Claude pourrait ajouter
    raw_json = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw_json, flags=re.MULTILINE).strip()

    try:
        data: dict = json.loads(raw_json)
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"Claude n'a pas retourné un JSON valide : {raw_json[:200]}"
        ) from exc

    improvements = [
        CVImprovement(
            category=item.get("category", ""),
            current=item.get("current", ""),
            suggestion=item.get("suggestion", ""),
            key_actions=item.get("key_actions", []),
            keywords=item.get("keywords", []),
            impact=item.get("impact", ""),
        )
        for item in data.get("improvements", [])
    ]

    # Parsing du projet suggéré (optionnel — null si poste non technique)
    suggested_project: SuggestedProject | None = None
    raw_project = data.get("suggested_project")
    if raw_project and isinstance(raw_project, dict):
        suggested_project = SuggestedProject(
            title=raw_project.get("title", ""),
            description=raw_project.get("description", ""),
            bullet_points=raw_project.get("bullet_points", []),
            tech_stack=raw_project.get("tech_stack", []),
            why_relevant=raw_project.get("why_relevant", ""),
            to_replace=raw_project.get("to_replace", ""),
            duration=raw_project.get("duration", ""),
        )

    return MatchAnalysisResponse(
        job_title=data.get("job_title", ""),
        company=data.get("company", ""),
        score_current=round(float(data.get("score_current", 0)), 1),
        score_potential=round(float(data.get("score_potential", 0)), 1),
        strengths=data.get("strengths", []),
        improvements=improvements,
        summary=data.get("summary", ""),
        suggested_project=suggested_project,
    )
