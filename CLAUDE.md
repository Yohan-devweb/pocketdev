# PocketDev

Monorepo pnpm : `apps/mobile` (Expo/Expo Router), `apps/api` (Cloudflare Worker + Hono, runners en Durable Objects + conteneurs), `packages/shared` (types). Le cahier des charges et ses décisions sont suivis dans `docs/matrice-exigences.md`.

- Avant de conclure : `pnpm typecheck && pnpm test` à la racine.
- Textes visibles par l'utilisateur et commentaires en français.
- Jamais de fausses données affichées : un service n'est « connecté » que si l'API le confirme.
- Le code de l'API ne dépend que de l'interface `Runner` (`apps/api/src/runner/types.ts`), jamais directement de Cloudflare.
- Aucun secret dans les arguments de commande, les logs, les prompts ou l'app.
- App mobile : suivre `apps/mobile/AGENTS.md` (versions Expo ; ajouter des dépendances avec les versions de `expo/bundledNativeModules.json`).
