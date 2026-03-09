-- Table des candidatures sauvegardées
CREATE TABLE IF NOT EXISTS candidatures (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Données d'entrée
  cv_text TEXT NOT NULL,
  job_content TEXT NOT NULL,

  -- Résultats de l'analyse
  job_title TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  score_current REAL NOT NULL DEFAULT 0,
  score_potential REAL NOT NULL DEFAULT 0,
  strengths JSONB NOT NULL DEFAULT '[]',
  improvements JSONB NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL DEFAULT '',
  suggested_project JSONB DEFAULT NULL
);

-- Index pour les requêtes par utilisateur (triées par date)
CREATE INDEX IF NOT EXISTS idx_candidatures_user_date
  ON candidatures (user_id, created_at DESC);

-- Row Level Security : chaque utilisateur ne voit que ses propres candidatures
ALTER TABLE candidatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own candidatures"
  ON candidatures FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own candidatures"
  ON candidatures FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own candidatures"
  ON candidatures FOR DELETE
  USING (auth.uid() = user_id);



│ Priorité │           Fonctionnalité            │          Qui l'a          │   Effort   │
  ├──────────┼─────────────────────────────────────┼───────────────────────────┼────────────┤
  │ HAUTE    │ Templates visuels CV (5-10 designs) │ Kickresume, Enhancv, Teal │ Moyen      │
  ├──────────┼─────────────────────────────────────┼───────────────────────────┼────────────┤
  │ HAUTE    │ Job tracker Kanban                  │ Teal, Careerflow          │ Moyen      │
  ├──────────┼─────────────────────────────────────┼───────────────────────────┼────────────┤
  │ HAUTE    │ Extension Chrome (sauver offres)    │ Teal, Simplify, Jobright  │ Elevé      │
  ├──────────┼─────────────────────────────────────┼───────────────────────────┼────────────┤
  │ HAUTE    │ Import LinkedIn (pré-remplir CV)    │ Kickresume, Careerflow    │ Faible     │
  ├──────────┼─────────────────────────────────────┼───────────────────────────┼────────────┤
  │ MOYENNE  │ Optimisation profil LinkedIn        │ Resume Worded, Careerflow │ Moyen      │
  ├──────────┼─────────────────────────────────────┼───────────────────────────┼────────────┤
  │ MOYENNE  │ Mock interview vidéo/voix           │ Final Round AI            │ Elevé      │
  ├──────────┼─────────────────────────────────────┼───────────────────────────┼────────────┤
  │ MOYENNE  │ Envoi direct des emails             │ PitchMeAI                 │ Moyen      │
  ├──────────┼─────────────────────────────────────┼───────────────────────────┼────────────┤
  │ BASSE    │ Auto-apply multi-plateformes        │ LazyApply, Sonara         │ Très élevé │
  ├──────────┼─────────────────────────────────────┼───────────────────────────┼────────────┤
  │ BASSE    │ Copilot temps réel en entretien     │ Final Round AI            │ Très élevé │