"""
Service de génération de lettre de motivation personnalisée.
Claude génère une lettre percutante basée sur le CV et l'offre d'emploi.
Le texte retourné est ensuite éditable par l'utilisateur avant export PDF.
"""
import io
import os
import re

import anthropic
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt, RGBColor
from fpdf import FPDF


# Noms complets des langues supportées
_LANGUAGE_NAMES: dict[str, str] = {
    "fr": "French (français)",
    "en": "English",
    "es": "Spanish (español)",
    "de": "German (Deutsch)",
    "pt": "Portuguese (português)",
}

# Formules de politesse adaptées à chaque langue
_SALUTATIONS: dict[str, str] = {
    "fr": "Madame, Monsieur,",
    "en": "Dear Hiring Manager,",
    "es": "Estimado/a Sr./Sra.,",
    "de": "Sehr geehrte Damen und Herren,",
    "pt": "Exmo./Exma. Sr./Sra.,",
}

_CLOSINGS: dict[str, str] = {
    "fr": "Je serais ravi(e) d'echanger sur mon profil lors d'un entretien et vous remercie de l'attention portee a ma candidature.\n\nBien cordialement,",
    "en": "I would be delighted to discuss my profile in an interview and thank you for considering my application.\n\nYours sincerely,",
    "es": "Estaria encantado/a de hablar sobre mi perfil en una entrevista y le agradezco su atencion a mi candidatura.\n\nAtentamente,",
    "de": "Ich freue mich auf ein Gesprach uber mein Profil und bedanke mich fur die Berucksichtigung meiner Bewerbung.\n\nMit freundlichen Grussen,",
    "pt": "Ficaria feliz em discutir o meu perfil numa entrevista e agradeco a sua atencao a minha candidatura.\n\nCom os melhores cumprimentos,",
}

_OBJECT_LABELS: dict[str, str] = {
    "fr": "Objet",
    "en": "Subject",
    "es": "Asunto",
    "de": "Betreff",
    "pt": "Assunto",
}

_ATTENTION_LABELS: dict[str, str] = {
    "fr": "A l'attention de",
    "en": "To the attention of",
    "es": "A la atencion de",
    "de": "z. Hd.",
    "pt": "A/C de",
}

_PROMPT_TEMPLATE = """You are an expert at writing concise, targeted cover letters.

You receive a CV and a job offer. Generate a SHORT cover letter following this structure:

[First name Last name]
[City, Country]
[Phone]
[Email]

{attention_label} [Recruiter name(s) from offer, or recruiting team]
[Division / Department from offer]
[Company name]

{object_label} : [Job title in {language}] ([duration/start date if in offer])

{salutation}

[Paragraph 1 — 2-3 sentences MAX: who you are + why this specific role interests you. In {language}.]

[Paragraph 2 — 2-3 sentences MAX: your most relevant skills/achievements that match the offer. Be specific: name real projects, tools, numbers. In {language}.]

[Paragraph 3 — 1-2 sentences MAX: what you bring beyond technical skills + availability. In {language}.]

{closing}
[First name Last name]

CRITICAL RULES:
- Write EVERYTHING in {language}
- Extract candidate info (name, city, phone, email) from the CV
- Be CONCISE — every sentence must earn its place, no filler
- No generic phrases, no bullet points — professional prose only
- Total: 3 SHORT paragraphs, the letter must fit on ONE page with comfortable margins
- Output the letter text ONLY — no explanation, no markdown"""


def _build_cover_letter_prompt(language: str) -> str:
    """Construit le prompt de lettre de motivation avec la langue et formules adaptées."""
    lang_name = _LANGUAGE_NAMES.get(language, _LANGUAGE_NAMES["fr"])
    return _PROMPT_TEMPLATE.format(
        language=lang_name,
        salutation=_SALUTATIONS.get(language, _SALUTATIONS["fr"]),
        closing=_CLOSINGS.get(language, _CLOSINGS["fr"]),
        object_label=_OBJECT_LABELS.get(language, _OBJECT_LABELS["fr"]),
        attention_label=_ATTENTION_LABELS.get(language, _ATTENTION_LABELS["fr"]),
    )


def _safe_text(text: str) -> str:
    """Normalise le texte pour fpdf2 (cp1252/WinAnsi)."""
    replacements = {
        '\u2019': "'", '\u2018': "'",
        '\u201c': '"', '\u201d': '"',
        '\u2014': '-', '\u2013': '-',
        '\u2026': '...', '\u00b7': '-',
        '\u2022': '-', '\u2192': '->',
        '\u00a0': ' ', '\u2011': '-',
    }
    for char, replacement in replacements.items():
        text = text.replace(char, replacement)
    return text.encode('cp1252', errors='replace').decode('cp1252')


