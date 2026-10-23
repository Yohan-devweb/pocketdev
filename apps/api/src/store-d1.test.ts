import { readFileSync } from "node:fs";
import { getPlatformProxy } from "wrangler";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { D1Store } from "./store-d1";

// Vérifie les requêtes SQL contre une vraie base D1 locale (workerd), en mémoire.
let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ DB: D1Database }>>>;
let store: D1Store;

beforeAll(async () => {
  proxy = await getPlatformProxy<{ DB: D1Database }>({ persist: false });
  const schema = ["0001_init.sql", "0002_ai_keys.sql", "0003_runs.sql", "0004_run_summary.sql"]
    .map((file) => readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"))
    .join(";\n");
  const statements = schema
    .replace(/--.*$/gm, "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  await proxy.env.DB.batch(statements.map((s) => proxy.env.DB.prepare(s)));
  store = new D1Store(proxy.env.DB);
}, 60_000);

afterAll(async () => {
  await proxy?.dispose();
});

const tokens = { githubTokenEnc: "enc", githubRefreshEnc: null, githubTokenExpiresAt: null };

describe("D1Store", () => {
  it("met à jour un compte existant au lieu d'en créer un second", async () => {
    const first = await store.upsertUser({ githubId: 1, githubLogin: "yohan", ...tokens });
    const second = await store.upsertUser({ githubId: 1, githubLogin: "yohan-renomme", ...tokens });
    expect(second.id).toBe(first.id);
    expect((await store.getUser(first.id))?.githubLogin).toBe("yohan-renomme");
  });

  it("gère l'expiration des sessions", async () => {
    const user = await store.upsertUser({ githubId: 2, githubLogin: "a", ...tokens });
    await store.createSession("h1", user.id, "2030-01-01T00:00:00.000Z");
    expect(await store.getSessionUserId("h1", "2029-01-01T00:00:00.000Z")).toBe(user.id);
    expect(await store.getSessionUserId("h1", "2031-01-01T00:00:00.000Z")).toBeNull();
    await store.deleteSession("h1");
    expect(await store.getSessionUserId("h1", "2029-01-01T00:00:00.000Z")).toBeNull();
  });

  it("consomme un code une seule fois et ignore un code expiré", async () => {
    await store.putCode("c1", "login", { userId: "u", redirectUri: null }, "2030-01-01T00:00:00.000Z");
    expect(await store.takeCode("c1", "oauth_state", "2029-01-01T00:00:00.000Z")).toBeNull();
    expect(await store.takeCode("c1", "login", "2029-01-01T00:00:00.000Z")).toEqual({ userId: "u", redirectUri: null });
    expect(await store.takeCode("c1", "login", "2029-01-01T00:00:00.000Z")).toBeNull();

    await store.putCode("c2", "login", { userId: "u", redirectUri: null }, "2020-01-01T00:00:00.000Z");
    expect(await store.takeCode("c2", "login", "2029-01-01T00:00:00.000Z")).toBeNull();
  });

  it("importe un projet une seule fois par dépôt et le limite à son propriétaire", async () => {
    const user = await store.upsertUser({ githubId: 3, githubLogin: "b", ...tokens });
    const input = { ownerId: user.id, name: "site", type: "web" as const, repository: "b/site", defaultBranch: "main", installationId: 9 };
    const first = await store.insertProject(input);
    const again = await store.insertProject({ ...input, installationId: 10 });
    expect(again.id).toBe(first.id);
    expect(again.installationId).toBe(10);
    expect(await store.listProjects(user.id)).toHaveLength(1);
    expect(await store.getProject(first.id, "autre")).toBeNull();
    await store.audit({ actorId: user.id, action: "project.import", target: "b/site", result: "ok" });
  });

  it("garde une clé IA par fournisseur et la limite à son propriétaire", async () => {
    const user = await store.upsertUser({ githubId: 4, githubLogin: "c", ...tokens });
    await store.putAiKey(user.id, "openai", "enc-1", "aaaa");
    await store.putAiKey(user.id, "openai", "enc-2", "bbbb");
    await store.putAiKey(user.id, "anthropic", "enc-3", "cccc");
    const keys = await store.listAiKeys(user.id);
    expect(keys.map((k) => [k.provider, k.hint])).toEqual([["anthropic", "cccc"], ["openai", "bbbb"]]);
    expect(await store.getAiKeyEnc(user.id, "openai")).toBe("enc-2");
    expect(await store.getAiKeyEnc("autre", "openai")).toBeNull();
    await store.deleteAiKey(user.id, "openai");
    expect(await store.getAiKeyEnc(user.id, "openai")).toBeNull();
  });
});
