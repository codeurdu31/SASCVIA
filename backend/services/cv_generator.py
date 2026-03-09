"""
Service de génération du CV amélioré en PDF.
1. Claude réécrit le CV en JSON structuré (même langue que l'original, concis, 1 page).
2. fpdf2 génère le PDF avec marges étroites et mise en page compacte.
"""
import io
import json
import os
import re
from typing import Optional

import anthropic
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt, RGBColor
from fpdf import FPDF

from models.schemas import CVImprovement, SuggestedProject


# Noms complets des langues supportées pour les prompts Claude
_LANGUAGE_NAMES: dict[str, str] = {
    "fr": "French (français)",
    "en": "English",
    "es": "Spanish (español)",
    "de": "German (Deutsch)",
    "pt": "Portuguese (português)",
}

_REWRITE_PROMPT_TEMPLATE = """You are an expert CV optimizer. You receive a raw CV text, a list of improvements to apply, and optionally ONE project to add.

ABSOLUTE RULE — PRESERVE THE ORIGINAL (NON-NEGOTIABLE):
- Copy the EXACT original sentences from the CV. Do NOT rewrite, rephrase, or shorten them.
- You may ONLY: swap 1-3 words per bullet, insert a keyword, change the title/headline.
- NEVER remove content. NEVER shorten a bullet. NEVER summarize.
- If a bullet says "Developed a web application using React and Node.js for internal use" → keep it AS IS or only swap "web application" for "full-stack application" if relevant.
- The candidate must recognize their own CV. If they don't, you failed.
- Keep ALL items in every section — same count as the original (except the one item replaced by the suggested project, if any).

LANGUAGE RULE (mandatory): Write ALL output content in {language}. Every word of every field must be in {language}. Translate content from the original CV if necessary.

SECTION INTEGRITY RULE (CRITICAL — DO NOT VIOLATE):
- Each item MUST stay in the EXACT same section it was in the original CV.
- NEVER move an item from one section to another. School projects stay in the projects section, work experience stays in work experience, extracurricular activities stay in extracurricular, etc.
- If the original CV has a "Projects" section and an "Extracurricular" or "Activities" section, they are DIFFERENT sections. Do NOT mix their contents.
- Skills, programming languages, and tools (like C++, Python, SQL) are NOT section headings. They must appear inside a "Skills" or "Competences" section as items or in bullet points, NEVER as standalone section headings.
- Before outputting, verify: does each item appear under the same section heading as in the original CV?

SUGGESTED PROJECT RULE (STRICT):
- You may add AT MOST 1 (ONE) suggested project. Never more than one.
- If a suggested project is provided, it REPLACES the specific item mentioned in "to_replace" — do NOT add it as an extra item.
- The replacement must go in the SAME section where the replaced item was (e.g., if replacing a project, it goes in the Projects section, not elsewhere).
- If no suggested project is provided, do not invent one.

STRUCTURE RULE: Keep the exact same sections as the original CV (same names, same order, same number of sections). Same number of items per section (minus/plus 0 unless doing the one project replacement). Same number of bullets per item.

CONCISENESS RULE (only if CV exceeds one page):
- Only then, trim the LEAST relevant items (max 1 per section)
- Section headings: short uppercase labels in {language}
- Contact line: keep it on one line separated by | characters

Apply each improvement with the SMALLEST possible change.

Reply ONLY with a valid JSON object (no markdown, no explanation):
{{
  "name": "First Last (from CV)",
  "title": "Optimized headline for the job, in {language}",
  "contact": "email | phone | LinkedIn | GitHub (from CV, one line)",
  "change_percentage": <integer 0-100 — estimated percentage of text that was modified vs original>,
  "sections": [
    {{
      "heading": "SECTION NAME IN UPPERCASE IN {language}",
      "items": [
        {{
          "title": "Degree / Job title / Project name",
          "subtitle": "School / Company / Tech stack",
          "date": "2022 - 2024",
          "bullets": ["ORIGINAL bullet with at most 1-2 words swapped", "Second ORIGINAL bullet"]
        }}
      ]
    }}
  ]
}}

IMPORTANT: "heading" must be a real section name (like "EDUCATION", "EXPERIENCE", "PROJECTS", "SKILLS", "ACTIVITIES"). It must NEVER be a skill name (like "C++", "Python", "SQL"), a company name, or any other non-section text.

Use only plain ASCII-compatible characters. Replace special typographic characters:
- Use straight apostrophe ' not curly '
- Use hyphen - not en dash or em dash
- Use ... not ellipsis character
- Do NOT use bullet character, arrows, or other symbols in the content — bullets are added by the renderer"""


