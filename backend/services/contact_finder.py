"""
Service de recherche de contacts pertinents pour une candidature.

Approche en 3 phases :
0. Phase 0 — Pre-extraction : Haiku extrait equipe, departement, entreprise de l'offre.
1. Phase 1 — Recherche web ciblee : Opus cherche avec web_search en cercles concentriques,
   guide par un system prompt "search coach" et les infos pre-extraites.
2. Phase 2 — Structuration : Haiku parse le texte brut en JSON structure.

Si web_search echoue : fallback training data.
"""
import json
import os
import re
from urllib.parse import quote

import anthropic
import httpx

from models.schemas import ContactEmailFormat, ContactProfile, FindContactsResponse

_MODEL_OPUS = "claude-opus-4-6"
_MODEL_SONNET = "claude-sonnet-4-6"
_MODEL_HAIKU = "claude-haiku-4-5-20251001"

# Titres a exclure (stagiaires, alternants, grands patrons)
_EXCLUDE_TITLES = re.compile(
    r"\b(stagiaire|intern|alternant|apprenti|apprentice|"
    r"head\s+of|chief|coo|cfo|cto|ceo|c-level|"
    r"managing\s+director|directeur\s+g[eé]n[eé]ral|partner|"
    r"vice[\s-]?president|vp\b)",
    re.IGNORECASE,
)


def _generate_email_from_name(name: str, domain: str) -> str:
    """Genere un email estime a partir du nom et du domaine.
    Ex: 'Jean-Pierre Dupont' + 'vega-is.com' -> 'jean-pierre.dupont@vega-is.com'"""
    if not name or not domain:
        return ""
    import unicodedata
    # Normaliser les accents (é→e, ç→c, etc.)
    normalized = unicodedata.normalize("NFD", name.lower())
    normalized = "".join(c for c in normalized if unicodedata.category(c) != "Mn")
    # Séparer prénom/nom
    parts = normalized.strip().split()
    if len(parts) < 2:
        return ""
    prenom = parts[0]
    nom = parts[-1]
    domain = domain.lstrip("@")
    return f"{prenom}.{nom}@{domain}"


def _linkedin_search_url(name: str, company: str) -> str:
    """Construit un lien de recherche LinkedIn pre-rempli pour verifier le contact."""
    query = quote(f"{name} {company}")
    return f"https://www.linkedin.com/search/results/people/?keywords={query}"


def _get_client() -> anthropic.AsyncAnthropic:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY manquante.")
    return anthropic.AsyncAnthropic(api_key=api_key)


def _extract_text_from_response(response) -> str:
    """Extrait tout le texte des content blocks de la reponse Claude."""
    parts: list[str] = []
    for block in response.content:
        if hasattr(block, "text") and block.text:
            parts.append(block.text)
    return " ".join(parts)


def _parse_json_response(text: str) -> dict:
    """Extrait et parse le JSON de la reponse Claude."""
    clean = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.MULTILINE).strip()
    match = re.search(r"\{[\s\S]*\}", clean)
    if not match:
        return {}
    try:
        return json.loads(match.group())
    except json.JSONDecodeError:
        return {}


def _is_excluded_title(title: str) -> bool:
    """Verifie si un titre de poste doit etre exclu (stagiaire, alternant, grand patron)."""
    if not title:
        return False
    return bool(_EXCLUDE_TITLES.search(title))


# ---------- PHASE 0 : pre-extraction du contexte de l'offre ----------

