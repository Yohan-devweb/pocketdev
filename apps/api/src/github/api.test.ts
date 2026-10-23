import { describe, expect, it } from "vitest";
import { GitHubApi, GitHubError } from "./api";

const CONFIG = { appId: "1", slug: "pocketdev", clientId: "cid", clientSecret: "cs", privateKey: "" };

function fakeFetch(routes: Record<string, unknown>, calls: string[] = []) {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.endsWith(k));
    if (!key) return new Response("{}", { status: 404 });
    return Response.json(routes[key]);
  }) as typeof fetch;
}

describe("GitHubApi", () => {
  it("rassemble les dépôts de toutes les installations de l'utilisateur", async () => {
    const api = new GitHubApi(
      CONFIG,
      fakeFetch({
        "/user/installations?per_page=100": { installations: [{ id: 1 }, { id: 2 }] },
        "/user/installations/1/repositories?per_page=100": {
          repositories: [{ full_name: "a/x", private: true, default_branch: "main" }],
        },
        "/user/installations/2/repositories?per_page=100": {
          repositories: [{ full_name: "b/y", private: false, default_branch: "dev" }],
        },
      }),
    );
    expect(await api.listUserRepos("t")).toEqual([
      { fullName: "a/x", private: true, defaultBranch: "main", installationId: 1 },
      { fullName: "b/y", private: false, defaultBranch: "dev", installationId: 2 },
    ]);
  });

  it("signale un refus d'autorisation GitHub", async () => {
    const api = new GitHubApi(CONFIG, fakeFetch({ "/login/oauth/access_token": { error: "bad_verification_code" } }));
    await expect(api.exchangeCode("x")).rejects.toBeInstanceOf(GitHubError);
  });

  it("n'appelle pas fetch avec l'instance comme `this` (refusé par Workers)", async () => {
    const strictFetch = function (this: unknown) {
      if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
      return Promise.resolve(Response.json({ access_token: "ghu" }));
    } as unknown as typeof fetch;
    const api = new GitHubApi(CONFIG, strictFetch);
    expect((await api.exchangeCode("x")).accessToken).toBe("ghu");
  });

  it("calcule l'expiration du jeton utilisateur", async () => {
    const api = new GitHubApi(
      CONFIG,
      fakeFetch({ "/login/oauth/access_token": { access_token: "ghu", refresh_token: "ghr", expires_in: 28800 } }),
    );
    const tokens = await api.exchangeCode("x");
    expect(tokens.accessToken).toBe("ghu");
    expect(Date.parse(tokens.expiresAt!)).toBeGreaterThan(Date.now() + 28_000_000);
  });

  it("liste un dossier avec les sous-dossiers en premier", async () => {
    const calls: string[] = [];
    const api = new GitHubApi(
      CONFIG,
      fakeFetch(
        {
          "/repos/a/x/contents/src/app?ref=main": [
            { name: "z.ts", path: "src/app/z.ts", type: "file", sha: "1" },
            { name: "lib", path: "src/app/lib", type: "dir", sha: "2" },
          ],
        },
        calls,
      ),
    );
    expect(await api.listDirectory("t", "a/x", "main", "src/app")).toEqual([
      { name: "lib", path: "src/app/lib", type: "dir" },
      { name: "z.ts", path: "src/app/z.ts", type: "file" },
    ]);
  });
});

describe("GitHubApi sans configuration", () => {
  it("explique que la GitHub App n'est pas configurée au lieu d'une erreur interne", async () => {
    const api = new GitHubApi(CONFIG, fakeFetch({}));
    await expect(api.installationToken(1, "a/x")).rejects.toMatchObject({ status: 503 });
  });
});

describe("GitHubApi — écriture par l'API", () => {
  function recorder(responses: Record<string, unknown>) {
    const calls: { method: string; url: string; body?: unknown }[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ method: init?.method ?? "GET", url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const key = Object.keys(responses).find((k) => url.endsWith(k));
      if (!key) return new Response("{}", { status: 404 });
      return Response.json(responses[key]);
    }) as typeof fetch;
    return { calls, fetchImpl };
  }

  it("crée une branche avec un seul commit : modifications et suppressions", async () => {
    const { calls, fetchImpl } = recorder({
      "/git/commits/base1": { tree: { sha: "tree0" } },
      "/git/trees": { sha: "tree1" },
      "/git/commits": { sha: "commit2" },
      "/git/refs": { ref: "refs/heads/pocketdev/x" },
    });
    const sha = await new GitHubApi(CONFIG, fetchImpl).commitToNewBranch("t", "a/x", {
      baseCommit: "base1",
      branch: "pocketdev/x",
      message: "PocketDev : test",
      changes: new Map([
        ["src/a.ts", "nouveau"],
        ["vieux.txt", null],
      ]),
    });
    expect(sha).toBe("commit2");
    expect(calls.map((c) => `${c.method} ${c.url.replace("https://api.github.com/repos/a/x", "")}`)).toEqual([
      "GET /git/commits/base1",
      "POST /git/trees",
      "POST /git/commits",
      "POST /git/refs",
    ]);
    expect(calls[1]!.body).toEqual({
      base_tree: "tree0",
      tree: [
        { path: "src/a.ts", mode: "100644", type: "blob", content: "nouveau" },
        { path: "vieux.txt", mode: "100644", type: "blob", sha: null },
      ],
    });
    expect(calls[2]!.body).toEqual({ message: "PocketDev : test", tree: "tree1", parents: ["base1"] });
    expect(calls[3]!.body).toEqual({ ref: "refs/heads/pocketdev/x", sha: "commit2" });
  });

  it("lit l'arborescence d'une branche et renvoie null pour un fichier absent", async () => {
    const { fetchImpl } = recorder({
      "/git/ref/heads/feature/x": { object: { sha: "c1" } },
      "/git/trees/c1?recursive=1": { tree: [{ path: "src", type: "tree" }, { path: "src/a.ts", type: "blob" }], truncated: false },
    });
    const api = new GitHubApi(CONFIG, fetchImpl);
    expect(await api.snapshot("t", "a/x", "feature/x")).toEqual({ commit: "c1", files: ["src/a.ts"], truncated: false });
    expect(await api.readFile("t", "a/x", "c1", "absent.ts")).toBeNull();
  });

  it("reconstitue un diff unifié depuis la comparaison", async () => {
    const { fetchImpl } = recorder({
      "/compare/c1...pocketdev/x": { files: [{ filename: "a.ts", patch: "@@ -1 +1 @@\n-a\n+b" }, { filename: "img.png" }] },
    });
    const diff = await new GitHubApi(CONFIG, fetchImpl).compare("t", "a/x", "c1", "pocketdev/x");
    expect(diff).toBe(
      "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-a\n+b\n" +
        "diff --git a/img.png b/img.png\n--- a/img.png\n+++ b/img.png\n(fichier binaire ou trop gros pour être affiché)",
    );
  });
});
