"""
Service de rédaction d'emails de networking personnalisés.
Claude rédige un email court et percutant pour chaque contact (~100 mots max).
"""
import json
import os
import re
from datetime import date

import anthropic

from models.schemas import ContactProfile, DraftedEmail


_LANGUAGE_NAMES: dict[str, str] = {
    "fr": "French (français)",
    "en": "English",
    "es": "Spanish (español)",
    "de": "German (Deutsch)",
    "pt": "Portuguese (português)",
}

_SUBJECT_PROMPT = """From the job title and job description below, generate a SHORT email subject line for a job application.

Format: "Candidature [Type] [Poste] [Entreprise] - [Mois de début] [Année] ([Durée])"

Rules:
- [Type] = "Stage", "Alternance", "CDI", "CDD", or nothing if unclear
- [Poste] = short job title (2-4 words max), no repetition of company name
- [Entreprise] = company name
- [Mois de début] and [Durée]: extract from the offer if mentioned. If not found, omit the "- ..." part entirely
- Month in French: Janvier, Février, Mars, Avril, Mai, Juin, Juillet, Août, Septembre, Octobre, Novembre, Décembre
- Duration format: "(X mois)" or "(X ans)"

Examples:
- "Candidature Stage Risk Analyst Natixis - Avril 2026 (6 mois)"
- "Candidature Alternance Data Engineer BNP Paribas - Septembre 2026 (12 mois)"
- "Candidature CDI Développeur Full-Stack Datadog"

Reply with ONLY the subject line, nothing else."""

_CV_SUMMARY_PROMPT = """Extract from this CV the 3 most impactful elements for a "{job_title}" position.
Reply in plain text, max 60 words total:
- Most relevant project (1 short line)
- Key technical skills (1 short line)
- Most notable experience or achievement (1 short line)"""

_EMAIL_PROMPT = """You are a job search expert writing a SHORT networking email.

Sender: applying for "{job_title}" at {company}
Recipient: {contact_name}, {contact_title}
Why contact them specifically: {why_relevant}
Language: {language}

CV key elements:
{cv_summary}

EMAIL RULES (critical):
- Body: 80-110 words MAXIMUM — people are very busy, shorter = better read rate
- Structure (3 very short paragraphs, no empty lines between them):
  1. Who I am (name, school/current position, what I'm looking for) — 1-2 sentences
  2. Why I contact THIS person + 1 relevant project/skill from CV — 2 sentences
  3. Simple ask: brief 15-min exchange, CV attached — 1-2 sentences
- Warm but professional tone — NOT a formal cover letter, it's a networking message
- Do NOT start with "I hope this email finds you well" or similar filler
- Write entirely in {language}
- Do NOT generate a subject line, only the body

Reply ONLY with valid JSON (no markdown):
{{"body": "Full email body here"}}"""


def _get_client() -> anthropic.AsyncAnthropic:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY manquante.")
    return anthropic.AsyncAnthropic(api_key=api_key)


async def _summarize_cv(cv_text: str, job_title: str) -> str:
    """Extrait les éléments clés du CV pour personnaliser les emails."""
    if not cv_text or not cv_text.strip():
        return f"Candidat pour le poste de {job_title}."
    client = _get_client()
    msg = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=120,
        system=[{
            "type": "text",
            "text": _CV_SUMMARY_PROMPT.format(job_title=job_title),
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{"role": "user", "content": cv_text}],
    )
    return msg.content[0].text.strip()


async def _generate_subject(job_title: str, company: str, job_content: str) -> str:
    """Genere un objet d'email intelligent a partir de l'offre."""
    if not job_content or not job_content.strip():
        return f"Candidature {job_title} {company}".strip()
    client = _get_client()
    msg = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=80,
        system=[{
            "type": "text",
            "text": _SUBJECT_PROMPT,
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{"role": "user", "content": f"Job title: {job_title}\nCompany: {company}\n\nJob description:\n{job_content[:2000]}"}],
    )
    subject = msg.content[0].text.strip().strip('"').strip("'")
    # Fallback si la reponse est vide ou bizarre
    if not subject or len(subject) < 10 or not subject.lower().startswith("candidature"):
        return f"Candidature {job_title} {company}".strip()
    return subject


async def draft_contact_emails(
    cv_text: str,
    job_title: str,
    company: str,
    contacts: list[ContactProfile],
    language: str = "fr",
    job_content: str = "",
) -> list[DraftedEmail]:
    """
    Rédige un email court et personnalisé pour chaque contact.
    Fait un seul appel Claude pour le résumé CV, puis un par contact pour l'email.

    Returns:
        Liste de DraftedEmail avec sujet + corps éditables.
    """
    client = _get_client()
    lang_name = _LANGUAGE_NAMES.get(language, _LANGUAGE_NAMES["fr"])

    # Resume CV + objet intelligent en parallele
    cv_summary = await _summarize_cv(cv_text, job_title)
    email_subject = await _generate_subject(job_title, company, job_content)

    emails: list[DraftedEmail] = []
    for contact in contacts:
        msg = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=400,
            system=[{
                "type": "text",
                "text": _EMAIL_PROMPT.format(
                    job_title=job_title,
                    company=company,
                    contact_name=contact.name,
                    contact_title=contact.title,
                    why_relevant=contact.reasoning,
                    language=lang_name,
                    cv_summary=cv_summary,
                ),
                "cache_control": {"type": "ephemeral"},
            }],
            messages=[{"role": "user", "content": "Write the email now."}],
        )
        raw = re.sub(
            r"^```(?:json)?\s*|\s*```$", "", msg.content[0].text.strip(), flags=re.MULTILINE
        ).strip()
        try:
            data = json.loads(raw)
            emails.append(DraftedEmail(
                contact_name=contact.name,
                contact_email=contact.email,
                contact_title=contact.title,
                subject=email_subject,
                body=data["body"],
            ))
        except (json.JSONDecodeError, KeyError):
            # Fallback si JSON invalide : on garde le texte brut comme corps
            emails.append(DraftedEmail(
                contact_name=contact.name,
                contact_email=contact.email,
                contact_title=contact.title,
                subject=email_subject,
                body=raw,
            ))

    return emails
