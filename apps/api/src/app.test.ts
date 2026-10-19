import { beforeEach, describe, expect, it } from "vitest";
import { AiKeyVerifier, type KeyCheck } from "./ai/keys";
import { createApp, isAllowedRedirect } from "./app";
import { sha256Hex } from "./crypto";
import type { Env } from "./env";
import { GitHubApi, type GitHubRepo, type UserTokens } from "./github/api";
import type { RunnerProvider } from "./runner/types";
import { MemoryStore } from "./test/memory-store";

const ENV = {
  SECRETS_KEY: btoa(String.fromCharCode(...new Uint8Array(32).fill(1))),
  APP_REDIRECT_PREFIXES: "pocketdev://",
} as unknown as Env;

class FakeGitHub extends GitHubApi {
  repos: GitHubRepo[] = [
    { fullName: "yohan/site", private: true, defaultBranch: "main", installationId: 42 },
  ];
  tokens: UserTokens = { accessToken: "ghu_user", refreshToken: "ghr_refresh", expiresAt: null };
  refreshed = 0;
  receivedUserTokens: string[] = [];

  constructor() {
    super({ appId: "1", slug: "pocketdev-test", clientId: "cid", clientSecret: "cs", privateKey: "" });
  }
  override async exchangeCode(code: string) {
    if (code !== "gh-code") throw new Error("mauvais code");
    return this.tokens;
  }
  override async refreshUserToken() {
    this.refreshed++;
    return { accessToken: "ghu_fresh", refreshToken: "ghr_new", expiresAt: null };
  }
  override async getUser() {
    return { id: 7, login: "yohan" };
  }
  override async listUserRepos(token: string) {
    this.receivedUserTokens.push(token);
    return this.repos;
  }
  override async installationToken() {
    return "ghs_installation";
  }
  override async listBranches() {
    return ["main", "dev"];
  }
  override async listDirectory() {
    return [{ name: "src", path: "src", type: "dir" as const }];
  }
}

class FakeAiKeys extends AiKeyVerifier {
  result: KeyCheck = "valid";
  override async verify() {
    return this.result;
  }
}

class FakeRunners implements RunnerProvider {
  dispatched: string[] = [];
  broken = false;
  async acquire(): Promise<never> {
    throw new Error("non utilisé");
  }
  async dispatch(runId: string) {
    if (this.broken) throw new Error("conteneur indisponible");
    this.dispatched.push(runId);
  }
}

let store: MemoryStore;
let runners: FakeRunners;
let aiKeys: FakeAiKeys;
let github: FakeGitHub;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  store = new MemoryStore();
  github = new FakeGitHub();
  aiKeys = new FakeAiKeys();
  runners = new FakeRunners();
  app = createApp({ store: () => store, github: () => github, aiKeys: () => aiKeys, runners: () => runners });
});

const request = (path: string, init?: RequestInit) => app.request(path, init, ENV);

/** Parcours complet : app → GitHub → retour dans l'app → session. */
async function login(): Promise<string> {
  const start = await request("/auth/github/start?redirect_uri=pocketdev://auth");
  const state = new URL(start.headers.get("Location")!).searchParams.get("state");
  const callback = await request(`/auth/github/callback?code=gh-code&state=${state}`);
  const code = new URL(callback.headers.get("Location")!).searchParams.get("code");
  const exchange = await request("/auth/exchange", {
    method: "POST",
    body: JSON.stringify({ code }),
    headers: { "Content-Type": "application/json" },
  });
  const { token } = (await exchange.json()) as { token: string };
  return token;
}

const authed = (token: string, init: RequestInit = {}) => ({
  ...init,
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
});

