"""
Schémas Pydantic partagés entre les routes et les services.
Sert de contrat d'API : ce que le client envoie et reçoit.
"""
from typing import Optional
from pydantic import BaseModel, field_validator


class CVUploadResponse(BaseModel):
    """Réponse après upload d'un CV PDF."""
    filename: str
    full_text: str             # Texte complet extrait du PDF
    text_preview: str          # 500 premiers caractères
    char_count: int
    success: bool


class MatchAnalysisRequest(BaseModel):
    """Requête d'analyse de compatibilité CV ↔ offre."""
    cv_text: str               # Texte extrait du CV
    job_content: str           # Texte brut de l'offre collé par l'utilisateur

    @field_validator("cv_text", "job_content")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if len(v.strip()) < 50:
            raise ValueError("Le contenu est trop court (minimum 50 caractères).")
        return v.strip()


class CVImprovement(BaseModel):
    """Une suggestion d'amélioration concrète du CV."""
    category: str              # Ex : "Titre", "Compétences techniques", "Projets", "Mots-clés"
    current: str               # Ce qui est présent ou absent actuellement dans le CV
    suggestion: str            # La phrase ou le texte exact à utiliser (le plus important)
    key_actions: list[str] = []  # Sous-points détaillés de l'amélioration (2-4 actions)
    keywords: list[str] = []   # Mots-clés importants à ajouter au CV (mis en gras côté front)
    impact: str                # Pourquoi ça améliore les chances


class SuggestedProject(BaseModel):
    """Projet concret suggéré à ajouter au CV (pour les postes techniques)."""
    title: str              # Ex : "API REST de scoring crédit avec FastAPI + scikit-learn"
    description: str        # Description courte du projet (2-3 phrases) — legacy, peut être vide
    bullet_points: list[str] = []  # 3-4 sous-points concrets décrivant le projet
    tech_stack: list[str]   # Technologies utilisées
    why_relevant: str       # Pourquoi ce projet est pertinent pour ce poste
    to_replace: str         # Quel projet/expérience peu pertinent remplacer dans le CV
    duration: str           # Ex : "2-3 jours de travail"


class MatchAnalysisResponse(BaseModel):
    """Résultat de l'analyse de compatibilité CV ↔ offre."""
    job_title: str                          # Intitulé du poste ciblé
    company: str                            # Entreprise
    score_current: float                    # Note actuelle /10 (décimale au dixième)
    score_potential: float                  # Note atteignable après améliorations /10
    strengths: list[str]                    # Points forts déjà présents dans le CV
    improvements: list[CVImprovement]      # Suggestions détaillées
    summary: str                            # Synthèse globale de l'analyse
    suggested_project: Optional[SuggestedProject] = None  # Projet suggéré (postes tech)


class JobImportRequest(BaseModel):
    """Requête d'import d'offre depuis une URL."""
    url: str

    @field_validator("url")
    @classmethod
    def valid_url(cls, v: str) -> str:
        v = v.strip()
        if not v.startswith("http"):
            raise ValueError("L'URL doit commencer par http:// ou https://")
        return v


class JobImportResponse(BaseModel):
    """Réponse contenant le texte extrait de l'offre."""
    text: str       # Texte brut de l'offre
    source: str     # Plateforme détectée (linkedin, indeed, generic...)


class CVGenerateRequest(BaseModel):
    """Requête de génération du CV amélioré en PDF."""
    cv_text: str
    job_title: str
    improvements: list[CVImprovement]
    suggested_project: Optional[SuggestedProject] = None
    language: str = "fr"   # Code langue : fr, en, es, de, pt

    @field_validator("cv_text")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if len(v.strip()) < 50:
            raise ValueError("Le CV est trop court (minimum 50 caractères).")
        return v.strip()


class CVPreviewResponse(BaseModel):
    """Texte lisible du CV amélioré, éditable avant export PDF."""
    preview_text: str
    change_percentage: int = 0  # Pourcentage estimé de texte modifié vs l'original


class CVFromTextRequest(BaseModel):
    """Requête de génération PDF depuis le texte du CV (potentiellement édité)."""
    content: str

    @field_validator("content")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if len(v.strip()) < 20:
            raise ValueError("Le contenu est trop court.")
        return v


