-- Demandes confiées à l'agent de code, exécutées chacune dans son propre runner.
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('anthropic', 'openai', 'openrouter')),
  model TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('awaiting_approval', 'queued', 'running', 'succeeded', 'failed', 'cancelled')),
  base_branch TEXT NOT NULL,
  branch TEXT,
  -- Liste JSON des fichiers modifiés.
  files TEXT NOT NULL DEFAULT '[]',
  diff TEXT,
  log TEXT NOT NULL DEFAULT '',
  error TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX runs_by_project ON runs (project_id, created_at DESC);