describe("connexion GitHub", () => {
  it("connecte l'utilisateur et ne stocke jamais son jeton GitHub en clair", async () => {
    const token = await login();
    const me = await request("/me", authed(token));
    expect(await me.json()).toMatchObject({ githubLogin: "yohan" });

    const [user] = [...store.users.values()];
    expect(user!.githubTokenEnc).not.toContain("ghu_user");
    expect([...store.sessions.keys()][0]).not.toBe(token);
  });

  it("refuse une adresse de retour qui n'est pas l'app", async () => {
    const res = await request("/auth/github/start?redirect_uri=https://pirate.example/auth");
    expect(res.status).toBe(400);
  });

  it("refuse un state inconnu ou déjà utilisé", async () => {
    const start = await request("/auth/github/start?redirect_uri=pocketdev://auth");
    const state = new URL(start.headers.get("Location")!).searchParams.get("state");
    expect((await request(`/auth/github/callback?code=gh-code&state=${state}`)).status).toBe(302);
    expect((await request(`/auth/github/callback?code=gh-code&state=${state}`)).status).toBe(400);
  });

  it("le code de connexion ne sert qu'une fois", async () => {
    const start = await request("/auth/github/start?redirect_uri=pocketdev://auth");
    const state = new URL(start.headers.get("Location")!).searchParams.get("state");
    const callback = await request(`/auth/github/callback?code=gh-code&state=${state}`);
    const code = new URL(callback.headers.get("Location")!).searchParams.get("code");
    const body = JSON.stringify({ code });
    expect((await request("/auth/exchange", { method: "POST", body })).status).toBe(200);
    expect((await request("/auth/exchange", { method: "POST", body })).status).toBe(401);
  });

  it("bloque les routes sans session valide, et après déconnexion", async () => {
    expect((await request("/projects")).status).toBe(401);
    const token = await login();
    await request("/auth/logout", authed(token, { method: "POST" }));
    expect((await request("/projects", authed(token))).status).toBe(401);
  });

  it("rafraîchit le jeton GitHub expiré avant de l'utiliser", async () => {
    github.tokens = { accessToken: "ghu_old", refreshToken: "ghr_refresh", expiresAt: "2000-01-01T00:00:00Z" };
    const token = await login();
    await request("/github/repos", authed(token));
    expect(github.refreshed).toBe(1);
    expect(github.receivedUserTokens).toEqual(["ghu_fresh"]);
  });
});

describe("projets", () => {
  it("importe un dépôt autorisé puis liste ses branches et fichiers", async () => {
    const token = await login();
    const created = await request("/projects", authed(token, { method: "POST", body: JSON.stringify({ repository: "yohan/site" }) }));
    expect(created.status).toBe(201);
    const { project } = (await created.json()) as { project: { id: string; installationId: number } };
    expect(project.installationId).toBe(42);

    const branches = await request(`/projects/${project.id}/branches`, authed(token));
    expect(await branches.json()).toEqual({ branches: ["main", "dev"] });

    const files = await request(`/projects/${project.id}/files`, authed(token));
    expect(await files.json()).toMatchObject({ branch: "main", entries: [{ name: "src", type: "dir" }] });
  });

  it("refuse un dépôt non autorisé pour l'App et le journalise", async () => {
    const token = await login();
    const res = await request("/projects", authed(token, { method: "POST", body: JSON.stringify({ repository: "autre/depot" }) }));
    expect(res.status).toBe(403);
    expect(store.auditLog.at(-1)).toMatchObject({ action: "project.import", result: "denied" });
  });

  it("n'expose pas le projet d'un autre utilisateur", async () => {
    const token = await login();
    const created = await request("/projects", authed(token, { method: "POST", body: JSON.stringify({ repository: "yohan/site" }) }));
    const { project } = (await created.json()) as { project: { id: string } };
    store.projects.get(project.id)!.ownerId = "quelqu-un-d-autre";
    expect((await request(`/projects/${project.id}/branches`, authed(token))).status).toBe(404);
  });
});

describe("clés IA", () => {
  const KEY = "sk-ant-api03-cle-de-test-1234";
  const save = (token: string, provider: string, key: unknown) =>
    request(`/ai/keys/${provider}`, authed(token, { method: "PUT", body: JSON.stringify({ key }) }));

  it("enregistre une clé acceptée par le fournisseur, chiffrée, sans jamais la renvoyer", async () => {
    const token = await login();
    const res = await save(token, "anthropic", `  ${KEY}\n`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(await res.json())).not.toContain(KEY);

    const list = await request("/ai/keys", authed(token));
    const body = JSON.stringify(await list.json());
    expect(body).toContain('"hint":"1234"');
    expect(body).not.toContain(KEY);

    const [stored] = [...store.aiKeys.values()];
    expect(stored!.keyEnc).not.toContain(KEY);
    expect(store.auditLog.at(-1)).toMatchObject({ action: "ai_key.save", target: "anthropic", result: "ok" });
    expect(JSON.stringify(store.auditLog)).not.toContain(KEY);
  });

  it("refuse une clé rejetée par le fournisseur et ne l'enregistre pas", async () => {
    const token = await login();
    aiKeys.result = "invalid";
    const res = await save(token, "openai", KEY);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "ChatGPT (OpenAI) a refusé cette clé" });
    expect(store.aiKeys.size).toBe(0);
  });

  it("n'affirme rien quand le fournisseur ne répond pas", async () => {
    const token = await login();
    aiKeys.result = "unavailable";
    expect((await save(token, "openrouter", KEY)).status).toBe(502);
    expect(store.aiKeys.size).toBe(0);
  });

  it("refuse un format invalide ou un fournisseur inconnu", async () => {
    const token = await login();
    expect((await save(token, "anthropic", "trop court")).status).toBe(400);
    expect((await save(token, "anthropic", 42)).status).toBe(400);
    expect((await save(token, "inconnu", KEY)).status).toBe(404);
  });

  it("retire une clé", async () => {
    const token = await login();
    await save(token, "anthropic", KEY);
    expect((await request("/ai/keys/anthropic", authed(token, { method: "DELETE" }))).status).toBe(200);
    expect(await (await request("/ai/keys", authed(token))).json()).toEqual({ keys: [] });
  });

  it("exige une session", async () => {
    expect((await request("/ai/keys")).status).toBe(401);
  });
});