def _get_async_client() -> anthropic.AsyncAnthropic:
    """Retourne un client Anthropic async."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY manquante.")
    return anthropic.AsyncAnthropic(api_key=api_key)


async def generate_cover_letter(
    cv_text: str,
    job_content: str,
    job_title: str,
    company: str,
    language: str = "fr",
) -> str:
    """
    Génère une lettre de motivation personnalisée via Claude.

    Returns:
        Texte complet de la lettre, prêt à être affiché et édité.
    """
    client = _get_async_client()

    user_message = (
        f"=== CV DU CANDIDAT ===\n{cv_text}\n\n"
        f"=== OFFRE D'EMPLOI ===\n{job_content}\n\n"
        f"Poste ciblé : {job_title}\n"
        f"Entreprise : {company}"
    )

    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2000,
        system=[{
            "type": "text",
            "text": _build_cover_letter_prompt(language),
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{"role": "user", "content": user_message}],
    )

    return message.content[0].text.strip()


def cover_letter_to_pdf(content: str) -> bytes:
    """
    Convertit le texte de la lettre de motivation en PDF.
    Mise en page professionnelle sobre, garantie sur une page.

    Args:
        content: Texte de la lettre (potentiellement modifié par l'utilisateur).

    Returns:
        Bytes du fichier PDF.
    """
    L_MARGIN, T_MARGIN, R_MARGIN = 25, 20, 25
    pdf = FPDF()
    pdf.add_page()
    pdf.set_margins(L_MARGIN, T_MARGIN, R_MARGIN)
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.set_y(T_MARGIN)

    usable_w = pdf.epw

    # Découpage par paragraphes (doubles sauts de ligne)
    paragraphs = content.split('\n\n')

    # Détection des zones structurelles
    _SALUTATION_PHRASES = {
        "madame, monsieur,", "dear hiring manager,", "dear sir or madam,",
        "estimado/a sr./sra.,", "sehr geehrte damen und herren,",
        "exmo./exma. sr./sra.,",
    }
    _OBJECT_PREFIXES = ("objet", "subject", "asunto", "betreff", "assunto")

    for i, paragraph in enumerate(paragraphs):
        lines = paragraph.split('\n')

        for line in lines:
            stripped = line.strip()
            if not stripped:
                pdf.ln(1.5)
                continue

            lower = stripped.lower()

            # Ligne "Objet / Subject :" → gras, légèrement plus grand
            if any(lower.startswith(p) for p in _OBJECT_PREFIXES):
                pdf.set_font("Helvetica", "B", 10)
                pdf.set_text_color(25, 25, 25)
            # En-tête candidat (premier paragraphe) → petit, gris
            elif i == 0:
                pdf.set_font("Helvetica", "", 9)
                pdf.set_text_color(80, 80, 80)
            # Bloc destinataire (deuxième paragraphe avant l'objet)
            elif i == 1:
                pdf.set_font("Helvetica", "", 9)
                pdf.set_text_color(60, 60, 60)
            # Formule d'appel → italique
            elif lower.rstrip(',').rstrip() in _SALUTATION_PHRASES or lower in _SALUTATION_PHRASES:
                pdf.set_font("Helvetica", "I", 10)
                pdf.set_text_color(25, 25, 25)
            # Formule de politesse finale (avant signature)
            elif any(lower.startswith(w) for w in ("bien cordialement", "yours sincerely", "atentamente", "mit freundlichen", "com os melhores")):
                pdf.set_font("Helvetica", "I", 10)
                pdf.set_text_color(25, 25, 25)
            # Nom de signature (dernière ligne)
            elif i == len(paragraphs) - 1 and line == lines[-1]:
                pdf.set_font("Helvetica", "B", 10)
                pdf.set_text_color(25, 25, 25)
            # Corps standard
            else:
                pdf.set_font("Helvetica", "", 10)
                pdf.set_text_color(30, 30, 30)

            pdf.set_x(pdf.l_margin)
            pdf.multi_cell(usable_w, 5, _safe_text(stripped))

        # Espacement entre paragraphes — plus aéré entre les blocs
        if i < len(paragraphs) - 1:
            pdf.ln(4)

    # Ligne décorative fine en bas de page
    bottom_y = 280
    if pdf.get_y() < bottom_y - 10:
        pdf.set_y(bottom_y)
        pdf.set_draw_color(180, 180, 180)
        pdf.set_line_width(0.3)
        pdf.line(L_MARGIN, bottom_y, 210 - R_MARGIN, bottom_y)

    return bytes(pdf.output())


def cover_letter_to_docx(content: str) -> bytes:
    """
    Convertit le texte de la lettre de motivation en fichier .docx.
    Mise en page professionnelle avec python-docx.
    """
    doc = Document()

    # Marges
    for section in doc.sections:
        section.top_margin = Inches(0.8)
        section.bottom_margin = Inches(0.6)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)

    _OBJECT_PREFIXES = ("objet", "subject", "asunto", "betreff", "assunto")

    paragraphs = content.split('\n\n')

    for i, paragraph in enumerate(paragraphs):
        lines = paragraph.split('\n')

        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue

            lower = stripped.lower()
            p = doc.add_paragraph()
            p.space_before = Pt(0)
            p.space_after = Pt(2)

            # Ligne Objet → gras
            if any(lower.startswith(pfx) for pfx in _OBJECT_PREFIXES):
                run = p.add_run(stripped)
                run.bold = True
                run.font.size = Pt(10)
            # En-tête candidat
            elif i == 0:
                run = p.add_run(stripped)
                run.font.size = Pt(9)
                run.font.color.rgb = RGBColor(80, 80, 80)
            # Destinataire
            elif i == 1:
                run = p.add_run(stripped)
                run.font.size = Pt(9)
                run.font.color.rgb = RGBColor(60, 60, 60)
            # Signature (dernière ligne du dernier paragraphe)
            elif i == len(paragraphs) - 1 and line == lines[-1]:
                run = p.add_run(stripped)
                run.bold = True
                run.font.size = Pt(10)
            # Corps
            else:
                run = p.add_run(stripped)
                run.font.size = Pt(10)

        # Espace entre paragraphes
        if i < len(paragraphs) - 1:
            spacer = doc.add_paragraph()
            spacer.space_before = Pt(0)
            spacer.space_after = Pt(4)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
