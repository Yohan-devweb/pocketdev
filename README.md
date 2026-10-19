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

pnpm dev:api           # API sur http://localhost:8787, sans runner (pas besoin de Docker)
pnpm dev:api:runners   # Même API avec les runners : Docker doit être lancé (agent IA)
pnpm dev:mobile        # Expo : scanne le QR code avec Expo Go sur iPhone
```

Pour la connexion GitHub, suis `docs/github-app.md` puis copie `apps/api/.dev.vars.example` en `apps/api/.dev.vars`. Base locale : `pnpm --filter @pocketdev/api exec wrangler d1 migrations apply pocketdev --local`.

L'agent IA (onglet AI Chat) tourne dans un runner : il faut `pnpm dev:api:runners` avec Docker Desktop lancé. Le premier démarrage construit l'image du runner (Node, Git et l'agent Aider), ce qui prend quelques minutes. Sans Docker, une demande échoue avec un message qui l'explique.

Pour l'app, copie `apps/mobile/.env.example` en `apps/mobile/.env` et ajuste `EXPO_PUBLIC_API_URL`.

## Déployer l'API

Nécessite l'offre Workers payante (conteneurs) et Docker pour construire l'image du runner :

```sh
cd apps/api && pnpm wrangler login && pnpm deploy
```
