-- Table des recherches de contacts sauvegardees
CREATE TABLE IF NOT EXISTS contact_searches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Donnees d'entree
  job_content TEXT NOT NULL,
  job_title TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',

  -- Resultats
  contacts_data JSONB NOT NULL DEFAULT '{}',
  drafted_emails JSONB DEFAULT NULL
);

-- Index pour les requetes par utilisateur (triees par date)
CREATE INDEX IF NOT EXISTS idx_contact_searches_user_date
  ON contact_searches (user_id, created_at DESC);

-- Row Level Security
ALTER TABLE contact_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own contact searches"
  ON contact_searches FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own contact searches"
  ON contact_searches FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own contact searches"
  ON contact_searches FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own contact searches"
  ON contact_searches FOR UPDATE
  USING (auth.uid() = user_id);