async def _phase0_extract_context(client: anthropic.AsyncAnthropic, job_content: str) -> dict:
    """Phase 0 : extrait equipe, departement, entreprise, localisation de l'offre.
    Retourne un dict avec les clés : team, department, company, location, domain_hint."""

    print("[contacts] Phase 0 — extraction du contexte de l'offre...")

    r = await client.messages.create(
        model=_MODEL_HAIKU,
        max_tokens=500,
        system=[{
            "type": "text",
            "text": (
                "Tu es un extracteur d'informations. A partir d'une offre d'emploi, "
                "extrais les informations structurelles. Reponds UNIQUEMENT en JSON, sans markdown.\n"
                "Si une info n'est pas trouvee, mets une chaine vide."
            ),
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{"role": "user", "content": (
            f"Offre :\n{job_content[:2000]}\n\n"
            "Extrais en JSON :\n"
            '{"company":"nom exact de l\'entreprise (ex: Credit Agricole CIB)",'
            '"team":"nom exact de l\'equipe mentionnee (ex: Early Detection, Risk Analytics)",'
            '"department":"departement/direction parent (ex: Direction des Risques de Contrepartie)",'
            '"division":"division/pole encore plus large (ex: Direction des Risques)",'
            '"location":"ville/region",'
            '"domain_hint":"domaine email probable (ex: ca-cib.com, bnpparibas.com) — deduis-le du nom de l\'entreprise",'
            '"job_type":"stage|alternance|cdi|cdd"}'
        )}],
    )

    text = _extract_text_from_response(r)
    result = _parse_json_response(text)
    if result:
        print(f"[contacts] Phase 0 OK — entreprise={result.get('company')}, "
              f"equipe={result.get('team')}, dept={result.get('department')}")
    else:
        print(f"[contacts] Phase 0 ERREUR — JSON non parsable: {text[:200]}")
    return result


# ---------- PHASE 1 : recherche web ciblee (avec system prompt coach) ----------

# System prompt qui guide Claude sur COMMENT chercher
_PHASE1_SYSTEM = """Tu es un expert en recherche de contacts professionnels.
Ta mission : trouver des VRAIS employes en poste (CDI/CDD) dans l'equipe ciblee.

METHODE DE RECHERCHE — suis ces etapes dans l'ordre :

ETAPE 1 — Recherches LinkedIn ciblees (PRIORITAIRE) :
Fais des recherches web avec ces formats EXACTS :
- "[nom equipe]" "[entreprise]" site:linkedin.com/in
- "[nom equipe]" "[entreprise]" analyst OR officer OR manager site:linkedin.com/in
- "[departement]" "[entreprise]" manager OR lead site:linkedin.com/in
Exemples concrets : "Early Detection" "Credit Agricole CIB" site:linkedin.com/in

ETAPE 2 — Autres sources (RocketReach, TheOrg, site officiel) :
- "[entreprise]" "[equipe]" site:rocketreach.co OR site:theorg.com
- "[entreprise]" "[departement]" manager OR responsable
- "[entreprise]" equipe OR team "[nom equipe]"

ETAPE 3 — Elargissement si necessaire :
- Si pas assez de resultats, elargis au departement puis a la direction.
- Essaie aussi : "[entreprise]" gerant OR analyst OR manager site:linkedin.com/in
- Essaie des variantes du nom de l'entreprise (acronymes, noms courts).

REGLES ABSOLUES DE FILTRAGE :
1. VERIFIE le titre ACTUEL sur LinkedIn — le poste doit etre le poste ACTUEL, pas un ancien poste.
2. EXCLUS SYSTEMATIQUEMENT : stagiaires, interns, alternants, apprentis — meme s'ils apparaissent dans l'equipe.
3. EXCLUS : Head of, VP, Director, Managing Director, C-level, Partner — trop haut places.
4. GARDE : analyst, senior analyst, officer, associate, manager, team lead, charge de mission.
5. Quand tu vois un profil LinkedIn, lis ATTENTIVEMENT le titre actuel. "Stagiaire Early Detection" = EXCLU.

Pour chaque personne trouvee, donne :
- Nom complet
- Titre ACTUEL exact (tel que sur LinkedIn)
- URL LinkedIn directe si possible
- Cercle : 1 (equipe directe), 2 (departement), 3 (direction)
- Justification courte

Trouve AU MINIMUM 4-5 personnes pour qu'on puisse en selectionner les 3 meilleures.

IMPORTANT — REGLE DE SUCCES :
- Tu DOIS trouver au moins 3 personnes REELLES. Ne jamais abandonner.
- Si LinkedIn ne donne rien, cherche sur RocketReach, TheOrg, Viadeo, le site officiel.
- Si l'equipe exacte ne donne rien, elargis IMMEDIATEMENT au departement.
- Si le departement ne donne rien, elargis a l'entreprise entiere + filtre par metier.
- Pour chaque personne, donne son NOM COMPLET et TITRE ACTUEL — meme si tu n'as pas de lien LinkedIn.

REGLE ANTI-HALLUCINATION ABSOLUE :
- Ne mentionne QUE des personnes que tu as REELLEMENT trouvees dans les resultats de recherche web.
- N'INVENTE JAMAIS un nom, un titre ou un profil. Chaque contact doit provenir d'un resultat de recherche concret.
- Si tu ne trouves personne malgre toutes les tentatives, dis-le clairement. Ne remplis JAMAIS avec des personnes inventees."""


async def _phase1_websearch(
    client: anthropic.AsyncAnthropic,
    job_content: str,
    job_title: str,
    company: str,
    context: dict | None = None,
) -> str:
    """Phase 1 : Claude cherche sur le web avec des requetes ciblees.
    Retourne le texte brut de sa reponse (noms, LinkedIn, emails trouves)."""

    # Construire le message utilisateur avec le contexte pre-extrait
    ctx = context or {}
    team = ctx.get("team", "")
    department = ctx.get("department", "")
    division = ctx.get("division", "")
    domain_hint = ctx.get("domain_hint", "")
    comp = ctx.get("company", "") or company

    # Bloc de contexte structure pour guider la recherche
    context_block = f"ENTREPRISE : {comp}\n"
    if team:
        context_block += f"EQUIPE EXACTE (cercle 1) : {team}\n"
    if department:
        context_block += f"DEPARTEMENT (cercle 2) : {department}\n"
    if division:
        context_block += f"DIRECTION (cercle 3) : {division}\n"
    if domain_hint:
        context_block += f"FORMAT EMAIL PROBABLE : prenom.nom@{domain_hint}\n"

    # Requetes de recherche suggerees
    search_suggestions = ""
    if team and comp:
        search_suggestions = (
            f'\nRECHERCHES SUGGEREES (fais-les dans cet ordre) :\n'
            f'1. "{team}" "{comp}" site:linkedin.com/in\n'
            f'2. "{team}" "{comp}" analyst OR officer OR manager site:linkedin.com/in\n'
        )
        if department:
            search_suggestions += f'3. "{department}" "{comp}" manager OR lead site:linkedin.com/in\n'
        if division:
            search_suggestions += f'4. "{division}" "{comp}" manager site:linkedin.com/in\n'
    elif comp:
        search_suggestions = (
            f'\nRECHERCHES SUGGEREES :\n'
            f'1. "{comp}" "{job_title}" site:linkedin.com/in\n'
            f'2. "{comp}" analyst OR officer OR manager site:linkedin.com/in\n'
        )

    user_msg = (
        f"Voici une offre :\n\n{job_content[:2000]}\n\n"
        f"--- CONTEXTE EXTRAIT ---\n{context_block}\n"
        f"{search_suggestions}\n"
        f"Trouve-moi les personnes les plus pertinentes a contacter pour cette candidature.\n"
        f"Suis la methode decrite dans tes instructions (cercles concentriques).\n"
        f"RAPPEL : EXCLUS les stagiaires/alternants, EXCLUS les Head of/VP/Director/C-level.\n"
        f"Je veux des employes EN POSTE (CDI/CDD) : analysts, officers, managers, team leads."
    )

    print(f"[contacts] Phase 1 — web_search pour '{comp}' / equipe='{team}' / dept='{department}' ...")

    r = await client.messages.create(
        model=_MODEL_SONNET,
        max_tokens=4000,
        system=[{
            "type": "text",
            "text": _PHASE1_SYSTEM,
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{"role": "user", "content": user_msg}],
        tools=[{
            "type": "web_search_20250305",
            "name": "web_search",
            "max_uses": 8,
        }],
        extra_headers={"anthropic-beta": "web-search-2025-03-05"},
    )

    # Log detaille
    block_types = [type(b).__name__ for b in r.content]
    search_count = sum(1 for b in r.content if type(b).__name__ == "WebSearchToolResultBlock")
    print(f"[contacts] Phase 1 OK — {search_count} recherches web, blocks={block_types[:15]}...")

    text = _extract_text_from_response(r)
    print(f"[contacts] Phase 1 texte: {text[:500]}...")
    return text


# ---------- PHASE 2 : structuration JSON ----------

_PHASE2_SYSTEM = """Tu recois le resultat d'une recherche de contacts pour une candidature.
Transforme ce texte en JSON structure. Extrais UNIQUEMENT les informations presentes dans le texte.
N'invente RIEN. N'AJOUTE AUCUN contact qui n'est pas explicitement mentionne dans le texte source.
Si une info n'est pas dans le texte, mets null. Si le texte ne contient aucun vrai contact, retourne une liste vide.

CERCLES DE RECHERCHE (search_circle) — TRES IMPORTANT :
Chaque contact doit etre tague avec son cercle de proximite par rapport au poste :
- search_circle=1 : equipe directe mentionnee dans l'offre (ex: "Early Detection", "Risk Analytics")
- search_circle=2 : departement parent (ex: "Direction des Risques de Contrepartie")
- search_circle=3 : direction/pole plus large (ex: "Direction des Risques")
Deduis le cercle a partir du titre/poste de la personne et du contexte de la recherche.

COMPOSITION IDEALE : 2 contacts du cercle le plus precis + 1 du cercle juste au-dessus.
Inclus TOUS les contacts trouves (meme si >3), je ferai la selection ensuite.

FILTRAGE STRICT :
- EXCLUS toute personne dont le titre contient : stagiaire, intern, alternant, apprenti.
- EXCLUS toute personne dont le titre contient : Head of, VP, Director, Managing Director, C-level, Partner.
- EXCLUS toute personne qui ne travaille PLUS dans l'entreprise (ancien poste, "ex-", "former").
- GARDE : analyst, senior analyst, officer, associate, manager, team lead, charge de mission.

EMAILS — OBLIGATOIRE :
- Pour CHAQUE contact, tu DOIS generer un email estime au format prenom.nom@domaine.com
- Si le domaine email est mentionne dans le contexte, utilise-le.
- Si le domaine n'est pas connu, DEDUIS-LE du nom de l'entreprise (ex: VEGA Investment Solutions → vega-is.com ou vegainvestments.com).
- N'EXCLUS JAMAIS un contact juste parce que tu ne connais pas son email — genere une estimation.
- Le champ "email" ne doit JAMAIS etre vide ou null.

Output JSON uniquement, sans markdown:
{"company_name":"...","team_name":"...","position":"...","location":"...",
"email_format":{"pattern":"prenom.nom","domain":"@domain.com","confidence":0.8,"examples":["a.b@domain.com"]},
"contacts":[{"rank":1,"name":"Prenom Nom","title":"Poste ACTUEL exact tel que trouve",
"email":"prenom.nom@domain.com","linkedin_url":"https://linkedin.com/in/..." ou null,
"reasoning":"Pourquoi contacter cette personne + dans quelle equipe elle est",
"priority_level":"high","seniority":"manager","team_match":0.9,"search_circle":1}],
"search_strategy":"Resume des recherches — cercles explores et requetes utilisees"}
priority_level: "high" (dans l'equipe directe, accessible) | "medium" (departement, un peu plus senior) | "low" (trop haut place ou equipe incertaine)
seniority: "junior"|"mid"|"senior"|"lead"|"manager"|"director"
team_match: 0.9+ si confirme dans l'equipe, 0.7-0.89 si dans le departement, 0.5-0.69 si direction large
search_circle: 1 (equipe directe) | 2 (departement) | 3 (direction/pole)"""


async def _phase2_structure(
    client: anthropic.AsyncAnthropic,
    raw_text: str,
    job_title: str,
    company: str,
    context: dict | None = None,
) -> dict:
    """Phase 2 : transforme le texte brut de phase 1 en JSON structure."""

    print("[contacts] Phase 2 — structuration JSON...")

    # Passer le contexte extrait pour aider au tagging des cercles
    ctx = context or {}
    context_hint = ""
    if ctx.get("team"):
        context_hint += f"Equipe directe (cercle 1) : {ctx['team']}\n"
    if ctx.get("department"):
        context_hint += f"Departement (cercle 2) : {ctx['department']}\n"
    if ctx.get("division"):
        context_hint += f"Direction (cercle 3) : {ctx['division']}\n"

    r = await client.messages.create(
        model=_MODEL_HAIKU,
        max_tokens=2500,
        system=[{
            "type": "text",
            "text": _PHASE2_SYSTEM,
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{"role": "user", "content": (
            f"Entreprise: {company}\nPoste: {job_title}\n"
            f"{context_hint}\n"
            f"Resultat de la recherche:\n{raw_text[:4000]}\n\n"
            "Transforme en JSON. N'invente rien. "
            "EXCLUS les stagiaires/alternants et les Head of/VP/Director. "
            "Inclus TOUS les contacts valides trouves."
        )}],
    )

    text = _extract_text_from_response(r)
    result = _parse_json_response(text)
    if result:
        contacts_count = len(result.get("contacts", []))
        print(f"[contacts] Phase 2 OK — {contacts_count} contacts structures")
    else:
        print(f"[contacts] Phase 2 ERREUR — JSON non parsable: {text[:200]}")
    return result


# ---------- FALLBACK training data ----------

async def _try_training(client: anthropic.AsyncAnthropic, job_content: str, job_title: str, company: str, context: dict | None = None) -> dict:
    """Fallback : utilise la connaissance training data de Claude (sans web_search)."""

    print("[contacts] Fallback training data...")

    ctx = context or {}
    team = ctx.get("team", "")
    department = ctx.get("department", "")

    context_hint = ""
    if team:
        context_hint += f"Equipe exacte : {team}\n"
    if department:
        context_hint += f"Departement : {department}\n"

    r = await client.messages.create(
        model=_MODEL_HAIKU,
        max_tokens=2000,
        messages=[{"role": "user", "content": (
            f"Voici une offre chez {company} ({job_title}):\n{job_content[:2000]}\n\n"
            f"{context_hint}\n"
            f"Trouve-moi les personnes les plus pertinentes a contacter.\n"
            f"STRATEGIE EN CERCLES : cherche d'abord dans l'equipe exacte (cercle 1), "
            f"puis dans le departement parent (cercle 2), puis la direction (cercle 3).\n"
            f"Cible des analysts, officers, associates, managers, team leads.\n"
            f"EXCLUS : stagiaires, alternants, Head of, VP, Director, C-level.\n"
            f"Verifie que chaque personne TRAVAILLE ENCORE dans l'entreprise. "
            f"Utilise uniquement des personnes dont tu es CERTAIN qu'elles existent "
            f"(vues dans tes donnees d'entrainement). "
            f"Trouve aussi leur format email professionnel. "
            f"Si tu n'es pas sur, dis-le clairement.\n\n"
            f"Reponds en JSON:\n"
            f'{{"company_name":"...","team_name":"...","position":"...","location":"...",'
            f'"email_format":{{"pattern":"prenom.nom","domain":"@x.com","confidence":0.6,"examples":["a.b@x.com"]}},'
            f'"contacts":[{{"rank":1,"name":"...","title":"...","email":"...","linkedin_url":null,'
            f'"reasoning":"...","priority_level":"high","seniority":"manager","team_match":0.7,"search_circle":1}}],'
            f'"search_strategy":"Donnees d\'entrainement — verification LinkedIn indispensable"}}'
        )}],
    )
    text = _extract_text_from_response(r)
    result = _parse_json_response(text)
    if result:
        print(f"[contacts] Training data OK — {len(result.get('contacts', []))} contacts")
    return result


# ---------- VERIFICATION EMAIL (Hunter.io) ----------

async def _verify_email_hunter(email: str) -> str | None:
    """Vérifie un email via Hunter.io email-verifier.
    Retourne "valid", "invalid", "unknown" ou None si Hunter indisponible."""
    hunter_key = os.getenv("HUNTER_API_KEY", "")
    if not hunter_key or not email:
        return None

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                "https://api.hunter.io/v2/email-verifier",
                params={"email": email, "api_key": hunter_key},
            )
        if r.status_code != 200:
            print(f"[hunter] Verification echouee pour {email} (HTTP {r.status_code})")
            return None

        data = r.json().get("data", {})
        status = data.get("status", "")  # "valid", "invalid", "unknown", etc.
        print(f"[hunter] {email} -> {status} (score={data.get('score', '?')})")
        # On regroupe les statuts Hunter en 3 catégories
        if status in ("valid", "webmail"):
            return "valid"
        elif status in ("invalid", "disposable"):
            return "invalid"
        else:
            return "unknown"
    except Exception as exc:
        print(f"[hunter] Erreur verification {email}: {exc}")
        return None


# ---------- SELECTION PAR CERCLES CONCENTRIQUES ----------

def _select_contacts_by_circles(all_contacts: list[ContactProfile]) -> list[ContactProfile]:
    """Selectionne 3 contacts selon la stratégie cercles concentriques :
    - 2 du cercle le plus proche possible (équipe directe > département > direction)
    - 1 du cercle juste au-dessus (manager avec influence mais accessible)
    Si pas assez dans un cercle, on complète avec le suivant."""

    if len(all_contacts) <= 3:
        # Pas assez de contacts pour faire une sélection, on garde tout
        for i, c in enumerate(all_contacts):
            c.rank = i + 1
        return all_contacts

    # Trier par cercle (1 en premier) puis par rank original
    by_circle: dict[int, list[ContactProfile]] = {1: [], 2: [], 3: []}
    for c in all_contacts:
        circle = c.search_circle if c.search_circle in (1, 2, 3) else 2
        by_circle[circle].append(c)

    selected: list[ContactProfile] = []

    # Trouver le cercle le plus proche qui a des contacts
    inner_circle = 1
    for circle in (1, 2, 3):
        if by_circle[circle]:
            inner_circle = circle
            break

    # Prendre 2 du cercle le plus proche
    inner_contacts = by_circle[inner_circle]
    selected.extend(inner_contacts[:2])

    # Prendre 1 du cercle juste au-dessus
    outer_circle = inner_circle + 1
    outer_contacts = by_circle.get(outer_circle, [])
    if outer_contacts:
        selected.append(outer_contacts[0])
    elif len(inner_contacts) > 2:
        # Pas de contacts dans le cercle suivant → prendre un 3e du même cercle
        selected.append(inner_contacts[2])
    else:
        # Chercher dans le cercle encore au-dessus
        far_circle = outer_circle + 1
        far_contacts = by_circle.get(far_circle, [])
        if far_contacts:
            selected.append(far_contacts[0])

    # Re-numéroter les rangs
    for i, c in enumerate(selected):
        c.rank = i + 1

    circle_summary = {circle: len(contacts) for circle, contacts in by_circle.items() if contacts}
    print(f"[contacts] Cercles disponibles : {circle_summary} → sélection : "
          f"{[f'cercle {c.search_circle}' for c in selected]}")

    return selected


# ---------- FONCTION PRINCIPALE ----------

async def find_relevant_contacts(
    job_content: str, job_title: str, company: str, method: str = "auto"
) -> FindContactsResponse:
    """
    Trouve les contacts les plus pertinents pour cette candidature.
    Phase 0 : pre-extraction du contexte (equipe, departement, entreprise).
    Phase 1 : recherche web ciblee avec system prompt coach.
    Phase 2 : structuration en JSON.
    Fallback : training data si web_search echoue.
    """
    client = _get_client()
    data: dict = {}
    context: dict = {}

    # 0. Phase 0 : extraire le contexte structure de l'offre
    try:
        context = await _phase0_extract_context(client, job_content)
        # Mettre a jour company/job_title si pas fournis
        if not company and context.get("company"):
            company = context["company"]
        if not job_title and context.get("team"):
            job_title = f"{context.get('team', '')} - {context.get('company', '')}"
    except Exception as exc:
        print(f"[contacts] Phase 0 echouee ({type(exc).__name__}: {exc}) — continue sans contexte")

    # 1. Phase 1 + 2 : recherche web ciblee + structuration
    try:
        raw_text = await _phase1_websearch(client, job_content, job_title, company, context)
        if raw_text and len(raw_text) > 50:
            data = await _phase2_structure(client, raw_text, job_title, company, context)
            if data:
                print("[contacts] Contacts trouves via web_search (3 phases)")
    except Exception as exc:
        print(f"[contacts] web_search echoue ({type(exc).__name__}: {exc})")

    # 2. Pas de fallback training data — on ne veut JAMAIS de contacts inventes.
    #    Si web_search n'a rien trouve, on retourne une liste vide.

    if not data:
        return FindContactsResponse(
            company_name=company,
            team_name="",
            position=job_title,
            contacts=[],
            message=f"Aucun contact trouve pour {company}. Recherche manuelle sur LinkedIn recommandee.",
        )

    # Construire ContactEmailFormat
    ef_data = data.get("email_format") or {}
    email_format: ContactEmailFormat | None = None
    if ef_data and ef_data.get("pattern"):
        email_format = ContactEmailFormat(
            pattern=ef_data.get("pattern", ""),
            confidence=float(ef_data.get("confidence", 0.5)),
            examples=ef_data.get("examples", []),
        )

    # Determiner le domaine email pour generer des emails estimes si necessaire
    ef_data_raw = data.get("email_format") or {}
    fallback_domain = ""
    if ef_data_raw.get("domain"):
        fallback_domain = ef_data_raw["domain"].lstrip("@")
    elif context.get("domain_hint"):
        fallback_domain = context["domain_hint"]

    # Construire TOUS les ContactProfile (pas de limite ici, sélection ensuite)
    all_contacts: list[ContactProfile] = []
    excluded_count = 0
    for c in data.get("contacts", []):
        name = c.get("name", "").strip()
        if not name:
            continue
        # Filtrage code : exclure stagiaires, alternants, grands patrons
        title = c.get("title", "")
        if _is_excluded_title(title):
            print(f"[contacts] EXCLU par filtrage code : {name} ({title})")
            excluded_count += 1
            continue
        # Email : utiliser celui fourni, sinon generer un estime
        email = (c.get("email") or "").strip()
        is_estimated_email = False
        if not email and fallback_domain:
            email = _generate_email_from_name(name, fallback_domain)
            is_estimated_email = True
            print(f"[contacts] Email estime genere pour {name}: {email}")
        elif not email:
            # Derniere tentative : deduire le domaine du nom d'entreprise
            company_slug = re.sub(r"[^a-z0-9]+", "", company.lower())
            if company_slug:
                guessed_domain = f"{company_slug}.com"
                email = _generate_email_from_name(name, guessed_domain)
                is_estimated_email = True
                print(f"[contacts] Email estime (domaine deduit) pour {name}: {email}")
        if not email:
            print(f"[contacts] Contact {name} ignore — impossible de generer un email")
            continue
        linkedin_url = c.get("linkedin_url") or None
        all_contacts.append(ContactProfile(
            rank=int(c.get("rank", len(all_contacts) + 1)),
            name=name,
            title=title,
            email=email,
            linkedin_url=linkedin_url,
            linkedin_search_url=_linkedin_search_url(name, company),
            reasoning=c.get("reasoning", ""),
            priority_level=c.get("priority_level", "medium"),
            seniority=c.get("seniority", "mid"),
            team_match=float(c.get("team_match", 0.5)),
            search_circle=int(c.get("search_circle", 2)),
            is_estimated=is_estimated_email or not bool(linkedin_url),
            source="web_search" if linkedin_url else "claude",
        ))

    if excluded_count:
        print(f"[contacts] {excluded_count} contact(s) exclu(s) par filtrage code")

    # Sélection en cercles concentriques : 2 du cercle le plus proche + 1 du suivant
    contacts = _select_contacts_by_circles(all_contacts)
    print(f"[contacts] Sélection cercles : {len(contacts)}/{len(all_contacts)} contacts retenus")

    # Vérification des emails via Hunter.io
    hunter_key = os.getenv("HUNTER_API_KEY", "")
    if hunter_key and contacts:
        print(f"[contacts] Verification Hunter.io pour {len(contacts)} email(s)...")
        for contact in contacts:
            if contact.email:
                verified = await _verify_email_hunter(contact.email)
                if verified:
                    contact.email_verified = verified
                    if verified == "valid":
                        contact.is_estimated = False

    # Extraire email_domain
    email_domain = ""
    if ef_data.get("domain"):
        email_domain = ef_data["domain"].lstrip("@")
    elif context.get("domain_hint"):
        email_domain = context["domain_hint"]
    elif email_format and email_format.examples:
        try:
            email_domain = email_format.examples[0].split("@")[1]
        except (IndexError, AttributeError):
            pass
    if not email_domain and contacts:
        try:
            email_domain = contacts[0].email.split("@")[1]
        except (IndexError, AttributeError):
            pass

    message: str | None = None
    search_strategy = data.get("search_strategy", "")
    if len(contacts) == 0:
        message = (
            f"Aucun contact trouve pour {company}. "
            "Recherche manuelle sur LinkedIn recommandee."
        )
    elif len(contacts) < 3:
        message = (
            f"Seulement {len(contacts)} contact(s) trouve(s) — complete avec une recherche LinkedIn manuelle."
        )

    return FindContactsResponse(
        company_name=data.get("company_name") or company,
        team_name=data.get("team_name") or context.get("team", ""),
        position=data.get("position") or job_title,
        email_format=email_format,
        contacts=contacts,
        email_domain=email_domain,
        email_pattern=email_format.pattern if email_format else "",
        search_strategy=search_strategy,
        message=message,
    )
