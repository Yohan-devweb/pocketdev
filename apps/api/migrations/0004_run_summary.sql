-- Résumé de l'agent : ce qu'il a changé et pourquoi, affiché en tête de la demande.
ALTER TABLE runs ADD COLUMN summary TEXT;
