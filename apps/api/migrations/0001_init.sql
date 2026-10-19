-- Comptes, sessions et projets importés depuis GitHub.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  github_id INTEGER NOT NULL UNIQUE,
  github_login TEXT NOT NULL,
  -- Jetons GitHub chiffrés (AES-GCM) ; jamais renvoyés au client.
  github_token_enc TEXT NOT NULL,
  github_refresh_enc TEXT,
  github_token_expires_at TEXT,
  created_at TEXT NOT NULL
);

-- On ne stocke que l'empreinte SHA-256 du jeton de session.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

-- Valeurs « state » OAuth et codes de connexion à usage unique.
CREATE TABLE one_time_codes (
  code_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('oauth_state', 'login')),
  user_id TEXT,
  redirect_uri TEXT,
  expires_at TEXT NOT NULL
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  stack TEXT,
  repository TEXT NOT NULL,
  default_branch TEXT NOT NULL,
  installation_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  UNIQUE (owner_id, repository)
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  result TEXT NOT NULL,
  at TEXT NOT NULL
);
