import type { CodeKind, CodeRecord, NewProject, ProjectRecord, Store, UserRecord } from "./store";

interface UserRow {
  id: string;
  github_id: number;
  github_login: string;
  github_token_enc: string;
  github_refresh_enc: string | null;
  github_token_expires_at: string | null;
}

interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  type: ProjectRecord["type"];
  stack: string | null;
  repository: string;
  default_branch: string;
  installation_id: number;
  status: ProjectRecord["status"];
  created_at: string;
}

const toUser = (r: UserRow): UserRecord => ({
  id: r.id,
  githubId: r.github_id,
  githubLogin: r.github_login,
  githubTokenEnc: r.github_token_enc,
  githubRefreshEnc: r.github_refresh_enc,
  githubTokenExpiresAt: r.github_token_expires_at,
});

const toProject = (r: ProjectRow): ProjectRecord => ({
  id: r.id,
  ownerId: r.owner_id,
  name: r.name,
  type: r.type,
  stack: r.stack,
  repository: r.repository,
  defaultBranch: r.default_branch,
  installationId: r.installation_id,
  status: r.status,
  createdAt: r.created_at,
});

export class D1Store implements Store {
  constructor(private readonly db: D1Database) {}

  async upsertUser(user: Omit<UserRecord, "id">): Promise<UserRecord> {
    const row = await this.db
      .prepare(
        `INSERT INTO users (id, github_id, github_login, github_token_enc, github_refresh_enc, github_token_expires_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT (github_id) DO UPDATE SET
           github_login = excluded.github_login,
           github_token_enc = excluded.github_token_enc,
           github_refresh_enc = excluded.github_refresh_enc,
           github_token_expires_at = excluded.github_token_expires_at
         RETURNING *`,
      )
      .bind(
        crypto.randomUUID(),
        user.githubId,
        user.githubLogin,
        user.githubTokenEnc,
        user.githubRefreshEnc,
        user.githubTokenExpiresAt,
        new Date().toISOString(),
      )
      .first<UserRow>();
    if (!row) throw new Error("Échec de l'enregistrement du compte");
    return toUser(row);
  }

  async getUser(id: string): Promise<UserRecord | null> {
    const row = await this.db.prepare("SELECT * FROM users WHERE id = ?1").bind(id).first<UserRow>();
    return row ? toUser(row) : null;
  }

  async updateUserTokens(
    id: string,
    t: Pick<UserRecord, "githubTokenEnc" | "githubRefreshEnc" | "githubTokenExpiresAt">,
  ): Promise<void> {
    await this.db
      .prepare(
        "UPDATE users SET github_token_enc = ?2, github_refresh_enc = ?3, github_token_expires_at = ?4 WHERE id = ?1",
      )
      .bind(id, t.githubTokenEnc, t.githubRefreshEnc, t.githubTokenExpiresAt)
      .run();
  }

  async createSession(tokenHash: string, userId: string, expiresAt: string): Promise<void> {
    await this.db
      .prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?1, ?2, ?3)")
      .bind(tokenHash, userId, expiresAt)
      .run();
  }

  async getSessionUserId(tokenHash: string, now: string): Promise<string | null> {
    const row = await this.db
      .prepare("SELECT user_id FROM sessions WHERE token_hash = ?1 AND expires_at > ?2")
      .bind(tokenHash, now)
      .first<{ user_id: string }>();
    return row?.user_id ?? null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.db.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(tokenHash).run();
  }

  async putCode(codeHash: string, kind: CodeKind, record: CodeRecord, expiresAt: string): Promise<void> {
    await this.db
      .prepare("INSERT INTO one_time_codes (code_hash, kind, user_id, redirect_uri, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)")
      .bind(codeHash, kind, record.userId, record.redirectUri, expiresAt)
      .run();
  }

  async takeCode(codeHash: string, kind: CodeKind, now: string): Promise<CodeRecord | null> {
    const row = await this.db
      .prepare("DELETE FROM one_time_codes WHERE code_hash = ?1 AND kind = ?2 RETURNING user_id, redirect_uri, expires_at")
      .bind(codeHash, kind)
      .first<{ user_id: string | null; redirect_uri: string | null; expires_at: string }>();
    if (!row || row.expires_at <= now) return null;
    return { userId: row.user_id, redirectUri: row.redirect_uri };
  }

  async listProjects(ownerId: string): Promise<ProjectRecord[]> {
    const { results } = await this.db
      .prepare("SELECT * FROM projects WHERE owner_id = ?1 AND status = 'active' ORDER BY created_at DESC")
      .bind(ownerId)
      .all<ProjectRow>();
    return results.map(toProject);
  }

  async getProject(id: string, ownerId: string): Promise<ProjectRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM projects WHERE id = ?1 AND owner_id = ?2")
      .bind(id, ownerId)
      .first<ProjectRow>();
    return row ? toProject(row) : null;
  }

  async insertProject(p: NewProject): Promise<ProjectRecord> {
    const row = await this.db
      .prepare(
        `INSERT INTO projects (id, owner_id, name, type, repository, default_branch, installation_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT (owner_id, repository) DO UPDATE SET status = 'active', installation_id = excluded.installation_id
         RETURNING *`,
      )
      .bind(crypto.randomUUID(), p.ownerId, p.name, p.type, p.repository, p.defaultBranch, p.installationId, new Date().toISOString())
      .first<ProjectRow>();
    if (!row) throw new Error("Échec de l'import du projet");
    return toProject(row);
  }

  async audit(e: { actorId: string; action: string; target: string; result: "ok" | "denied" | "error" }): Promise<void> {
    await this.db
      .prepare("INSERT INTO audit_events (id, actor_id, action, target, result, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
      .bind(crypto.randomUUID(), e.actorId, e.action, e.target, e.result, new Date().toISOString())
      .run();
  }
}
