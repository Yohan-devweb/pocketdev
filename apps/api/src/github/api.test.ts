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
