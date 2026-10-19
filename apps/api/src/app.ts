import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { randomToken, SecretBox, sha256Hex } from "./crypto";
import type { Env } from "./env";
import { GitHubApi, GitHubError } from "./github/api";
import type { Store, UserRecord } from "./store";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_TTL_MS = 10 * 60 * 1000;
/** On rafraîchit le jeton GitHub un peu avant son expiration. */
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

export interface AppDeps {
  store(env: Env): Store;
  github(env: Env): GitHubApi;
  now?(): Date;
}

type Vars = { store: Store; github: GitHubApi; secrets: SecretBox; user: UserRecord };

const iso = (date: Date) => date.toISOString();

export function isAllowedRedirect(uri: string, prefixes: string): boolean {
  return prefixes
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .some((prefix) => uri.startsWith(prefix));
}

export function createApp(deps: AppDeps) {
  const now = deps.now ?? (() => new Date());
  const app = new Hono<{ Bindings: Env; Variables: Vars }>();

  // L'app web (Expo) appelle l'API depuis une autre origine ; l'authentification passe par un en-tête, pas un cookie.
  app.use("*", cors({ origin: "*", allowHeaders: ["Authorization", "Content-Type"] }));

  app.use("*", async (c, next) => {
    c.set("store", deps.store(c.env));
    c.set("github", deps.github(c.env));
    c.set("secrets", await SecretBox.fromBase64Key(c.env.SECRETS_KEY));
    await next();
  });

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    if (err instanceof GitHubError) {
      const status = err.status === 401 || err.status === 403 || err.status === 404 ? err.status : 502;
      return c.json({ error: err.message }, status);
    }
    console.error(err);
    return c.json({ error: "Erreur interne" }, 500);
  });

  app.get("/health", (c) => c.json({ ok: true, service: "pocketdev-api" }));

  // --- Connexion GitHub -------------------------------------------------------

  app.get("/auth/github/start", async (c) => {
    const redirectUri = c.req.query("redirect_uri") ?? "";
    if (!isAllowedRedirect(redirectUri, c.env.APP_REDIRECT_PREFIXES)) {
      throw new HTTPException(400, { message: "Adresse de retour non autorisée" });
    }
    const state = randomToken();
    await c.var.store.putCode(
      await sha256Hex(state),
      "oauth_state",
      { userId: null, redirectUri },
      iso(new Date(now().getTime() + CODE_TTL_MS)),
    );
    return c.redirect(c.var.github.authorizeUrl(state));
  });

  app.get("/auth/github/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    if (!code || !state) throw new HTTPException(400, { message: "Réponse GitHub incomplète" });

    const pending = await c.var.store.takeCode(await sha256Hex(state), "oauth_state", iso(now()));
    if (!pending?.redirectUri) throw new HTTPException(400, { message: "Connexion expirée, recommence depuis l'app" });

    const tokens = await c.var.github.exchangeCode(code);
    const ghUser = await c.var.github.getUser(tokens.accessToken);
    const user = await c.var.store.upsertUser({
      githubId: ghUser.id,
      githubLogin: ghUser.login,
      githubTokenEnc: await c.var.secrets.seal(tokens.accessToken),
      githubRefreshEnc: tokens.refreshToken ? await c.var.secrets.seal(tokens.refreshToken) : null,
      githubTokenExpiresAt: tokens.expiresAt,
    });

    // L'app échange ce code à usage unique contre un jeton de session (jamais transmis dans l'URL).
    const loginCode = randomToken();
    await c.var.store.putCode(
      await sha256Hex(loginCode),
      "login",
      { userId: user.id, redirectUri: null },
      iso(new Date(now().getTime() + CODE_TTL_MS)),
    );
    await c.var.store.audit({ actorId: user.id, action: "auth.login", target: `github:${ghUser.login}`, result: "ok" });

    const target = new URL(pending.redirectUri);
    target.searchParams.set("code", loginCode);
    return c.redirect(target.toString());
  });

  app.post("/auth/exchange", async (c) => {
    const { code } = await c.req.json<{ code?: string }>().catch(() => ({ code: undefined }));
    if (!code) throw new HTTPException(400, { message: "Code manquant" });
    const login = await c.var.store.takeCode(await sha256Hex(code), "login", iso(now()));
    if (!login?.userId) throw new HTTPException(401, { message: "Code invalide ou expiré" });

    const token = randomToken();
    await c.var.store.createSession(
      await sha256Hex(token),
      login.userId,
      iso(new Date(now().getTime() + SESSION_TTL_MS)),
    );
    const user = await c.var.store.getUser(login.userId);
    return c.json({ token, user: { id: login.userId, githubLogin: user?.githubLogin ?? null } });
  });

  // --- Routes authentifiées ----------------------------------------------------

  const authed = new Hono<{ Bindings: Env; Variables: Vars }>();

  authed.use("*", async (c, next) => {
    const header = c.req.header("Authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const userId = token ? await c.var.store.getSessionUserId(await sha256Hex(token), iso(now())) : null;
    const user = userId ? await c.var.store.getUser(userId) : null;
    if (!user) throw new HTTPException(401, { message: "Session expirée, reconnecte-toi" });
    c.set("user", user);
    await next();
  });

  /** Jeton GitHub de l'utilisateur, rafraîchi si besoin. */
  async function userToken(c: { var: Vars }): Promise<string> {
    const { user, secrets, github, store } = c.var;
    const expiresAt = user.githubTokenExpiresAt ? Date.parse(user.githubTokenExpiresAt) : null;
    if (expiresAt === null || expiresAt - TOKEN_REFRESH_MARGIN_MS > now().getTime()) {
      return secrets.open(user.githubTokenEnc);
    }
    if (!user.githubRefreshEnc) throw new HTTPException(401, { message: "Accès GitHub expiré, reconnecte-toi" });
    const tokens = await github.refreshUserToken(await secrets.open(user.githubRefreshEnc));
    await store.updateUserTokens(user.id, {
      githubTokenEnc: await secrets.seal(tokens.accessToken),
      githubRefreshEnc: tokens.refreshToken ? await secrets.seal(tokens.refreshToken) : null,
      githubTokenExpiresAt: tokens.expiresAt,
    });
    return tokens.accessToken;
  }

  authed.post("/auth/logout", async (c) => {
    const token = (c.req.header("Authorization") ?? "").slice(7);
    await c.var.store.deleteSession(await sha256Hex(token));
    return c.json({ ok: true });
  });

  authed.get("/me", (c) => c.json({ id: c.var.user.id, githubLogin: c.var.user.githubLogin }));

  authed.get("/github/install-url", (c) => c.json({ url: c.var.github.installUrl() }));

  authed.get("/github/repos", async (c) => {
    const repos = await c.var.github.listUserRepos(await userToken(c));
    return c.json({ repos });
  });

  authed.get("/projects", async (c) => c.json({ projects: await c.var.store.listProjects(c.var.user.id) }));

  authed.post("/projects", async (c) => {
    const { repository } = await c.req.json<{ repository?: string }>().catch(() => ({ repository: undefined }));
    if (!repository) throw new HTTPException(400, { message: "Dépôt manquant" });

    // On ne fait confiance qu'à GitHub : le dépôt doit faire partie de ceux autorisés pour l'App.
    const repos = await c.var.github.listUserRepos(await userToken(c));
    const repo = repos.find((r) => r.fullName.toLowerCase() === repository.toLowerCase());
    if (!repo) {
      await c.var.store.audit({ actorId: c.var.user.id, action: "project.import", target: repository, result: "denied" });
      throw new HTTPException(403, { message: "Ce dépôt n'est pas autorisé pour PocketDev" });
    }

    const project = await c.var.store.insertProject({
      ownerId: c.var.user.id,
      name: repo.fullName.split("/")[1] ?? repo.fullName,
      type: "web",
      repository: repo.fullName,
      defaultBranch: repo.defaultBranch,
      installationId: repo.installationId,
    });
    await c.var.store.audit({ actorId: c.var.user.id, action: "project.import", target: repo.fullName, result: "ok" });
    return c.json({ project }, 201);
  });

  async function ownedProject(c: { var: Vars; req: { param(name: "id"): string } }) {
    const project = await c.var.store.getProject(c.req.param("id"), c.var.user.id);
    if (!project) throw new HTTPException(404, { message: "Projet introuvable" });
    return project;
  }

  authed.get("/projects/:id", async (c) => c.json({ project: await ownedProject(c) }));

  authed.get("/projects/:id/branches", async (c) => {
    const project = await ownedProject(c);
    const token = await c.var.github.installationToken(project.installationId, project.repository);
    return c.json({ branches: await c.var.github.listBranches(token, project.repository) });
  });

  authed.get("/projects/:id/files", async (c) => {
    const project = await ownedProject(c);
    const branch = c.req.query("branch") || project.defaultBranch;
    const path = c.req.query("path") ?? "";
    const token = await c.var.github.installationToken(project.installationId, project.repository);
    return c.json({ branch, path, entries: await c.var.github.listDirectory(token, project.repository, branch, path) });
  });

  app.route("/", authed);
  return app;
}
