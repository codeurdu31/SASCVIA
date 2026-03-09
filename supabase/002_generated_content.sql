-- Ajout des colonnes pour sauvegarder le contenu genere (CV, LM, contacts, emails)
ALTER TABLE candidatures
  ADD COLUMN IF NOT EXISTS generated_cv_text TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cover_letter_text TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS contacts_data JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS drafted_emails JSONB DEFAULT NULL;

-- Politique UPDATE (necessaire pour mettre a jour le contenu genere apres l'analyse initiale)
CREATE POLICY "Users can update their own candidatures"
  ON candidatures FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

