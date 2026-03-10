-- Migration : système de contrôle d'accès par invitation
-- Les utilisateurs doivent être approuvés par l'admin avant de pouvoir utiliser l'app.

CREATE TABLE IF NOT EXISTS users_access (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  name text DEFAULT '',
  avatar_url text DEFAULT '',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  role text DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  quota_limit int DEFAULT 20,
  requested_at timestamptz DEFAULT now(),
  decided_at timestamptz
);

-- Index pour les lookups fréquents
CREATE INDEX IF NOT EXISTS idx_users_access_email ON users_access (email);
CREATE INDEX IF NOT EXISTS idx_users_access_status ON users_access (status);

-- RLS
ALTER TABLE users_access ENABLE ROW LEVEL SECURITY;

-- Chaque utilisateur peut lire sa propre ligne
CREATE POLICY "users_read_own" ON users_access
  FOR SELECT USING (auth.uid() = user_id);

-- Chaque utilisateur peut insérer sa propre demande
CREATE POLICY "users_insert_own" ON users_access
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- L'admin (identifié par son role dans la table) peut tout lire
CREATE POLICY "admin_read_all" ON users_access
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users_access ua WHERE ua.user_id = auth.uid() AND ua.role = 'admin')
  );

-- L'admin peut mettre à jour toutes les lignes
CREATE POLICY "admin_update_all" ON users_access
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users_access ua WHERE ua.user_id = auth.uid() AND ua.role = 'admin')
  );

-- Insérer l'admin initial (Simon) — à exécuter une fois après la première connexion Google
-- Remplacer le user_id par celui de ta session Supabase :
-- INSERT INTO users_access (user_id, email, name, status, role, quota_limit)
-- VALUES ('TON_USER_ID', 'simonskydu31@gmail.com', 'Simon', 'approved', 'admin', 9999);
