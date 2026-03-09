"""
Service de generation de CV avec templates HTML/CSS via WeasyPrint.
Chaque template correspond a un secteur (finance, tech, creative, general).
Optionnel : l'utilisateur peut choisir un template ou garder le PDF classique (fpdf2).
"""
import os
import re
from pathlib import Path

from jinja2 import Environment, FileSystemLoader

try:
    import weasyprint
    WEASYPRINT_AVAILABLE = True
except (ImportError, OSError):
    weasyprint = None  # type: ignore[assignment]
    WEASYPRINT_AVAILABLE = False
    print("[templates] WeasyPrint non disponible — templates desactives, fpdf2 uniquement.")

# Dossier des templates HTML
_TEMPLATES_DIR = Path(__file__).parent.parent / "templates" / "cv"

# Jinja2 environment
_jinja_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATES_DIR)),
    autoescape=True,
)

# Templates disponibles avec metadonnees
AVAILABLE_TEMPLATES: list[dict] = [
    {
        "id": "finance",
        "name": "Finance & Conseil",
        "description": "Sobre et professionnel. Serif, pas de photo, mise en page dense.",
        "sectors": ["finance", "conseil", "consulting", "banque", "audit", "comptabilite", "assurance", "gestion"],
        "preview_color": "#0d1b2a",
    },
    {
        "id": "tech",
        "name": "Tech & Ingenieur",
        "description": "Moderne et clean. Sans-serif, accents bleus, badges pour les dates.",
        "sectors": ["tech", "informatique", "developpement", "data", "ingenieur", "it", "software", "devops", "cloud", "ia", "machine learning"],
        "preview_color": "#2563eb",
    },
    {
        "id": "creative",
        "name": "Communication & Marketing",
        "description": "Creatif avec sidebar. 2 colonnes, couleurs, competences en tags.",
        "sectors": ["communication", "marketing", "design", "graphisme", "publicite", "media", "journalisme", "evenementiel", "rh", "ressources humaines"],
        "preview_color": "#1e293b",
    },
    {
        "id": "general",
        "name": "Classique polyvalent",
        "description": "Sobre et passe-partout. Ideal quand le secteur n'est pas clair.",
        "sectors": [],
        "preview_color": "#374151",
    },
]

# Sections considerees comme "sidebar" dans le template creative
_SIDEBAR_KEYWORDS = {
    "competences", "skills", "competences techniques", "technical skills",
    "langues", "languages", "centres d'interet", "interests", "hobbies",
    "certifications", "outils", "tools",
}


def suggest_template(job_title: str, job_content: str = "") -> str:
    """
    Suggere un template en fonction du poste et de l'offre.
    Retourne l'id du template le plus adapte.
    """
    text = f"{job_title} {job_content}".lower()

    best_id = "general"
    best_score = 0

    for tmpl in AVAILABLE_TEMPLATES:
        score = sum(1 for keyword in tmpl["sectors"] if keyword in text)
        if score > best_score:
            best_score = score
            best_id = tmpl["id"]

    return best_id


def _prepare_creative_data(cv_data: dict) -> dict:
    """
    Separe les sections en sidebar (competences, langues, interets)
    et main (experience, formation, projets) pour le template creative.
    """
    sections = cv_data.get("sections", [])
    contact = cv_data.get("contact", "")
    contact_parts = [p.strip() for p in contact.split("|") if p.strip()] if contact else []

    skills_section = None
    languages_section = None
    interests_section = None
    main_sections = []

    for section in sections:
        heading_lower = section.get("heading", "").lower().strip()
        if any(kw in heading_lower for kw in ["competence", "skill", "outil", "tool", "certification"]):
            skills_section = section
        elif any(kw in heading_lower for kw in ["langue", "language"]):
            languages_section = section
        elif any(kw in heading_lower for kw in ["interet", "interest", "hobbie", "loisir"]):
            interests_section = section
        else:
            main_sections.append(section)

    return {
        "name": cv_data.get("name", ""),
        "title": cv_data.get("title", ""),
        "contact_parts": contact_parts,
        "skills_section": skills_section,
        "languages_section": languages_section,
        "interests_section": interests_section,
        "main_sections": main_sections,
    }


def render_template_html(cv_data: dict, template_id: str) -> str:
    """Genere le HTML rendu d'un template (sans WeasyPrint)."""
    template_file = f"{template_id}.html"
    if not (_TEMPLATES_DIR / template_file).exists():
        raise ValueError(f"Template '{template_id}' introuvable.")

    template = _jinja_env.get_template(template_file)

    if template_id == "creative":
        context = _prepare_creative_data(cv_data)
    else:
        context = {
            "name": cv_data.get("name", ""),
            "title": cv_data.get("title", ""),
            "contact": cv_data.get("contact", ""),
            "sections": cv_data.get("sections", []),
        }

    return template.render(**context)


