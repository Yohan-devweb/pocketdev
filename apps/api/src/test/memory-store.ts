import type { CodeKind, CodeRecord, NewProject, ProjectRecord, Store, UserRecord } from "../store";

/** Store en mémoire pour les tests ; même contrat que D1Store. */
export class MemoryStore implements Store {
  users = new Map<string, UserRecord>();
  sessions = new Map<string, { userId: string; expiresAt: string }>();
  codes = new Map<string, CodeRecord & { kind: CodeKind; expiresAt: string }>();
  projects = new Map<string, ProjectRecord>();
  auditLog: { actorId: string; action: string; target: string; result: string }[] = [];

  async upsertUser(user: Omit<UserRecord, "id">) {
    const existing = [...this.users.values()].find((u) => u.githubId === user.githubId);
    const record = { ...user, id: existing?.id ?? crypto.randomUUID() };
    this.users.set(record.id, record);
    return record;
  }
  async getUser(id: string) {
    return this.users.get(id) ?? null;
  }
  async updateUserTokens(id: string, t: Pick<UserRecord, "githubTokenEnc" | "githubRefreshEnc" | "githubTokenExpiresAt">) {
    const user = this.users.get(id);
    if (user) this.users.set(id, { ...user, ...t });
  }
  async createSession(tokenHash: string, userId: string, expiresAt: string) {
    this.sessions.set(tokenHash, { userId, expiresAt });
  }
  async getSessionUserId(tokenHash: string, now: string) {
    const s = this.sessions.get(tokenHash);
    return s && s.expiresAt > now ? s.userId : null;
  }
  async deleteSession(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }
  async putCode(codeHash: string, kind: CodeKind, record: CodeRecord, expiresAt: string) {
    this.codes.set(codeHash, { ...record, kind, expiresAt });
  }
  async takeCode(codeHash: string, kind: CodeKind, now: string) {
    const code = this.codes.get(codeHash);
    if (!code || code.kind !== kind) return null;
    this.codes.delete(codeHash);
    return code.expiresAt > now ? { userId: code.userId, redirectUri: code.redirectUri } : null;
  }
  async listProjects(ownerId: string) {
    return [...this.projects.values()].filter((p) => p.ownerId === ownerId);
  }
  async getProject(id: string, ownerId: string) {
    const p = this.projects.get(id);
    return p && p.ownerId === ownerId ? p : null;
  }
  async insertProject(p: NewProject) {
    const record: ProjectRecord = {
      ...p,
      id: crypto.randomUUID(),
      stack: null,
      status: "active",
      createdAt: new Date().toISOString(),
    };
    this.projects.set(record.id, record);
    return record;
  }
  async audit(e: { actorId: string; action: string; target: string; result: "ok" | "denied" | "error" }) {
    this.auditLog.push(e);
  }
}
