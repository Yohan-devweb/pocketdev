# Créer la GitHub App PocketDev

PocketDev accède à GitHub via une **GitHub App** : tu choisis précisément les dépôts qu'elle peut voir, et ses accès sont limités et révocables.

## 1. Créer l'App

Va sur <https://github.com/settings/apps/new> et remplis :

| Champ | Valeur |
| --- | --- |
| GitHub App name | `PocketDev Yohan` (le nom doit être unique sur GitHub) |
| Homepage URL | `https://github.com/Yohan-devweb/pocketdev` |
| Callback URL | `http://localhost:8787/auth/github/callback` (ajoute plus tard l'adresse du serveur en ligne, voir étape 4) |
| Expire user authorization tokens | ✅ coché |
| Request user authorization (OAuth) during installation | ⬜ décoché |
| Webhook → Active | ⬜ décoché (pas utilisé pour l'instant) |
| Repository permissions → Contents | Read and write (l'agent poussera ses branches) |
| Repository permissions → Pull requests | Read and write |
| Repository permissions → Metadata | Read-only (imposé) |
| Where can this GitHub App be installed? | Only on this account |

Clique sur **Create GitHub App**.

## 2. Récupérer les identifiants

Sur la page de l'App :

- **App ID** et **Client ID** : affichés en haut.
- **Slug** : la fin de l'adresse de la page (`github.com/settings/apps/<slug>`).
- **Client secret** : bouton « Generate a new client secret ». Copie-le tout de suite, il n'est affiché qu'une fois.
- **Private key** : bouton « Generate a private key ». Un fichier `.pem` se télécharge.

Ces valeurs sont des secrets : ne les colle jamais dans une conversation, un commit ou une capture d'écran.

## 3. Installer l'App sur tes dépôts

Menu **Install App** → ton compte → choisis « Only select repositories » et sélectionne les dépôts à confier à PocketDev. Tu pourras en ajouter depuis l'app (bouton « Choisir les dépôts autorisés sur GitHub »).

## 4. Donner les secrets au serveur

En ligne (Cloudflare), depuis `apps/api` :

```sh
pnpm wrangler secret put GITHUB_APP_ID
pnpm wrangler secret put GITHUB_APP_SLUG
pnpm wrangler secret put GITHUB_CLIENT_ID
pnpm wrangler secret put GITHUB_CLIENT_SECRET
pnpm wrangler secret put GITHUB_PRIVATE_KEY < chemin/vers/la-cle.pem
openssl rand -base64 32 | pnpm wrangler secret put SECRETS_KEY
pnpm wrangler d1 migrations apply pocketdev --remote
```

Après le premier `pnpm deploy`, ajoute l'adresse affichée (`https://pocketdev-api.<ton-sous-domaine>.workers.dev/auth/github/callback`) dans les Callback URLs de l'App.

En local, copie `apps/api/.dev.vars.example` en `apps/api/.dev.vars` et remplis les mêmes valeurs.

## Ce que fait PocketDev avec ces accès

- Ton jeton GitHub personnel est chiffré (AES-GCM) dans la base et n'est jamais envoyé à l'app iPhone.
- L'app ne reçoit qu'un jeton de session PocketDev, rangé dans le trousseau iOS, valable 30 jours, révoqué à la déconnexion.
- Pour lire un dépôt, le serveur demande à GitHub un jeton temporaire limité à ce seul dépôt, en lecture.
