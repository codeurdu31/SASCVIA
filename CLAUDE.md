# ProjetSASIA — Job Application AI Assistant

## Description du projet
SaaS IA qui aide les candidats à postuler efficacement.

### Fonctionnalités implémentées

**2 onglets** en haut de page : "Candidature" et "Entretien"

#### Onglet Candidature
- **2 modes d'entree CV** (toggle) :
  - "Importer mon CV (PDF)" : upload classique
  - "Creer mon CV de zero" : formulaire guidé (infos perso, formation, expériences, projets, compétences, langues, centres d'intérêt) → génère un texte CV structuré
  - Bouton s'adapte : "Analyser mon CV" (upload) / "Analyser mon profil" (formulaire)
- **Import d'offre par URL** : champ URL + bouton "Importer" (LinkedIn, Indeed, WTTJ, etc.) — extraction automatique du texte via scraping (httpx + BeautifulSoup, JSON-LD prioritaire)
- Collage offre d'emploi (textarea)
- **Analyse de compatibilité CV ↔ offre** : note /10 au dixième (ex: 7.6/10) objective (Sonnet + prompt renforcé)
  - Critères contenu : Titre (1pt), Compétences techniques (2.5pt), Projets (3pt), Mots-clés (2pt), Formation (1.5pt)
  - Notation par comptage : (nb correspondances / nb demandées) * points du critère
  - Jamais de 5.0/10 par défaut — chaque dixième justifié
- **Projet suggéré** (postes techniques) : projet réalisable 2-4 jours
- **CV amélioré éditable + PDF/DOCX** (Sonnet) : modifications minimales ciblées (quelques mots/keywords) → texte éditable → PDF 1 page (fpdf2) ou Word (.docx)
- **Prévisualisation PDF en ligne** : iframe intégrée pour voir le rendu PDF avant téléchargement (CV + LM)
- **Re-scoring en temps réel** : bouton pour re-analyser le score après édition du CV amélioré
- **Guide de modification** : bouton "Copier" sur chaque amélioration pour l'appliquer soi-même dans son CV original
- **Lettre de motivation éditable + PDF/DOCX** (Sonnet) : LM courte (3 paragraphes concis) → textarea → PDF pro 1 page ou Word (.docx)
- **Sélection de langue** (FR / EN / ES / DE / PT) pour CV + LM
- **Contacts pertinents & emails** (disponible indépendamment de l'analyse CV) :
  - Bouton "Trouver les contacts" à côté de "Analyser mon CV" (actif dès que l'offre est collée)
  - Recherche 2 phases : web_search Opus + structuration Haiku (min 3 contacts)
  - Règles contacts : personnes en poste actuellement (pas d'anciens employés), pas de stagiaires/alternants, pas de dirigeants
  - Vérification email Hunter.io : badge "vérifié" (vert) si Hunter confirme, "estimé" (orange) sinon
  - Emails de networking courts (max 120 mots), éditables, bouton copier

#### Onglet Entretien
- **Sélecteur de source** : 3 options pour charger les données
  - "Analyse en cours" : réutilise le CV + offre de l'onglet Candidature (si analyse déjà faite)
  - "Depuis l'historique" : charge une ancienne candidature sauvegardée
  - "Importer manuellement" : upload CV + coller offre (comportement classique)
- Compétences supplémentaires (optionnel)
- **Évaluation du niveau** du candidat par rapport au poste
- **Plan de révision** (5-8 sujets) classés par priorité (critique/important/bonus) :
  - Pourquoi c'est important, ce qu'il faut savoir, niveau actuel
  - 2-3 ressources réelles (YouTube, sites web) avec URLs
  - Cartes dépliables avec code couleur par priorité
- **Questions d'entretien** (10-15) : fit + techniques + cas pratiques
  - Difficulté (facile/moyen/difficile), conseils, exemple de réponse masquable
- Backend : POST /interview/prepare (Sonnet)
- Schemas : InterviewPrepRequest/Response, StudyTopic, StudyResource, InterviewQuestion

#### Authentification, accès & historique
- **Connexion Google** via Supabase Auth (OAuth, écran de consentement Google Cloud)
- **Contrôle d'accès par invitation** : après connexion Google, l'utilisateur doit être approuvé par l'admin
  - Statuts : `unknown` → `pending` (demande envoyée) → `approved` / `denied`
  - `AccessGate.tsx` : gate qui vérifie le statut avant d'afficher l'app
  - Notification email (SMTP Gmail) envoyée à l'admin à chaque nouvelle demande
  - Email de confirmation envoyé à l'utilisateur quand approuvé
  - `AdminPanel.tsx` : panneau admin (visible dans UserMenu pour l'admin) pour accepter/refuser les demandes
  - Backend : `routes/access.py` + `services/email_notifier.py`, stockage JSON (`backend/data/access.json`)
  - Admin identifié par `ADMIN_EMAIL` dans `.env` (défaut : `simonskydu31@gmail.com`)
- **UserMenu** : avatar + menu déroulant (Mes candidatures, Gérer les accès [admin], Se déconnecter)
- **Sauvegarde automatique** : chaque analyse est enregistrée dans Supabase (table `candidatures` avec RLS)
- **Historique "Mes candidatures"** : panel modal listant les analyses passées (poste, entreprise, score, date)
- **Rechargement complet** : clic sur une candidature → restaure CV, offre, résultats, améliorations, projet suggéré
- **Bouton "Démarrer une nouvelle candidature"** : reset complet du formulaire
- **Suppression** : bouton supprimer sur chaque entrée de l'historique

#### UI / UX
- **Dark mode** : toggle flottant en haut à droite, persisté dans localStorage, respecte `prefers-color-scheme` au premier chargement
- **Device preview** : toggle Desktop/Mobile pour simuler le rendu sur mobile (max-width 390px)
- **Loading skeletons** : shimmer animation pendant l'analyse CV (remplace les spinners pour le résultat principal)
- Tailwind `darkMode: "class"` — toutes les classes dark:* appliquées sur tous les composants

### Fonctionnalités à venir
- Envoi direct des emails depuis l'app
- Dashboard admin école (stats agrégées, suivi par promo)
- Multi-tenant : branding par école (logo, couleurs)
- **Entretien simulé IA** (onglet Entretien) :
  - **Mode vidéo** : face caméra avec l'IA, l'IA pose des questions oralement, écoute la réponse de l'utilisateur, note chaque réponse, puis passe à la suivante. À la fin, bilan du niveau + axes de travail.
  - **Mode écrit** : questions affichées une par une avec timer, l'utilisateur tape sa réponse. Notation et bilan identiques.
  - Questions adaptées à l'offre (fit, technique, cas pratique)
- **Dashboard candidat + veille offres** (inspiration [Postuleo](https://postuleo.be/fr/)) :
  - Réception automatique d'offres pertinentes dès leur publication, matchées au CV et aux critères de recherche du candidat (poste, secteur, localisation, etc.)
  - Suivi des candidatures en cours : statut (envoyée, relancée, entretien, refus…), timeline, rappels
  - Vue centralisée type kanban ou liste avec filtres

## Stack technique
- Backend : Python FastAPI (`/backend`)
- Frontend : Next.js React (`/frontend`)
- Base de données : Supabase (PostgreSQL + Auth + Storage + RLS)
- Auth : Supabase Auth avec Google OAuth (Google Cloud Console)
- Paiements : Stripe (prévu)
- Déploiement : Railway (backend) + Vercel (frontend)

## APIs externes
- Anthropic API — stratégie coût/qualité (optimisée) :
  - **Opus (claude-opus-4-6)** : recherche web contacts phase 1 uniquement (web_search)
  - **Sonnet (claude-sonnet-4-6)** : analyse CV ↔ offre (scoring, prompt renforcé), génération CV, lettre de motivation, préparation entretien
  - **Haiku (claude-haiku-4-5-20251001)** : structuration JSON contacts (phase 2), rédaction emails networking, résumé CV pour emails
  - **Prompt caching** : `cache_control: {"type": "ephemeral"}` sur tous les system prompts (scoring, CV, LM, emails, contacts)
- Anthropic web_search_20250305 : recherche web temps réel pour contacts (max_uses=5, beta header requis)
- Hunter.io : vérification d'emails professionnels (GET /v2/email-verifier)
- Apify : scraping LinkedIn (prévu)

## Quotas
- Limites personnalisées par utilisateur (stockées dans `access.json`) :
  - Admin : illimité (9999)
  - Amis approuvés : 20/mois par défaut (modifiable par l'admin)
- Backend : `services/quota.py` — stockage fichier JSON (`backend/data/quotas.json`) + mémoire
- Quota personnalisé récupéré depuis `routes/access.py` → `get_user_quota_limit()`
- Route : `GET /quota/` — retourne `{used, limit, remaining}`
- Header `X-User-Email` envoyé par le frontend sur les routes protégées
- HTTP 429 si quota dépassé

## Règles de code
- Python avec types stricts (type hints partout)
- Commentaires en français
- Variables et fonctions en anglais
- Jamais de clés API hardcodées, toujours via .env
- Un fichier .env.example à jour à chaque nouvelle variable

## Règles CV généré (fpdf2)
- Une seule page, marges 12mm, police Helvetica (cp1252)
- Langue = celle choisie par l'utilisateur (FR/EN/ES/DE/PT)
- **Réécriture ultra-conservatrice** : ne JAMAIS supprimer de contenu, ne modifier que 1-3 mots par bullet, garder toutes les phrases originales
- **Intégrité des sections** : chaque item reste dans sa section d'origine (projets dans projets, activités extra dans activités extra, etc.). JAMAIS de mélange entre sections.
- **Projet suggéré** : maximum 1 seul nouveau projet, qui REMPLACE un item existant peu pertinent (celui de `to_replace`). Ne jamais en ajouter plusieurs.
- **Détection des titres de section** : le parser PDF/DOCX exige au moins 3 lettres alphabétiques pour traiter un texte ALL CAPS comme un heading (évite que "C++", "SQL", "3D" deviennent des titres de section)
- **Pourcentage de changement** : affiché au-dessus de la textarea (vert ≤15%, orange ≤30%, rouge >30%)
- `_safe_text()` encode en cp1252 — couvre tous les accents FR (é, è, ç, œ...)
- Les `?` dans la console Windows sont un artefact terminal, pas un bug PDF
- `multi_cell()` : toujours `pdf.set_x(pdf.l_margin)` avant + `pdf.epw` comme largeur (évite "Not enough horizontal space")
- Tirets `-` pour les bullets (pas de `•`)
- Structure originale du CV conservée, max 3 bullets/item, max 4 items/section

## Règles lettre de motivation (fpdf2)
- Une seule page max, marges 25mm latérales, 20mm haut
- 3 paragraphes courts (2-3 phrases chacun), pas de bullet points
- Mise en page pro : en-tête candidat gris, objet en gras, signature en gras
- Ligne décorative en bas de page
- Affichage améliorations : comparaison côte à côte (rouge "Actuellement" / vert "À modifier")

## Export Word (.docx) — python-docx
- `cv_preview_to_docx()` dans `services/cv_generator.py` — même parsing que le PDF
- `cover_letter_to_docx()` dans `services/cover_letter.py`
- Routes : `POST /generate-cv/docx-from-text` et `POST /cover-letter/docx`
- Frontend : boutons "Télécharger Word" à côté de "Télécharger PDF"

## Architecture Supabase
- Table `candidatures` : user_id (FK auth.users), cv_text, job_content, job_title, company, score_current, score_potential, strengths (JSONB), improvements (JSONB), summary, suggested_project (JSONB)
- RLS activé : chaque user ne voit/insère/supprime que ses propres données
- SQL de migration : `supabase/001_candidatures.sql`

## Structure frontend (ajouts auth)
```
/frontend
  lib/supabase.ts              # Client Supabase (NEXT_PUBLIC_SUPABASE_URL + ANON_KEY)
  components/
    AuthProvider.tsx            # Context React session Google (signIn, signOut)
    UserMenu.tsx                # Bouton connexion / avatar + menu déroulant
    HistoryPanel.tsx            # Modal historique candidatures + rechargement
  .env.local                   # NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
```

## Contexte développeur
- Solo developer, étudiant ingénieur en finance (ESILV Paris)
- Objectif : SaaS B2B vendu aux écoles (licence + abonnement)
- Public cible : étudiants via leurs écoles (France d'abord)