def _build_rewrite_prompt(language: str) -> str:
    """Construit le prompt de réécriture avec la langue cible injectée."""
    lang_name = _LANGUAGE_NAMES.get(language, _LANGUAGE_NAMES["fr"])
    return _REWRITE_PROMPT_TEMPLATE.format(language=lang_name)


def _safe_text(text: str) -> str:
    """
    Normalise le texte pour les polices built-in fpdf2 (encodage cp1252/WinAnsi).
    Remplace les caractères Unicode hors cp1252 par leurs équivalents ASCII.
    """
    # Remplacement des caractères typographiques fréquents dans les CV
    replacements = {
        '\u2019': "'",    # right single quotation mark '
        '\u2018': "'",    # left single quotation mark '
        '\u201c': '"',    # left double quotation mark "
        '\u201d': '"',    # right double quotation mark "
        '\u2014': '-',    # em dash
        '\u2013': '-',    # en dash
        '\u2026': '...',  # ellipsis
        '\u00b7': '-',    # middle dot
        '\u25cf': '',     # black circle (bullet décoratif)
        '\u25aa': '',     # black small square
        '\u25ba': '>',    # right-pointing pointer
        '\u2022': '',     # bullet point (on l'enlève, le renderer ajoute le sien)
        '\u2192': '->',   # rightwards arrow
        '\u00a0': ' ',    # non-breaking space
        '\u2011': '-',    # non-breaking hyphen
        '\u00b0': ' ',    # degree sign (rare dans un CV)
    }
    for char, replacement in replacements.items():
        text = text.replace(char, replacement)
    # Encodage cp1252 — couvre tous les caractères français (é, è, ç, œ, etc.)
    return text.encode('cp1252', errors='replace').decode('cp1252')


