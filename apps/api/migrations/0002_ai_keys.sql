-- Clés IA apportées par l'utilisateur (BYOK), une par fournisseur.
CREATE TABLE ai_keys (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('anthropic', 'openai', 'openrouter')),
  -- Clé chiffrée (AES-GCM) ; jamais renvoyée au client.
  key_enc TEXT NOT NULL,
  -- 4 derniers caractères, pour que l'utilisateur reconnaisse sa clé.
  key_hint TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, provider)
);
