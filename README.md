# PocketDev

Studio de vibe coding pour iPhone : l'app pilote, le code s'exécute dans des runners cloud isolés.

## Structure

| Dossier | Contenu |
| --- | --- |
| `apps/mobile` | App iOS (Expo + Expo Router), cinq onglets |
| `apps/api` | API sur Cloudflare Workers (Hono) et runners (Durable Objects + conteneurs) |
| `packages/shared` | Types partagés : projets, tâches, déploiements, événements |
| `docs/` | Matrice exigences → composants → tests |

## Démarrer

Prérequis : Node 22+ et pnpm 10 (`corepack enable`).

```sh
pnpm install
pnpm typecheck
pnpm test

pnpm dev:api       # API sur http://localhost:8787 (Docker requis pour les conteneurs)
pnpm dev:mobile    # Expo : scanne le QR code avec Expo Go sur iPhone
```

Pour l'app, copie `apps/mobile/.env.example` en `apps/mobile/.env` et ajuste `EXPO_PUBLIC_API_URL`.

## Déployer l'API

Nécessite l'offre Workers payante (conteneurs) et Docker pour construire l'image du runner :

```sh
cd apps/api && pnpm wrangler login && pnpm deploy
```
