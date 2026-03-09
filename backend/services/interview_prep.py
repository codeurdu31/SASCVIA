"""
Service de preparation a l'entretien — multi-etapes.

Etape 1 : evaluation candidat + plan de revision (grandes lignes) — rapide
Etape 2 : approfondir un sujet (ressources, details)
Etape 3 : generer les questions d'entretien
"""
import json
import os
import re

import anthropic

from models.schemas import (
    AnswerEvaluation,
    AnswerToEvaluate,
    EvaluateAnswerResponse,
    EvaluateBatchResponse,
    FlashCard,
    InterviewOverviewResponse,
    InterviewQuestion,
    KeyConcept,
    QuestionDistribution,
    QuestionsResponse,
    StudyResource,
    StudyTopicSummary,
    TopicDetailResponse,
)

_MODEL = "claude-sonnet-4-6"


def _get_client() -> anthropic.AsyncAnthropic:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY manquante.")
    return anthropic.AsyncAnthropic(api_key=api_key)


def _parse_json_response(text: str) -> dict:
    """Extrait et parse le JSON de la reponse Claude."""
    clean = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.MULTILINE).strip()
    # Trouver le JSON en matchant les accolades equilibrees
    start = clean.find("{")
    if start == -1:
        return {}
    depth = 0
    end = start
    for i in range(start, len(clean)):
        if clean[i] == "{":
            depth += 1
        elif clean[i] == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    try:
        return json.loads(clean[start:end])
    except json.JSONDecodeError:
        # Fallback : tenter tout le texte entre premier { et dernier }
        last = clean.rfind("}")
        if last > start:
            try:
                return json.loads(clean[start:last + 1])
            except json.JSONDecodeError:
                pass
        return {}


# ── Etape 1 : vue d'ensemble ─────────────────────────────────────────────────

_OVERVIEW_PROMPT = """Tu es un coach de preparation aux entretiens d'embauche/stage.

A partir du CV du candidat et de l'offre d'emploi, donne :

1. **candidate_level** : evaluation honnete en 2-3 phrases (points forts + lacunes)
2. **study_plan** : liste de 5-8 sujets a reviser, classes du plus critique au moins important.
   Pour chaque sujet, donne UNIQUEMENT :
   - topic : nom du sujet
   - priority : "critique" | "important" | "bonus"
   - current_level : "debutant" | "intermediaire" | "avance"
   - why : 1 phrase expliquant pourquoi c'est important pour CE poste

Sois SPECIFIQUE au poste et a l'entreprise, pas de conseils generiques.

OUTPUT — JSON uniquement, sans markdown :
{
  "job_title": "...",
  "company": "...",
  "candidate_level": "...",
  "study_plan": [
    {"topic": "...", "priority": "critique", "current_level": "intermediaire", "why": "..."}
  ]
}"""


