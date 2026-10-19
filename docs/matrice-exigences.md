# Matrice exigences → composants → tests

Source : cahier des charges PocketDev AI v1.0 (19/10/2026). Statuts : ✅ fait · 🟡 en cours · ⬜ à faire.

## Phase 0 — prototype de bout en bout

| Exigence | Composant | Test / preuve | Statut |
| --- | --- | --- | --- |
| Runner isolé par tâche, jamais sur le serveur central | `apps/api/src/runner/cloudflare.ts` (Durable Object + conteneur) | Déploiement Cloudflare + exécution d'une commande réelle | 🟡 code prêt, pas encore déployé |
| Interface runner interchangeable (Cloudflare → E2B / serveurs dédiés) | `apps/api/src/runner/types.ts` | Les tests Git utilisent un faux runner sur la même interface | ✅ |
| Clone du dépôt et branche de travail isolée | `prepareWorkspace` dans `apps/api/src/runner/git.ts` | `git.test.ts` | ✅ |
| Le jeton GitHub ne fuit pas (arguments, `.git/config`, logs) | `gitAuthEnv` | `git.test.ts` : « ne met jamais le jeton… » | ✅ |
| Diff réel d'une tâche | `collectDiff` | `git.test.ts` | ✅ |
| Un échec n'est jamais présenté comme un succès | `RunnerCommandError`, `isTerminal` | `git.test.ts`, `events.test.ts` | ✅ |
| GitHub App avec permissions minimales | à créer | Import d'un dépôt privé de test | ⬜ |
| Agent de code dans le runner (clé IA de l'utilisateur) | à créer | Une demande produit un diff sur une branche | ⬜ |
| Streaming des logs et statuts vers l'app | types `RunEvent` (`packages/shared`) ; route SSE à créer | Logs visibles en direct sur iPhone | 🟡 |
| Preview web sécurisée sur iPhone | `fetchPort` du runner ; route protégée à créer | Ouvrir l'URL dans Safari | 🟡 |
| Déploiement Cloudflare (puis Vercel) | à créer | Projet de démo publié | ⬜ |

## Application mobile

| Exigence | Composant | Test / preuve | Statut |
| --- | --- | --- | --- |
| Cinq onglets : Projects, AI Chat, Preview, Agents, Connect | `apps/mobile/src/app/(tabs)/` | Captures web à 390 px | ✅ |
| Interface sombre inspirée des maquettes | `apps/mobile/src/theme/colors.ts` | Captures | ✅ |
| Aucune fausse donnée (« connecté » seulement si un service réel le confirme) | États vides ; Connect interroge `/health` | Connect affiche « injoignable » sans serveur | ✅ |
| Cloudflare et Vercel à égalité dans Connect | `connect.tsx` | Capture | ✅ |

## Sécurité minimale (section 6), à couvrir au fil du MVP

| Exigence | Composant prévu | Statut |
| --- | --- | --- |
| Authentification et sessions expirables | API | ⬜ |
| Secrets chiffrés côté serveur, jamais renvoyés au client | API + stockage chiffré | ⬜ |
| Filtrage réseau des runners | Interception des sorties HTTP du conteneur | ⬜ (Internet ouvert en Phase 0) |
| Approbation avant actions destructrices et production | Statut `awaiting_approval` | 🟡 statut défini |
| Journal d'audit | Entité `AuditEvent` | 🟡 type défini |
