import type { AiKeySummary, AiProvider, RunStatus } from "@pocketdev/shared";
import type { CodeKind, CodeRecord, NewProject, NewRun, ProjectRecord, RunRecord, RunUpdate, Store, UserRecord } from "./store";

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

interface RunRow {
  id: string;
  project_id: string;
  owner_id: string;
  goal: string;
  provider: AiProvider;
  model: string;
  status: RunStatus;
  base_branch: string;
  branch: string | null;
  files: string;
  diff: string | null;
  summary: string | null;
  log: string;
  error: string | null;
  created_at: string;
  finished_at: string | null;
}

const toRun = (r: RunRow): RunRecord => ({
  id: r.id,
  projectId: r.project_id,
  ownerId: r.owner_id,
  goal: r.goal,
  provider: r.provider,
  model: r.model,
  status: r.status,
  baseBranch: r.base_branch,
  branch: r.branch,
  files: JSON.parse(r.files) as string[],
  diff: r.diff,
  summary: r.summary,
  log: r.log,
  error: r.error,
  createdAt: r.created_at,
  finishedAt: r.finished_at,
});

/** Colonnes modifiables d'une demande, dans le nom attendu par SQL. */
const RUN_COLUMNS: Record<keyof RunUpdate, string> = {
  status: "status",
  branch: "branch",
  files: "files",
  diff: "diff",
  summary: "summary",
  log: "log",
  error: "error",
  finishedAt: "finished_at",
};

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

  async listAiKeys(userId: string): Promise<AiKeySummary[]> {
    const { results } = await this.db
      .prepare("SELECT provider, key_hint, updated_at FROM ai_keys WHERE user_id = ?1 ORDER BY provider")
      .bind(userId)
      .all<{ provider: AiProvider; key_hint: string; updated_at: string }>();
    return results.map((r) => ({ provider: r.provider, hint: r.key_hint, updatedAt: r.updated_at }));
  }

  async getAiKeyEnc(userId: string, provider: AiProvider): Promise<string | null> {
    const row = await this.db
      .prepare("SELECT key_enc FROM ai_keys WHERE user_id = ?1 AND provider = ?2")
      .bind(userId, provider)
      .first<{ key_enc: string }>();
    return row?.key_enc ?? null;
  }

  async putAiKey(userId: string, provider: AiProvider, keyEnc: string, hint: string): Promise<AiKeySummary> {
    const updatedAt = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO ai_keys (user_id, provider, key_enc, key_hint, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (user_id, provider) DO UPDATE SET
           key_enc = excluded.key_enc, key_hint = excluded.key_hint, updated_at = excluded.updated_at`,
      )
      .bind(userId, provider, keyEnc, hint, updatedAt)
      .run();
    return { provider, hint, updatedAt };
  }

  async deleteAiKey(userId: string, provider: AiProvider): Promise<void> {
    await this.db.prepare("DELETE FROM ai_keys WHERE user_id = ?1 AND provider = ?2").bind(userId, provider).run();
  }

  async createRun(run: NewRun): Promise<RunRecord> {
    const row = await this.db
      .prepare(
        `INSERT INTO runs (id, project_id, owner_id, goal, provider, model, status, base_branch, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'queued', ?7, ?8)
         RETURNING *`,
      )
      .bind(crypto.randomUUID(), run.projectId, run.ownerId, run.goal, run.provider, run.model, run.baseBranch, new Date().toISOString())
      .first<RunRow>();
    if (!row) throw new Error("Échec de l'enregistrement de la demande");
    return toRun(row);
  }

  async getRun(id: string): Promise<RunRecord | null> {
    const row = await this.db.prepare("SELECT * FROM runs WHERE id = ?1").bind(id).first<RunRow>();
    return row ? toRun(row) : null;
  }

  async listRuns(projectId: string, ownerId: string, limit: number): Promise<RunRecord[]> {
    const { results } = await this.db
      .prepare("SELECT * FROM runs WHERE project_id = ?1 AND owner_id = ?2 ORDER BY created_at DESC LIMIT ?3")
      .bind(projectId, ownerId, limit)
      .all<RunRow>();
    return results.map(toRun);
  }

  async hasActiveRun(projectId: string): Promise<boolean> {
    const row = await this.db
      .prepare("SELECT 1 AS active FROM runs WHERE project_id = ?1 AND status IN ('queued', 'running') LIMIT 1")
      .bind(projectId)
      .first<{ active: number }>();
    return row !== null;
  }

  async updateRun(id: string, update: RunUpdate): Promise<void> {
    const entries = Object.entries(update).filter(([, value]) => value !== undefined) as [keyof RunUpdate, unknown][];
    if (entries.length === 0) return;
    const sets = entries.map(([key], i) => `${RUN_COLUMNS[key]} = ?${i + 2}`).join(", ");
    const values = entries.map(([key, value]) => (key === "files" ? JSON.stringify(value) : value));
    await this.db.prepare(`UPDATE runs SET ${sets} WHERE id = ?1`).bind(id, ...values).run();
  }

  async audit(e: { actorId: string; action: string; target: string; result: "ok" | "denied" | "error" }): Promise<void> {
    await this.db
      .prepare("INSERT INTO audit_events (id, actor_id, action, target, result, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
      .bind(crypto.randomUUID(), e.actorId, e.action, e.target, e.result, new Date().toISOString())
      .run();
  }
}