class CoverLetterRequest(BaseModel):
    """Requête de génération de lettre de motivation."""
    cv_text: str       # Texte complet du CV (pour extraire infos candidat + compétences)
    job_content: str   # Texte brut de l'offre
    job_title: str     # Intitulé du poste (issu de l'analyse)
    company: str       # Entreprise (issu de l'analyse)
    language: str = "fr"   # Code langue : fr, en, es, de, pt


class CoverLetterResponse(BaseModel):
    """Réponse contenant le texte de la lettre de motivation."""
    content: str       # Texte complet de la lettre, modifiable par l'utilisateur


class CoverLetterPDFRequest(BaseModel):
    """Requête de conversion texte → PDF pour la lettre de motivation."""
    content: str       # Texte de la lettre (potentiellement édité par l'utilisateur)

    @field_validator("content")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if len(v.strip()) < 20:
            raise ValueError("La lettre est trop courte.")
        return v


# ── Contacts & emails de networking ───────────────────────────────────────────

class ContactEmailFormat(BaseModel):
    """Format d'email professionnel déduit pour l'entreprise."""
    pattern: str           # Ex : "firstname.lastname"
    confidence: float      # 0.0-1.0
    examples: list[str]    # Ex : ["jean.dupont@company.com"]


class ContactProfile(BaseModel):
    """Un contact pertinent à approcher pour la candidature."""
    rank: int = 1                              # Rang de priorité (1 = meilleur)
    name: str
    title: Optional[str] = ""                  # Intitulé du poste
    email: Optional[str] = ""                  # Email professionnel (estimé depuis le format)
    linkedin_url: Optional[str] = None         # Profil LinkedIn direct si trouvé
    linkedin_search_url: Optional[str] = ""    # Recherche LinkedIn pré-remplie
    reasoning: Optional[str] = ""              # Pourquoi contacter cette personne
    priority_level: Optional[str] = "medium"   # "high" | "medium" | "low"
    seniority: Optional[str] = "mid"           # "junior" | "mid" | "senior" | "lead" | "manager" | "director"
    team_match: float = 0.5                    # 0.0-1.0 — adéquation avec l'équipe ciblée
    search_circle: int = 1                     # 1=équipe directe, 2=département, 3=direction/pôle
    is_estimated: bool = True                  # True si email construit depuis le format
    email_verified: Optional[str] = None       # None=pas vérifié, "valid"/"invalid"/"unknown" (Hunter.io)
    source: Optional[str] = "claude"           # "web_search" ou "claude"


class FindContactsRequest(BaseModel):
    """Requête de recherche de contacts pertinents."""
    job_content: str          # Texte brut de l'offre (seul champ obligatoire)
    job_title: str = ""       # Optionnel — extrait automatiquement de l'offre si vide
    company: str = ""         # Optionnel — extrait automatiquement de l'offre si vide


class FindContactsResponse(BaseModel):
    """Les contacts sélectionnés + métadonnées structurées."""
    company_name: Optional[str] = ""
    team_name: Optional[str] = ""
    position: Optional[str] = ""
    email_format: Optional[ContactEmailFormat] = None
    contacts: list[ContactProfile]
    email_domain: Optional[str] = ""
    email_pattern: Optional[str] = ""
    search_strategy: Optional[str] = ""
    message: Optional[str] = None


class DraftedEmail(BaseModel):
    """Un email de networking rédigé pour un contact."""
    contact_name: str
    contact_email: str
    contact_title: str
    subject: str
    body: str


class DraftEmailsRequest(BaseModel):
    """Requête de rédaction des emails de networking."""
    cv_text: str
    job_title: str
    company: str
    contacts: list[ContactProfile]
    language: str = "fr"
    job_content: str = ""


class DraftEmailsResponse(BaseModel):
    """Les 3 emails rédigés, prêts à être édités et envoyés."""
    emails: list[DraftedEmail]


# ── Préparation entretien (multi-étapes) ──────────────────────────────────────

class InterviewPrepRequest(BaseModel):
    """Requête étape 1 : évaluation + plan de révision (grandes lignes)."""
    cv_text: str
    job_content: str
    extra_skills: str = ""

    @field_validator("cv_text", "job_content")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if len(v.strip()) < 50:
            raise ValueError("Le contenu est trop court (minimum 50 caractères).")
        return v.strip()


class StudyTopicSummary(BaseModel):
    """Un sujet à réviser — version résumée (étape 1)."""
    topic: str                        # Nom du sujet
    priority: str                     # "critique" | "important" | "bonus"
    current_level: str                # "debutant" | "intermediaire" | "avance"
    why: str                          # Pourquoi c'est important (1 phrase)


