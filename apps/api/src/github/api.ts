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
  constructor(
    private readonly config: GitHubAppConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

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

  /** Jeton d'installation limité à un dépôt et à la lecture du contenu. */
  async installationToken(installationId: number, repository: string): Promise<string> {
    const jwt = await signAppJwt(this.config.appId, this.config.privateKey).catch(() => {
      throw new GitHubError(503, "La GitHub App PocketDev n'est pas configurée sur le serveur");
    });
    const repoName = repository.split("/")[1];
    const { token } = await this.request<{ token: string }>(`/app/installations/${installationId}/access_tokens`, jwt, {
      method: "POST",
      body: JSON.stringify({ repositories: [repoName], permissions: { contents: "read", metadata: "read" } }),
    });
    return token;
  }

  async listBranches(token: string, repository: string): Promise<string[]> {
    const branches = await this.request<{ name: string }[]>(`/repos/${repository}/branches?per_page=100`, token);
    return branches.map((b) => b.name);
  }

  async listDirectory(token: string, repository: string, ref: string, path = ""): Promise<RepoEntry[]> {
    const encodedPath = path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
    const entries = await this.request<RepoEntry[] | RepoEntry>(
      `/repos/${repository}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
      token,
    );
    const list = Array.isArray(entries) ? entries : [entries];
    return list
      .map(({ name, path, type }) => ({ name, path, type }))
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
  }
}
