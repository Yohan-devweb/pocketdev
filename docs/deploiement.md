# Mettre PocketDev en ligne (Cloudflare)

Ce guide publie l'API sur Cloudflare (Worker, base D1 et runners) puis ouvre l'app sur iPhone avec Expo Go. Les commandes sont pour PowerShell, sous Windows, à lancer depuis le dossier `pocketdev`.

Prérequis : la GitHub App existe (`docs/github-app.md`) et Docker Desktop est lancé (« Engine running »). Docker sert à construire l'image du runner avant de l'envoyer à Cloudflare.

## 1. Offre Workers payante

Les runners (conteneurs) demandent l'offre **Workers Paid**, à 5 $ par mois. Dans le tableau de bord Cloudflare : **Workers & Pages → Plans → Workers Paid**.

## 2. Connexion et base de données

```powershell
cd apps\api
pnpm exec wrangler login
pnpm exec wrangler d1 create pocketdev
```

`wrangler login` ouvre le navigateur pour autoriser Wrangler sur ton compte Cloudflare. La deuxième commande crée la base en ligne et affiche son `database_id`. Ce n'est pas un secret : il va dans `wrangler.jsonc`, dans `d1_databases`.

## 3. Publier l'API

```powershell
pnpm exec wrangler deploy
pnpm exec wrangler d1 migrations apply pocketdev --remote
```

Le premier déploiement construit l'image du runner, ce qui prend plusieurs minutes. À la fin, Wrangler affiche l'adresse de l'API, du type `https://pocketdev-api.<ton-sous-domaine>.workers.dev`. La seconde commande crée les tables dans la base en ligne.

## 4. Secrets

Chaque commande demande la valeur : colle-la puis valide. Les valeurs sont celles de ton `apps\api\.dev.vars`.

```powershell
pnpm exec wrangler secret put GITHUB_APP_ID
pnpm exec wrangler secret put GITHUB_APP_SLUG
pnpm exec wrangler secret put GITHUB_CLIENT_ID
pnpm exec wrangler secret put GITHUB_CLIENT_SECRET
pnpm exec wrangler secret put SECRETS_KEY
Get-Content C:\chemin\vers\ta-cle.pem -Raw | pnpm exec wrangler secret put GITHUB_PRIVATE_KEY
```

Pour la clé privée, remplace le chemin par celui de ton fichier `.pem`. Les secrets ne quittent pas Cloudflare et ne sont jamais dans le code.

## 5. Adresse de retour GitHub

Dans les réglages de la GitHub App (**Settings → Developer settings → GitHub Apps → PocketDev → General**), ajoute une deuxième **Callback URL** à côté de celle du local :

```
https://pocketdev-api.<ton-sous-domaine>.workers.dev/auth/github/callback
```

Vérifie que tout répond en ouvrant `https://pocketdev-api.<ton-sous-domaine>.workers.dev/health` dans le navigateur : la page doit afficher `{"ok":true,…}`.

## 6. L'app sur iPhone

1. Installe **Expo Go** depuis l'App Store.
2. Dans `apps\mobile\.env`, remplace l'adresse de l'API par celle de Cloudflare :
   ```
   EXPO_PUBLIC_API_URL=https://pocketdev-api.<ton-sous-domaine>.workers.dev
   ```
3. Lance `cd apps\mobile`, puis `pnpm exec expo start`, et scanne le QR code avec l'appareil photo de l'iPhone. Le PC et l'iPhone doivent être sur le même Wi-Fi.

La base en ligne est vide au départ : reconnecte GitHub, réimporte le projet et rajoute ta clé IA dans Connect.

## Mettre à jour plus tard

Après chaque `git pull` qui touche l'API : `pnpm exec wrangler d1 migrations apply pocketdev --remote` (s'il y a une nouvelle migration), puis `pnpm exec wrangler deploy`.