def _get_async_client() -> anthropic.AsyncAnthropic:
    """Retourne un client Anthropic async."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY manquante.")
    return anthropic.AsyncAnthropic(api_key=api_key)


async def _rewrite_cv_as_json(
    cv_text: str,
    improvements: list[CVImprovement],
    suggested_project: Optional[SuggestedProject],
    language: str = "fr",
) -> dict:
    """Demande à Claude de réécrire le CV en JSON structuré dans la langue choisie."""
    client = _get_async_client()

    improvements_text = "\n".join(
        f"- [{item.category}] {item.suggestion}"
        for item in improvements
    )

    project_text = ""
    if suggested_project:
        project_text = (
            f"\n=== PROJECT TO ADD ===\n"
            f"Replace: {suggested_project.to_replace}\n"
            f"Title: {suggested_project.title}\n"
            f"Description: {suggested_project.description}\n"
            f"Stack: {', '.join(suggested_project.tech_stack)}\n"
        )

    user_message = (
        f"=== ORIGINAL CV ===\n{cv_text}\n\n"
        f"=== IMPROVEMENTS TO APPLY ===\n{improvements_text}"
        f"{project_text}"
    )

    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=3000,
        system=[{
            "type": "text",
            "text": _build_rewrite_prompt(language),
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{"role": "user", "content": user_message}],
    )

    raw_json = message.content[0].text.strip()
    raw_json = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw_json, flags=re.MULTILINE).strip()

    try:
        return json.loads(raw_json)
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"Claude n'a pas retourné un JSON valide : {raw_json[:200]}"
        ) from exc


def _build_pdf(cv_data: dict) -> bytes:
    """
    Génère un PDF une page avec marges étroites et mise en page compacte.
    Polices : Helvetica (built-in, cp1252, couvre FR + EN).
    """
    pdf = FPDF()
    pdf.add_page()

    # Marges étroites pour maximiser l'espace
    L_MARGIN = 12
    R_MARGIN = 12
    T_MARGIN = 12
    pdf.set_margins(L_MARGIN, T_MARGIN, R_MARGIN)
    pdf.set_auto_page_break(auto=True, margin=10)
    pdf.set_y(T_MARGIN)

    page_w = 210 - L_MARGIN - R_MARGIN  # largeur utile A4 = 186mm

    # ---- En-tête : Nom ----
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(25, 25, 25)
    pdf.cell(0, 7, _safe_text(cv_data.get("name", "")), ln=True, align="C")

    # ---- Titre / Headline ----
    pdf.set_font("Helvetica", "I", 10)
    pdf.set_text_color(55, 105, 185)
    pdf.cell(0, 5, _safe_text(cv_data.get("title", "")), ln=True, align="C")

    # ---- Contact ----
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 4, _safe_text(cv_data.get("contact", "")), ln=True, align="C")

    # ---- Séparateur principal ----
    pdf.ln(2)
    pdf.set_draw_color(55, 105, 185)
    pdf.set_line_width(0.7)
    pdf.line(L_MARGIN, pdf.get_y(), 210 - R_MARGIN, pdf.get_y())
    pdf.ln(3)

    # ---- Sections ----
    for section in cv_data.get("sections", []):
        heading = _safe_text(section.get("heading", "").upper())

        # Titre de section
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(55, 105, 185)
        pdf.cell(0, 5, heading, ln=True)

        # Ligne fine sous le titre
        pdf.set_draw_color(175, 205, 240)
        pdf.set_line_width(0.25)
        pdf.line(L_MARGIN, pdf.get_y(), 210 - R_MARGIN, pdf.get_y())
        pdf.ln(2)

        for item in section.get("items", []):
            title    = _safe_text(item.get("title", ""))
            date     = _safe_text(item.get("date", ""))
            subtitle = _safe_text(item.get("subtitle", ""))

            # Titre de l'item (gauche) + date (droite) sur la même ligne
            pdf.set_font("Helvetica", "B", 8.5)
            pdf.set_text_color(25, 25, 25)
            pdf.cell(page_w - 28, 4.5, title, ln=False)
            pdf.set_font("Helvetica", "", 7.5)
            pdf.set_text_color(100, 100, 100)
            pdf.cell(28, 4.5, date, ln=True, align="R")

            # Sous-titre
            if subtitle:
                pdf.set_font("Helvetica", "I", 7.5)
                pdf.set_text_color(85, 85, 85)
                pdf.cell(0, 3.5, subtitle, ln=True)

            # Bullets — tiret simple, pas de caractère spécial
            pdf.set_font("Helvetica", "", 7.5)
            pdf.set_text_color(40, 40, 40)
            for bullet in item.get("bullets", []):
                clean = _safe_text(bullet.strip())
                if not clean:
                    continue
                pdf.set_x(L_MARGIN + 3)
                pdf.multi_cell(page_w - 3, 3.8, f"- {clean}")

            pdf.ln(1.5)

        pdf.ln(2)

    return bytes(pdf.output())


def _cv_json_to_preview_text(cv_data: dict) -> str:
    """
    Convertit le JSON structuré du CV en texte lisible et éditable.
    Format : en-tête, puis sections avec tirets pour les bullets.
    """
    lines: list[str] = []

    # En-tête
    lines.append(cv_data.get("name", ""))
    lines.append(cv_data.get("title", ""))
    lines.append(cv_data.get("contact", ""))

    for section in cv_data.get("sections", []):
        lines.append("")
        lines.append(section.get("heading", "").upper())

        for item in section.get("items", []):
            title    = item.get("title", "")
            date     = item.get("date", "")
            subtitle = item.get("subtitle", "")

            # Titre + date sur la même ligne séparés par " | "
            lines.append(f"{title}  |  {date}" if date else title)
            if subtitle:
                lines.append(f"  {subtitle}")
            for bullet in item.get("bullets", []):
                lines.append(f"  - {bullet}")

        lines.append("")

    return "\n".join(lines).strip()


def _render_cv_pdf(
    text: str,
    *,
    name_size: float = 16,
    title_size: float = 10,
    contact_size: float = 8,
    heading_size: float = 9,
    item_title_size: float = 8.5,
    body_size: float = 7.5,
    subtitle_size: float = 7.5,
    name_h: float = 7,
    title_h: float = 5,
    contact_h: float = 4,
    heading_h: float = 5,
    item_h: float = 4.5,
    bullet_h: float = 3.8,
    subtitle_h: float = 3.5,
    section_gap: float = 2,
    item_gap: float = 1.5,
    blank_gap: float = 2,
    sep_gap_before: float = 2,
    sep_gap_after: float = 3,
    heading_gap: float = 2,
    margin: float = 12,
    bottom_margin: float = 10,
    max_pages: int = 1,
) -> tuple[bytes, int]:
    """
    Rendu interne du CV en PDF avec tailles parametrables.
    Retourne (pdf_bytes, nombre_de_pages).
    """
    L, T, R = margin, margin, margin
    pdf = FPDF()
    pdf.add_page()
    pdf.set_margins(L, T, R)
    pdf.set_auto_page_break(auto=True, margin=bottom_margin)
    pdf.set_y(T)

    usable_w = pdf.epw
    lines = text.split('\n')

    # Les 3 premieres lignes non vides = en-tete
    header_done = False
    header_count = 0
    body_lines: list[str] = []

    for line in lines:
        if not header_done:
            stripped = line.strip()
            if stripped:
                if header_count == 0:
                    pdf.set_font("Helvetica", "B", name_size)
                    pdf.set_text_color(25, 25, 25)
                    pdf.set_x(L)
                    pdf.multi_cell(usable_w, name_h, _safe_text(stripped), align="C")
                elif header_count == 1:
                    pdf.set_font("Helvetica", "I", title_size)
                    pdf.set_text_color(55, 105, 185)
                    pdf.set_x(L)
                    pdf.multi_cell(usable_w, title_h, _safe_text(stripped), align="C")
                elif header_count == 2:
                    pdf.set_font("Helvetica", "", contact_size)
                    pdf.set_text_color(100, 100, 100)
                    pdf.set_x(L)
                    pdf.multi_cell(usable_w, contact_h, _safe_text(stripped), align="C")
                header_count += 1
                if header_count == 3:
                    pdf.ln(sep_gap_before)
                    pdf.set_draw_color(55, 105, 185)
                    pdf.set_line_width(0.7)
                    pdf.line(L, pdf.get_y(), 210 - R, pdf.get_y())
                    pdf.ln(sep_gap_after)
                    header_done = True
        else:
            body_lines.append(line)

    # Corps du CV
    for line in body_lines:
        stripped = line.strip()

        if not stripped:
            pdf.ln(blank_gap)
            continue

        # Section heading
        if (stripped == stripped.upper() and not stripped.startswith('-')
                and '|' not in stripped and len(stripped) > 2
                and any(c.isalpha() for c in stripped)
                and sum(c.isalpha() for c in stripped) >= 3):
            pdf.set_font("Helvetica", "B", heading_size)
            pdf.set_text_color(55, 105, 185)
            pdf.set_x(L)
            pdf.cell(usable_w, heading_h, _safe_text(stripped), ln=True)
            pdf.set_draw_color(175, 205, 240)
            pdf.set_line_width(0.25)
            pdf.line(L, pdf.get_y(), 210 - R, pdf.get_y())
            pdf.ln(heading_gap)

        # Item titre + date
        elif '  |  ' in line and not line.startswith(' '):
            parts = line.split('  |  ', 1)
            title_part = _safe_text(parts[0].strip())
            date_part  = _safe_text(parts[1].strip()) if len(parts) > 1 else ""
            pdf.set_font("Helvetica", "B", item_title_size)
            pdf.set_text_color(25, 25, 25)
            pdf.set_x(L)
            pdf.cell(usable_w - 28, item_h, title_part, ln=False)
            pdf.set_font("Helvetica", "", body_size)
            pdf.set_text_color(100, 100, 100)
            pdf.cell(28, item_h, date_part, ln=True, align="R")

        # Bullet
        elif line.startswith('  -') or line.startswith('\t-'):
            bullet_text = stripped.lstrip('-').strip()
            pdf.set_font("Helvetica", "", body_size)
            pdf.set_text_color(40, 40, 40)
            pdf.set_x(L + 3)
            pdf.multi_cell(usable_w - 3, bullet_h, _safe_text(f"- {bullet_text}"))

        # Sous-titre indente
        elif line.startswith('  ') or line.startswith('\t'):
            pdf.set_font("Helvetica", "I", subtitle_size)
            pdf.set_text_color(85, 85, 85)
            pdf.set_x(L)
            pdf.multi_cell(usable_w, subtitle_h, _safe_text(stripped))

        # Ligne simple
        else:
            pdf.set_font("Helvetica", "B", item_title_size)
            pdf.set_text_color(25, 25, 25)
            pdf.set_x(L)
            pdf.multi_cell(usable_w, item_h, _safe_text(stripped))

    num_pages = pdf.pages_count
    return bytes(pdf.output()), num_pages


def _count_original_pages(text: str) -> int:
    """Estime le nombre de pages du CV original a partir du texte brut."""
    # ~55 lignes non vides par page A4 en moyenne avec ces tailles de police
    non_empty = [l for l in text.strip().split('\n') if l.strip()]
    return max(1, (len(non_empty) + 45) // 46)


def cv_preview_to_pdf(text: str, original_cv_text: str = "") -> bytes:
    """
    Genere un PDF a partir du texte de preview du CV (edite ou non).
    Garantit une seule page sauf si le CV original faisait deja plus d'une page.
    Reduit progressivement les tailles si necessaire.
    """
    # Determiner le nombre de pages autorise
    if original_cv_text:
        max_allowed = _count_original_pages(original_cv_text)
    else:
        max_allowed = 1

    # Niveaux de compression progressifs (du plus aere au plus compact)
    PROFILES = [
        # Niveau 0 : tailles normales
        {},
        # Niveau 1 : reduire les espacements
        {"blank_gap": 1.5, "item_gap": 1, "section_gap": 1.5, "heading_gap": 1.5, "sep_gap_before": 1.5, "sep_gap_after": 2},
        # Niveau 2 : reduire aussi les polices du corps
        {"blank_gap": 1, "item_gap": 0.8, "section_gap": 1, "heading_gap": 1, "sep_gap_before": 1, "sep_gap_after": 1.5,
         "body_size": 7, "subtitle_size": 7, "bullet_h": 3.5, "subtitle_h": 3.2, "item_h": 4},
        # Niveau 3 : polices encore plus petites + marges reduites
        {"blank_gap": 0.8, "item_gap": 0.5, "section_gap": 0.8, "heading_gap": 0.8, "sep_gap_before": 0.8, "sep_gap_after": 1,
         "name_size": 14, "title_size": 9, "contact_size": 7.5, "heading_size": 8.5, "item_title_size": 8,
         "body_size": 6.8, "subtitle_size": 6.8, "name_h": 6, "title_h": 4.5, "contact_h": 3.5,
         "heading_h": 4.5, "item_h": 3.8, "bullet_h": 3.2, "subtitle_h": 3, "margin": 10, "bottom_margin": 8},
        # Niveau 4 : ultra-compact
        {"blank_gap": 0.5, "item_gap": 0.3, "section_gap": 0.5, "heading_gap": 0.5, "sep_gap_before": 0.5, "sep_gap_after": 0.8,
         "name_size": 13, "title_size": 8.5, "contact_size": 7, "heading_size": 8, "item_title_size": 7.5,
         "body_size": 6.5, "subtitle_size": 6.5, "name_h": 5.5, "title_h": 4, "contact_h": 3,
         "heading_h": 4, "item_h": 3.5, "bullet_h": 3, "subtitle_h": 2.8, "margin": 9, "bottom_margin": 7},
    ]

    for profile in PROFILES:
        pdf_bytes, num_pages = _render_cv_pdf(text, max_pages=max_allowed, **profile)
        if num_pages <= max_allowed:
            return pdf_bytes

    # Dernier recours : retourner le PDF meme s'il depasse (ne devrait pas arriver)
    return pdf_bytes


async def generate_cv_preview(
    cv_text: str,
    improvements: list[CVImprovement],
    suggested_project: Optional[SuggestedProject],
    language: str = "fr",
) -> tuple[str, int]:
    """
    Génère le texte de preview éditable du CV amélioré (sans PDF).
    Étape 1 du flow éditable : Claude réécrit → on retourne le texte + % de changement.

    Returns:
        Tuple (texte lisible du CV amélioré, pourcentage de changement estimé).
    """
    cv_data = await _rewrite_cv_as_json(cv_text, improvements, suggested_project, language)
    change_pct = cv_data.get("change_percentage", 0)
    try:
        change_pct = int(change_pct)
    except (TypeError, ValueError):
        change_pct = 0
    return _cv_json_to_preview_text(cv_data), change_pct


def cv_preview_to_docx(text: str) -> bytes:
    """
    Génère un fichier .docx à partir du texte de preview du CV.
    Même logique de parsing que cv_preview_to_pdf mais avec python-docx.
    """
    doc = Document()

    # Marges étroites
    for section in doc.sections:
        section.top_margin = Inches(0.5)
        section.bottom_margin = Inches(0.5)
        section.left_margin = Inches(0.5)
        section.right_margin = Inches(0.5)

    lines = text.split('\n')

    # Les 3 premières lignes non vides = en-tête (nom, titre, contact)
    header_count = 0
    body_lines: list[str] = []
    header_done = False

    for line in lines:
        if not header_done:
            stripped = line.strip()
            if stripped:
                if header_count == 0:
                    p = doc.add_paragraph()
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    run = p.add_run(stripped)
                    run.bold = True
                    run.font.size = Pt(16)
                    run.font.color.rgb = RGBColor(25, 25, 25)
                elif header_count == 1:
                    p = doc.add_paragraph()
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    run = p.add_run(stripped)
                    run.italic = True
                    run.font.size = Pt(10)
                    run.font.color.rgb = RGBColor(55, 105, 185)
                elif header_count == 2:
                    p = doc.add_paragraph()
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    run = p.add_run(stripped)
                    run.font.size = Pt(8)
                    run.font.color.rgb = RGBColor(100, 100, 100)
                header_count += 1
                if header_count == 3:
                    header_done = True
        else:
            body_lines.append(line)

    # Corps du CV
    for line in body_lines:
        stripped = line.strip()

        if not stripped:
            continue

        # Section heading : ALL CAPS, au moins 3 lettres (évite "C++", "3D", etc.)
        if (stripped == stripped.upper() and not stripped.startswith('-')
                and '|' not in stripped and len(stripped) > 2
                and any(c.isalpha() for c in stripped)
                and sum(c.isalpha() for c in stripped) >= 3):
            p = doc.add_paragraph()
            p.space_before = Pt(8)
            p.space_after = Pt(2)
            run = p.add_run(stripped)
            run.bold = True
            run.font.size = Pt(9)
            run.font.color.rgb = RGBColor(55, 105, 185)

        # Item titre + date
        elif '  |  ' in line and not line.startswith(' '):
            parts = line.split('  |  ', 1)
            p = doc.add_paragraph()
            p.space_before = Pt(4)
            p.space_after = Pt(0)
            run = p.add_run(parts[0].strip())
            run.bold = True
            run.font.size = Pt(9)
            if len(parts) > 1:
                run2 = p.add_run(f"  |  {parts[1].strip()}")
                run2.font.size = Pt(8)
                run2.font.color.rgb = RGBColor(100, 100, 100)

        # Bullet
        elif line.startswith('  -') or line.startswith('\t-'):
            bullet_text = stripped.lstrip('-').strip()
            p = doc.add_paragraph(f"- {bullet_text}", style='List Bullet')
            p.space_before = Pt(0)
            p.space_after = Pt(0)
            for run in p.runs:
                run.font.size = Pt(8)

        # Sous-titre indenté
        elif line.startswith('  ') or line.startswith('\t'):
            p = doc.add_paragraph()
            p.space_before = Pt(0)
            p.space_after = Pt(0)
            run = p.add_run(stripped)
            run.italic = True
            run.font.size = Pt(8)
            run.font.color.rgb = RGBColor(85, 85, 85)

        # Ligne simple
        else:
            p = doc.add_paragraph()
            p.space_before = Pt(2)
            run = p.add_run(stripped)
            run.bold = True
            run.font.size = Pt(9)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


async def generate_improved_cv(
    cv_text: str,
    job_title: str,
    improvements: list[CVImprovement],
    suggested_project: Optional[SuggestedProject],
    language: str = "fr",
) -> bytes:
    """
    Génère un CV amélioré en PDF (une page, marges étroites, langue du CV conservée).
    Flow direct sans étape d'édition.

    Returns:
        Bytes du fichier PDF.
    """
    cv_data = await _rewrite_cv_as_json(cv_text, improvements, suggested_project, language)
    return _build_pdf(cv_data)