describe("demandes à l'agent", () => {
  async function setup() {
    const token = await login();
    const created = await request("/projects", authed(token, { method: "POST", body: JSON.stringify({ repository: "yohan/site" }) }));
    const { project } = (await created.json()) as { project: { id: string } };
    const ask = (body: Record<string, unknown>) =>
      request(`/projects/${project.id}/runs`, authed(token, { method: "POST", body: JSON.stringify(body) }));
    return { token, projectId: project.id, ask };
  }
  const saveKey = (token: string) =>
    request("/ai/keys/anthropic", authed(token, { method: "PUT", body: JSON.stringify({ key: "sk-ant-api03-cle-de-test-1234" }) }));

  it("exige une clé connectée pour le fournisseur choisi", async () => {
    const { ask } = await setup();
    const res = await ask({ goal: "Ajoute un pied de page", provider: "anthropic" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Connecte d'abord ta clé Claude (Anthropic) dans l'onglet Connect" });
    expect(runners.dispatched).toEqual([]);
  });

  it("crée la demande, la confie au runner et la rend consultable par son seul auteur", async () => {
    const { token, projectId, ask } = await setup();
    await saveKey(token);
    const res = await ask({ goal: "  Ajoute un pied de page  ", provider: "anthropic" });
    expect(res.status).toBe(201);
    const { run } = (await res.json()) as { run: Record<string, unknown> };
    expect(run).toMatchObject({ goal: "Ajoute un pied de page", status: "queued", model: "claude-sonnet-5-5", baseBranch: "main" });
    expect(run).not.toHaveProperty("ownerId");
    expect(runners.dispatched).toEqual([run.id]);

    expect((await request(`/runs/${run.id}`, authed(token))).status).toBe(200);
    const list = (await (await request(`/projects/${projectId}/runs`, authed(token))).json()) as { runs: unknown[] };
    expect(list.runs).toHaveLength(1);

    const intruder = await store.upsertUser({ githubId: 99, githubLogin: "autre", githubTokenEnc: "x", githubRefreshEnc: null, githubTokenExpiresAt: null });
    await store.createSession(await sha256Hex("intrus"), intruder.id, "2999-01-01T00:00:00.000Z");
    const other = await app.request(`/runs/${run.id}`, { headers: { Authorization: "Bearer intrus" } }, ENV);
    expect(other.status).toBe(404);
  });

  it("refuse une deuxième demande tant que la première tourne", async () => {
    const { token, ask } = await setup();
    await saveKey(token);
    expect((await ask({ goal: "Un", provider: "anthropic" })).status).toBe(201);
    expect((await ask({ goal: "Deux", provider: "anthropic" })).status).toBe(409);
  });

  it("valide la demande, le modèle et la branche", async () => {
    const { token, ask } = await setup();
    await saveKey(token);
    expect((await ask({ goal: "   ", provider: "anthropic" })).status).toBe(400);
    expect((await ask({ goal: "x".repeat(4001), provider: "anthropic" })).status).toBe(400);
    expect((await ask({ goal: "ok", provider: "inconnu" })).status).toBe(400);
    expect((await ask({ goal: "ok", provider: "anthropic", model: "--help" })).status).toBe(400);
    expect((await ask({ goal: "ok", provider: "anthropic", branch: "--upload-pack=x" })).status).toBe(400);
    expect(runners.dispatched).toEqual([]);
  });

  it("marque la demande en échec si le runner ne démarre pas", async () => {
    const { token, ask } = await setup();
    await saveKey(token);
    runners.broken = true;
    const res = await ask({ goal: "ok", provider: "anthropic" });
    expect(await res.json()).toMatchObject({ run: { status: "failed", error: "Impossible de démarrer le runner" } });
  });
});

describe("isAllowedRedirect", () => {
  it("n'accepte que les préfixes configurés", () => {
    expect(isAllowedRedirect("pocketdev://auth", "pocketdev://, exp://")).toBe(true);
    expect(isAllowedRedirect("exp://192.168.1.2:8081/--/auth", "pocketdev://, exp://")).toBe(true);
    expect(isAllowedRedirect("https://pirate.example", "pocketdev://")).toBe(false);
    expect(isAllowedRedirect("pocketdev://auth", "")).toBe(false);
  });
});