def render_template_pdf(cv_data: dict, template_id: str) -> bytes:
    """
    Genere un PDF a partir des donnees CV structurees et d'un template HTML.

    Args:
        cv_data: dict avec name, title, contact, sections[]
        template_id: "finance", "tech", "creative", "general"

    Returns:
        Bytes du PDF genere.

    Raises:
        RuntimeError: Si WeasyPrint n'est pas installe.
        ValueError: Si le template n'existe pas.
    """
    if not WEASYPRINT_AVAILABLE:
        raise RuntimeError(
            "WeasyPrint n'est pas installe. Installe-le avec : pip install weasyprint"
        )

    template_file = f"{template_id}.html"
    if not (_TEMPLATES_DIR / template_file).exists():
        raise ValueError(f"Template '{template_id}' introuvable.")

    template = _jinja_env.get_template(template_file)

    # Preparer les donnees selon le template
    if template_id == "creative":
        context = _prepare_creative_data(cv_data)
    else:
        context = {
            "name": cv_data.get("name", ""),
            "title": cv_data.get("title", ""),
            "contact": cv_data.get("contact", ""),
            "sections": cv_data.get("sections", []),
        }

    html_content = template.render(**context)

    # Generer le PDF via WeasyPrint
    html_doc = weasyprint.HTML(string=html_content)
    pdf_bytes = html_doc.write_pdf()

    return pdf_bytes


def parse_preview_text_to_cv_data(text: str) -> dict:
    """
    Parse le texte de preview (format plain text) en dict structure
    compatible avec les templates WeasyPrint.
    Meme logique de parsing que cv_preview_to_pdf dans cv_generator.py.
    """
    lines = text.strip().split("\n")
    if len(lines) < 2:
        return {"name": text.strip(), "title": "", "contact": "", "sections": []}

    # Header : 3 premieres lignes non vides
    non_empty = [l for l in lines if l.strip()]
    name = non_empty[0].strip() if len(non_empty) > 0 else ""
    title = non_empty[1].strip() if len(non_empty) > 1 else ""
    contact = non_empty[2].strip() if len(non_empty) > 2 else ""

    # Detecter si la 2e ligne est un contact (contient @ ou |)
    if title and ("@" in title or "|" in title):
        contact = title
        title = ""

    # Trouver ou commence le premier heading
    header_end = 0
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue
        if _is_section_heading(stripped) and i > 0:
            header_end = i
            break
    if header_end == 0:
        header_end = min(3, len(lines))

    # Parser les sections
    sections: list[dict] = []
    current_section: dict | None = None
    current_item: dict | None = None

    for line in lines[header_end:]:
        stripped = line.strip()

        if not stripped:
            continue

        if _is_section_heading(stripped):
            if current_item and current_section:
                current_section["items"].append(current_item)
                current_item = None
            if current_section:
                sections.append(current_section)
            current_section = {"heading": stripped, "items": []}
            continue

        if not current_section:
            continue

        # Date pattern : "Title  |  Date"
        date_match = re.match(r"^(.+?)\s{2,}\|\s{2,}(.+)$", stripped)
        if date_match and not line.startswith("  "):
            if current_item:
                current_section["items"].append(current_item)
            current_item = {
                "title": date_match.group(1).strip(),
                "subtitle": "",
                "date": date_match.group(2).strip(),
                "bullets": [],
            }
            continue

        # Bullet
        if stripped.startswith("- ") or stripped.startswith("- "):
            bullet_text = stripped[2:].strip()
            if current_item:
                current_item["bullets"].append(bullet_text)
            else:
                # Bullet sans item parent — creer un item implicite
                current_item = {"title": "", "subtitle": "", "date": "", "bullets": [bullet_text]}
            continue

        # Subtitle (indented, no dash)
        if line.startswith("  ") and current_item and not current_item.get("subtitle"):
            current_item["subtitle"] = stripped
            continue

        # Sinon, c'est probablement un titre d'item sans date
        if not line.startswith("  "):
            if current_item:
                current_section["items"].append(current_item)
            current_item = {"title": stripped, "subtitle": "", "date": "", "bullets": []}
        elif current_item:
            # Ligne indentee supplementaire — ajouter comme bullet
            current_item["bullets"].append(stripped)

    # Finaliser
    if current_item and current_section:
        current_section["items"].append(current_item)
    if current_section:
        sections.append(current_section)

    return {
        "name": name,
        "title": title,
        "contact": contact,
        "sections": sections,
    }


def _is_section_heading(text: str) -> bool:
    """Detecte si une ligne est un heading de section (ALL CAPS, 3+ lettres)."""
    if not text or text != text.upper():
        return False
    if text.startswith("-") or text.startswith("  "):
        return False
    if "|" in text:
        return False
    alpha_count = sum(1 for c in text if c.isalpha())
    return alpha_count >= 3
