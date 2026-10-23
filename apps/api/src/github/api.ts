import type { Env } from "../env";
import { signAppJwt } from "../crypto";

/** Configuration de la GitHub App, lue depuis les secrets du Worker. */
export interface GitHubAppConfig {
  appId: string;
  slug: string;
  clientId: string;
  clientSecret: string;
  privateKey: string;
}

export interface UserTokens {
  accessToken: string;
  refreshToken: string | null;
  /** ISO ; null si les jetons utilisateur n'expirent pas. */
  expiresAt: string | null;
}

export interface GitHubUser {
  id: number;
  login: string;
}

export interface GitHubRepo {
  fullName: string;
  private: boolean;
  defaultBranch: string;
  installationId: number;
}

export interface RepoEntry {
  name: string;
  path: string;
  type: "file" | "dir" | "symlink" | "submodule";
}

/** Contenu final d'un fichier modifié par l'agent ; null pour une suppression. */
export type FileChanges = Map<string, string | null>;

export interface RepoSnapshot {
  /** Commit de la branche de base au moment de la lecture. */
  commit: string;
  /** Chemins des fichiers du dépôt (sans les dossiers). */
  files: string[];
  /** Vrai si GitHub a tronqué l'arborescence (dépôt très gros). */
  truncated: boolean;
}

const encodePath = (path: string) => path.split("/").filter(Boolean).map(encodeURIComponent).join("/");

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const API = "https://api.github.com";

