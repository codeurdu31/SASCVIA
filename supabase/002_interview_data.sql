-- Ajout des colonnes pour stocker les données d'entretien dans l'historique
ALTER TABLE candidatures
  ADD COLUMN IF NOT EXISTS interview_overview JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS interview_topic_details JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS interview_questions JSONB DEFAULT NULL;
