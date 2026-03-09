-- Ajout du statut de suivi des candidatures
-- Valeurs : saved, applied, relaunched, interview, offer, rejected
ALTER TABLE candidatures
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'saved';