/** Accès à GitHub : OAuth de l'utilisateur et jetons d'installation de l'App. */
export class GitHubApi {
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly config: GitHubAppConfig,
    fetchImpl: typeof fetch = fetch,
  ) {
    // Appelé comme méthode, `fetch` recevrait l'instance comme `this` : Workers refuse (« Illegal invocation »).
    this.fetchImpl = (input, init) => fetchImpl(input, init);
  }

  authorizeUrl(state: string): string {
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("state", state);
    return url.toString();
  }

  installUrl(): string {
    return `https://github.com/apps/${this.config.slug}/installations/new`;
  }

  exchangeCode(code: string): Promise<UserTokens> {
    return this.tokenRequest({ code });
  }

  refreshUserToken(refreshToken: string): Promise<UserTokens> {
    return this.tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
  }

  private async tokenRequest(params: Record<string, string>): Promise<UserTokens> {
    const res = await this.fetchImpl("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: this.config.clientId, client_secret: this.config.clientSecret, ...params }),
    });
    const body = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
    };
    if (!res.ok || !body.access_token) {
      throw new GitHubError(401, `GitHub a refusé l'autorisation (${body.error ?? res.status})`);
    }
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? null,
      expiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1000).toISOString() : null,
    };
  }

  private async request<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetchImpl(`${API}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "PocketDev",
        "X-GitHub-Api-Version": "2022-11-28",
        ...init.headers,
      },
    });
    if (!res.ok) throw new GitHubError(res.status, `GitHub ${path} : ${res.status}`);
    return (await res.json()) as T;
  }

  getUser(userToken: string): Promise<GitHubUser> {
    return this.request<GitHubUser>("/user", userToken);
  }

  /** Dépôts que l'utilisateur a autorisés pour l'App, toutes installations confondues. */
  async listUserRepos(userToken: string): Promise<GitHubRepo[]> {
    const { installations } = await this.request<{ installations: { id: number }[] }>(
      "/user/installations?per_page=100",
      userToken,
    );
    const repos: GitHubRepo[] = [];
    for (const installation of installations) {
      const { repositories } = await this.request<{
        repositories: { full_name: string; private: boolean; default_branch: string }[];
      }>(`/user/installations/${installation.id}/repositories?per_page=100`, userToken);
      for (const repo of repositories) {
        repos.push({
          fullName: repo.full_name,
          private: repo.private,
          defaultBranch: repo.default_branch,
          installationId: installation.id,
        });
      }
    }
    return repos;
  }

  /**
   * Jeton d'installation limité à un dépôt. Lecture seule par défaut ; l'écriture ne sert
   * qu'à pousser la branche de travail d'une demande.
   */
  async installationToken(installationId: number, repository: string, access: "read" | "write" = "read"): Promise<string> {
    const jwt = await signAppJwt(this.config.appId, this.config.privateKey).catch(() => {
      throw new GitHubError(503, "La GitHub App PocketDev n'est pas configurée sur le serveur");
    });
    const repoName = repository.split("/")[1];
    const { token } = await this.request<{ token: string }>(`/app/installations/${installationId}/access_tokens`, jwt, {
      method: "POST",
      body: JSON.stringify({ repositories: [repoName], permissions: { contents: access, metadata: "read" } }),
    });
    return token;
  }

  async listBranches(token: string, repository: string): Promise<string[]> {
    const branches = await this.request<{ name: string }[]>(`/repos/${repository}/branches?per_page=100`, token);
    return branches.map((b) => b.name);
  }

  async listDirectory(token: string, repository: string, ref: string, path = ""): Promise<RepoEntry[]> {
    const encodedPath = encodePath(path);
    const entries = await this.request<RepoEntry[] | RepoEntry>(
      `/repos/${repository}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
      token,
    );
    const list = Array.isArray(entries) ? entries : [entries];
    return list
      .map(({ name, path, type }) => ({ name, path, type }))
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
  }

  /** Commit de tête d'une branche et liste complète de ses fichiers. */
  async snapshot(token: string, repository: string, branch: string): Promise<RepoSnapshot> {
    const ref = await this.request<{ object: { sha: string } }>(
      `/repos/${repository}/git/ref/heads/${encodePath(branch)}`,
      token,
    );
    const tree = await this.request<{ tree: { path: string; type: string }[]; truncated: boolean }>(
      `/repos/${repository}/git/trees/${ref.object.sha}?recursive=1`,
      token,
    );
    return {
      commit: ref.object.sha,
      files: tree.tree.filter((entry) => entry.type === "blob").map((entry) => entry.path),
      truncated: tree.truncated,
    };
  }

  /** Contenu texte d'un fichier à un commit donné ; null s'il n'existe pas. */
  async readFile(token: string, repository: string, ref: string, path: string): Promise<string | null> {
    const res = await this.fetchImpl(`${API}/repos/${repository}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`, {
      headers: {
        Accept: "application/vnd.github.raw+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "PocketDev",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new GitHubError(res.status, `GitHub contents : ${res.status}`);
    return res.text();
  }

  /**
   * Crée une nouvelle branche portant un seul commit avec les changements, au-dessus du commit
   * de base. Ne touche jamais une branche existante : GitHub refuse si la branche existe déjà.
   */
  async commitToNewBranch(
    token: string,
    repository: string,
    input: { baseCommit: string; branch: string; message: string; changes: FileChanges },
  ): Promise<string> {
    const base = await this.request<{ tree: { sha: string } }>(`/repos/${repository}/git/commits/${input.baseCommit}`, token);
    const entries = [...input.changes].map(([path, content]) =>
      content === null
        ? { path, mode: "100644", type: "blob", sha: null }
        : { path, mode: "100644", type: "blob", content },
    );
    const tree = await this.request<{ sha: string }>(`/repos/${repository}/git/trees`, token, {
      method: "POST",
      body: JSON.stringify({ base_tree: base.tree.sha, tree: entries }),
    });
    const commit = await this.request<{ sha: string }>(`/repos/${repository}/git/commits`, token, {
      method: "POST",
      body: JSON.stringify({ message: input.message, tree: tree.sha, parents: [input.baseCommit] }),
    });
    await this.request(`/repos/${repository}/git/refs`, token, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${input.branch}`, sha: commit.sha }),
    });
    return commit.sha;
  }

  /** Diff unifié entre deux références, reconstitué depuis l'API de comparaison. */
  async compare(token: string, repository: string, base: string, head: string): Promise<string> {
    const result = await this.request<{ files?: { filename: string; previous_filename?: string; patch?: string }[] }>(
      `/repos/${repository}/compare/${base}...${encodePath(head)}`,
      token,
    );
    return (result.files ?? [])
      .map((file) => {
        const before = file.previous_filename ?? file.filename;
        const header = `diff --git a/${before} b/${file.filename}\n--- a/${before}\n+++ b/${file.filename}`;
        return file.patch ? `${header}\n${file.patch}` : `${header}\n(fichier binaire ou trop gros pour être affiché)`;
      })
      .join("\n");
  }
}

export function githubFromEnv(env: Env): GitHubApi {
  return new GitHubApi({
    appId: env.GITHUB_APP_ID,
    slug: env.GITHUB_APP_SLUG,
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    privateKey: env.GITHUB_PRIVATE_KEY,
  });
}