async def interview_overview(
    cv_text: str,
    job_content: str,
    extra_skills: str = "",
) -> InterviewOverviewResponse:
    """Etape 1 : evaluation rapide + plan grandes lignes."""
    client = _get_client()

    extra_part = ""
    if extra_skills.strip():
        extra_part = f"\n\nCompetences supplementaires (hors CV) :\n{extra_skills.strip()}"

    user_msg = (
        f"CV du candidat :\n{cv_text[:3000]}\n\n"
        f"Offre d'emploi :\n{job_content[:2500]}"
        f"{extra_part}\n\n"
        "Donne l'evaluation et le plan de revision en JSON."
    )

    r = await client.messages.create(
        model=_MODEL,
        max_tokens=2000,
        system=[{
            "type": "text",
            "text": _OVERVIEW_PROMPT,
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{"role": "user", "content": user_msg}],
    )

    text = r.content[0].text.strip()
    data = _parse_json_response(text)

    if not data:
        raise ValueError("Impossible de generer l'evaluation.")

    study_plan = [
        StudyTopicSummary(
            topic=t.get("topic", ""),
            priority=t.get("priority", "important"),
            current_level=t.get("current_level", "intermediaire"),
            why=t.get("why", ""),
        )
        for t in data.get("study_plan", [])
    ]

    return InterviewOverviewResponse(
        job_title=data.get("job_title") or "",
        company=data.get("company") or "",
        candidate_level=data.get("candidate_level", ""),
        study_plan=study_plan,
    )


# ── Etape 2 : approfondir un sujet ───────────────────────────────────────────

_TOPIC_DETAIL_PROMPT = """Tu es un coach de preparation aux entretiens.

Le candidat veut approfondir un sujet precis pour preparer son entretien.

Donne :
1. **summary** : resume en 1-2 phrases de pourquoi ce sujet est cle pour le poste
2. **key_concepts** : 3-5 concepts essentiels a maitriser. Pour chaque concept :
   - name : nom du concept
   - explanation : explication claire en 2-3 phrases
   - interview_tip : comment ce concept peut etre teste en entretien (1 phrase)
3. **common_mistakes** : 2-3 erreurs courantes en entretien sur ce sujet
4. **quick_recap** : tableau de 4-6 points cles sous forme question/reponse rapides (flashcards)
   - q : question courte
   - a : reponse courte (1-2 phrases max)
5. **resources** : 3-4 VRAIES ressources (sites web, videos YouTube connues, cours)
   - Pour YouTube : chaines/videos connues et pertinentes
   - Sites : investopedia.com, wallstreetprep.com, coursera.org, openclassrooms.com, etc.
   - Adapte a la langue du CV (FR si CV en francais)

OUTPUT — JSON uniquement :
{
  "topic": "...",
  "summary": "...",
  "key_concepts": [
    {"name": "...", "explanation": "...", "interview_tip": "..."}
  ],
  "common_mistakes": ["...", "..."],
  "quick_recap": [
    {"q": "...", "a": "..."}
  ],
  "resources": [
    {"title": "...", "url": "https://...", "type": "video", "description": "..."}
  ]
}"""


async def topic_detail(
    cv_text: str,
    job_content: str,
    topic: str,
) -> TopicDetailResponse:
    """Etape 2 : details + ressources pour un sujet."""
    client = _get_client()

    user_msg = (
        f"CV (resume) :\n{cv_text[:1500]}\n\n"
        f"Offre :\n{job_content[:1500]}\n\n"
        f"Sujet a approfondir : {topic}\n\n"
        "Donne les details et ressources en JSON."
    )

    r = await client.messages.create(
        model=_MODEL,
        max_tokens=4000,
        system=[{
            "type": "text",
            "text": _TOPIC_DETAIL_PROMPT,
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{"role": "user", "content": user_msg}],
    )

    text = r.content[0].text.strip()
    data = _parse_json_response(text)

    if not data:
        print(f"[topic_detail] JSON parse echoue. stop_reason={r.stop_reason}, raw={text[:500]}")
        raise ValueError("Impossible de generer les details du sujet.")

    resources = [
        StudyResource(
            title=res["title"],
            url=res["url"],
            type=res.get("type", "article"),
            description=res.get("description", ""),
        )
        for res in data.get("resources", [])
        if res.get("title") and res.get("url")
    ]

    key_concepts = [
        KeyConcept(
            name=c.get("name", ""),
            explanation=c.get("explanation", ""),
            interview_tip=c.get("interview_tip", ""),
        )
        for c in data.get("key_concepts", [])
        if c.get("name")
    ]

    quick_recap = [
        FlashCard(q=f.get("q", ""), a=f.get("a", ""))
        for f in data.get("quick_recap", [])
        if f.get("q")
    ]

    return TopicDetailResponse(
        topic=data.get("topic", topic),
        summary=data.get("summary", ""),
        key_concepts=key_concepts,
        common_mistakes=data.get("common_mistakes", []),
        quick_recap=quick_recap,
        what_to_study=data.get("what_to_study", ""),
        resources=resources,
    )


# ── Etape 3 : questions d'entretien ──────────────────────────────────────────

_QUESTIONS_PROMPT_BASE = """Tu es un coach de preparation aux entretiens d'embauche/stage.

Genere {total} questions d'entretien SPECIFIQUES a ce poste et cette entreprise.

{distribution_instruction}

4 categories possibles :
- **fit** : motivation, parcours, personnalite, soft skills
- **cv** : questions sur le CV du candidat (experiences, projets, choix de parcours)
- **technique** : connaissances metier, outils, concepts techniques
- **cas_pratique** : mise en situation, etude de cas, resolution de probleme

Pour chaque question :
- category : "fit" | "cv" | "technique" | "cas_pratique"
- difficulty : "facile" | "moyen" | "difficile"
- tips : conseils pour bien repondre
- sample_answer : exemple de bonne reponse adaptee au profil du candidat

Les questions techniques doivent etre REALISTES (celles qu'on pose vraiment en entretien).
Les questions CV doivent etre basees sur le CV du candidat (experiences reelles, projets mentionnes).

OUTPUT — JSON uniquement :
{{
  "questions": [
    {{
      "question": "...",
      "category": "technique",
      "difficulty": "moyen",
      "tips": "...",
      "sample_answer": "..."
    }}
  ]
}}"""


def _build_distribution_instruction(total: int, dist: QuestionDistribution | None) -> str:
    """Construit l'instruction de repartition pour le prompt."""
    if dist is None:
        return (
            f"Repartis les {total} questions entre les 4 categories (fit, cv, technique, cas_pratique) "
            "selon ce qui est le plus pertinent pour ce poste. Assure un bon equilibre."
        )
    parts: list[str] = []
    if dist.fit > 0:
        parts.append(f"- **Questions fit** — {dist.fit} questions")
    if dist.cv > 0:
        parts.append(f"- **Questions CV** — {dist.cv} questions")
    if dist.technique > 0:
        parts.append(f"- **Questions techniques** — {dist.technique} questions")
    if dist.cas_pratique > 0:
        parts.append(f"- **Cas pratiques** — {dist.cas_pratique} questions")
    return "Repartition demandee :\n" + "\n".join(parts)


async def interview_questions(
    cv_text: str,
    job_content: str,
    extra_skills: str = "",
    total: int = 10,
    distribution: QuestionDistribution | None = None,
) -> QuestionsResponse:
    """Etape 3 : genere les questions d'entretien."""
    client = _get_client()

    distribution_instruction = _build_distribution_instruction(total, distribution)
    prompt = _QUESTIONS_PROMPT_BASE.format(
        total=total,
        distribution_instruction=distribution_instruction,
    )

    extra_part = ""
    if extra_skills.strip():
        extra_part = f"\n\nCompetences supplementaires :\n{extra_skills.strip()}"

    user_msg = (
        f"CV du candidat :\n{cv_text[:2500]}\n\n"
        f"Offre d'emploi :\n{job_content[:2500]}"
        f"{extra_part}\n\n"
        f"Genere exactement {total} questions d'entretien en JSON."
    )

    r = await client.messages.create(
        model=_MODEL,
        max_tokens=8000,
        system=[{
            "type": "text",
            "text": prompt,
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{"role": "user", "content": user_msg}],
    )

    text = r.content[0].text.strip()
    data = _parse_json_response(text)

    if not data:
        print(f"[interview_questions] JSON parse echoue. stop_reason={r.stop_reason}, raw={text[:500]}")
        raise ValueError("Impossible de generer les questions.")

    questions = [
        InterviewQuestion(
            question=q.get("question", ""),
            category=q.get("category", "technique"),
            difficulty=q.get("difficulty", "moyen"),
            tips=q.get("tips", ""),
            sample_answer=q.get("sample_answer", ""),
        )
        for q in data.get("questions", [])
    ]

    return QuestionsResponse(questions=questions)


# ── Etape 4 : evaluation des reponses ────────────────────────────────────────

_EVAL_SINGLE_PROMPT = """Tu es un coach d'entretien exigeant mais bienveillant.

Evalue la reponse du candidat a une question d'entretien.

Poste vise : {job_title}
Categorie : {category} | Difficulte : {difficulty}

Sois HONNETE et PRECIS :
- Un score de 8+ = reponse quasi parfaite, rare
- Un score de 5-7 = correct mais ameliorable
- Un score < 5 = reponse insuffisante ou hors sujet

OUTPUT — JSON uniquement, sans markdown :
{{
  "score": 7,
  "strengths": ["point fort 1", "point fort 2"],
  "weaknesses": ["point faible 1"],
  "improved_answer": "Voici une meilleure reponse...",
  "verdict": "bon"
}}

verdict : "excellent" (8-10) | "bon" (6-7) | "moyen" (4-5) | "insuffisant" (0-3)"""

_EVAL_BATCH_PROMPT = """Tu es un coach d'entretien exigeant mais bienveillant.

Evalue TOUTES les reponses du candidat a ses questions d'entretien.
Poste vise : {job_title}

Pour CHAQUE reponse, donne score/10, points forts, points faibles, reponse amelioree, verdict.
Puis donne un bilan global.

Sois HONNETE : un 8+/10 est rare, un 5-7 est correct mais ameliorable, un <5 est insuffisant.

OUTPUT — JSON uniquement, sans markdown :
{{
  "evaluations": [
    {{
      "score": 7,
      "strengths": ["..."],
      "weaknesses": ["..."],
      "improved_answer": "...",
      "verdict": "bon"
    }}
  ],
  "overall_score": 6,
  "overall_verdict": "bon",
  "summary": "Synthese en 2-3 phrases..."
}}

verdict : "excellent" (8-10) | "bon" (6-7) | "moyen" (4-5) | "insuffisant" (0-3)"""


_EVAL_MODEL = "claude-haiku-4-5-20251001"


async def evaluate_single_answer(
    answer: AnswerToEvaluate,
    job_title: str = "",
    cv_text: str = "",
    job_content: str = "",
) -> EvaluateAnswerResponse:
    """Evalue une seule reponse (mode entrainement — rapide)."""
    client = _get_client()

    user_msg = (
        f"Question : {answer.question}\n\n"
        f"Reponse du candidat : {answer.candidate_answer}\n\n"
        "Evalue cette reponse en JSON."
    )

    r = await client.messages.create(
        model=_EVAL_MODEL,
        max_tokens=1000,
        system=[{
            "type": "text",
            "text": _EVAL_SINGLE_PROMPT.format(
                job_title=job_title or "non precise",
                category=answer.category,
                difficulty=answer.difficulty,
            ),
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{"role": "user", "content": user_msg}],
    )

    text = r.content[0].text.strip()
    data = _parse_json_response(text)

    if not data:
        print(f"[evaluate_single] JSON parse echoue. raw={text[:300]}")
        raise ValueError("Impossible d'evaluer la reponse.")

    return EvaluateAnswerResponse(
        evaluation=AnswerEvaluation(
            score=data.get("score", 5),
            strengths=data.get("strengths", []),
            weaknesses=data.get("weaknesses", []),
            improved_answer=data.get("improved_answer", ""),
            verdict=data.get("verdict", "moyen"),
        )
    )


async def evaluate_batch_answers(
    answers: list[AnswerToEvaluate],
    job_title: str = "",
    cv_text: str = "",
    job_content: str = "",
) -> EvaluateBatchResponse:
    """Evalue toutes les reponses d'un coup (mode vrai entretien)."""
    client = _get_client()

    # Construire le bloc de Q/R
    qa_block = ""
    for i, a in enumerate(answers, 1):
        qa_block += (
            f"--- Question {i} ({a.category}, {a.difficulty}) ---\n"
            f"Q: {a.question}\n"
            f"R: {a.candidate_answer or '(pas de reponse)'}\n"
        )
        if a.time_taken is not None:
            qa_block += f"Temps: {a.time_taken}s\n"
        qa_block += "\n"

    user_msg = f"Voici les {len(answers)} questions et reponses :\n\n{qa_block}\nEvalue tout en JSON."

    r = await client.messages.create(
        model=_MODEL,  # Sonnet pour le batch (plus complexe)
        max_tokens=8000,
        system=[{
            "type": "text",
            "text": _EVAL_BATCH_PROMPT.format(job_title=job_title or "non precise"),
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{"role": "user", "content": user_msg}],
    )

    text = r.content[0].text.strip()
    data = _parse_json_response(text)

    if not data:
        print(f"[evaluate_batch] JSON parse echoue. stop_reason={r.stop_reason}, raw={text[:500]}")
        raise ValueError("Impossible d'evaluer les reponses.")

    evaluations = [
        AnswerEvaluation(
            score=e.get("score", 5),
            strengths=e.get("strengths", []),
            weaknesses=e.get("weaknesses", []),
            improved_answer=e.get("improved_answer", ""),
            verdict=e.get("verdict", "moyen"),
        )
        for e in data.get("evaluations", [])
    ]

    return EvaluateBatchResponse(
        evaluations=evaluations,
        overall_score=data.get("overall_score", 5),
        overall_verdict=data.get("overall_verdict", "moyen"),
        summary=data.get("summary", ""),
    )