class InterviewOverviewResponse(BaseModel):
    """Réponse étape 1 : vue d'ensemble rapide."""
    job_title: Optional[str] = ""
    company: Optional[str] = ""
    candidate_level: str              # Évaluation globale 2-3 phrases
    study_plan: list[StudyTopicSummary]


class TopicDetailRequest(BaseModel):
    """Requête étape 2 : approfondir un sujet."""
    cv_text: str
    job_content: str
    topic: str                        # Le sujet à approfondir


class StudyResource(BaseModel):
    """Une ressource pour réviser un sujet."""
    title: str
    url: str
    type: str = "article"            # "article" | "video" | "cours" | "exercice"
    description: Optional[str] = ""


class KeyConcept(BaseModel):
    """Un concept clé à maîtriser pour un sujet d'entretien."""
    name: str
    explanation: str
    interview_tip: str = ""


class FlashCard(BaseModel):
    """Question/réponse rapide pour révision."""
    q: str
    a: str


class TopicDetailResponse(BaseModel):
    """Réponse étape 2 : détails d'un sujet."""
    topic: str
    summary: str = ""                             # Résumé court
    key_concepts: list[KeyConcept] = []           # Concepts essentiels
    common_mistakes: list[str] = []               # Erreurs courantes
    quick_recap: list[FlashCard] = []             # Flashcards Q/R
    what_to_study: str = ""                       # Fallback texte libre
    resources: list[StudyResource] = []


class QuestionDistribution(BaseModel):
    """Répartition souhaitée des questions par catégorie."""
    fit: int = 0
    cv: int = 0
    technique: int = 0
    cas_pratique: int = 0


class QuestionsRequest(BaseModel):
    """Requête étape 3 : générer les questions d'entretien."""
    cv_text: str
    job_content: str
    extra_skills: str = ""
    total: int = 10                                    # Nombre total de questions (5, 10, 15, 20)
    distribution: Optional[QuestionDistribution] = None  # None = laisser l'IA décider


class InterviewQuestion(BaseModel):
    """Une question d'entretien avec sa réponse attendue."""
    question: str
    category: str                     # "fit" | "cv" | "technique" | "cas_pratique"
    difficulty: str                   # "facile" | "moyen" | "difficile"
    tips: str
    sample_answer: Optional[str] = ""


class QuestionsResponse(BaseModel):
    """Réponse étape 3 : liste de questions."""
    questions: list[InterviewQuestion]


# ── Évaluation des réponses d'entretien ──────────────────────────────────────

class AnswerToEvaluate(BaseModel):
    """Une réponse du candidat à évaluer."""
    question: str
    category: str = "technique"
    difficulty: str = "moyen"
    candidate_answer: str
    time_taken: Optional[int] = None      # Secondes prises pour répondre


class EvaluateAnswerRequest(BaseModel):
    """Requête d'évaluation d'une seule réponse (mode entraînement)."""
    cv_text: str = ""
    job_content: str = ""
    job_title: str = ""
    answer: AnswerToEvaluate


class AnswerEvaluation(BaseModel):
    """Évaluation d'une réponse de candidat."""
    score: int                            # /10
    strengths: list[str]                  # Points forts (1-3)
    weaknesses: list[str]                 # Points à améliorer (1-3)
    improved_answer: str                  # Réponse améliorée suggérée
    verdict: str                          # "excellent" | "bon" | "moyen" | "insuffisant"


class EvaluateAnswerResponse(BaseModel):
    """Réponse évaluation d'une seule réponse."""
    evaluation: AnswerEvaluation


class EvaluateBatchRequest(BaseModel):
    """Requête d'évaluation batch (mode vrai entretien)."""
    cv_text: str = ""
    job_content: str = ""
    job_title: str = ""
    answers: list[AnswerToEvaluate]


class EvaluateBatchResponse(BaseModel):
    """Réponse évaluation batch."""
    evaluations: list[AnswerEvaluation]
    overall_score: int                    # Score global /10
    overall_verdict: str                  # Verdict global
    summary: str                          # Synthèse en 2-3 phrases


# ── Synthèse vocale (TTS) ───────────────────────────────────────────────────

class TTSRequest(BaseModel):
    """Requête de synthèse vocale."""
    text: str
    voice: str = "nova"  # Voix OpenAI : alloy, echo, fable, onyx, nova, shimmer
