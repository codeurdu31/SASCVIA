"""
Service d'extraction de texte depuis un fichier PDF (CV).
Utilise pypdf — aucun appel API externe ici, traitement local uniquement.
"""
import io
from pypdf import PdfReader


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """
    Extrait tout le texte brut d'un PDF reçu en bytes.

    Args:
        file_bytes: Contenu binaire du fichier PDF.

    Returns:
        Texte concaténé de toutes les pages, séparées par des sauts de ligne.

    Raises:
        ValueError: Si le PDF est vide ou illisible.
    """
    reader = PdfReader(io.BytesIO(file_bytes))

    if len(reader.pages) == 0:
        raise ValueError("Le PDF ne contient aucune page.")

    pages_text: list[str] = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pages_text.append(text.strip())

    full_text = "\n\n".join(pages_text)

    if not full_text.strip():
        raise ValueError("Impossible d'extraire du texte depuis ce PDF (PDF scanné ?).")

    return full_text
