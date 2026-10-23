import type { AgentRunDetails, AiKeySummary, AiProvider, Project, ProjectType } from "@pocketdev/shared";

export interface UserRecord {
  id: string;
  githubId: number;
  githubLogin: string;
  githubTokenEnc: string;
  githubRefreshEnc: string | null;
  githubTokenExpiresAt: string | null;
}

export type CodeKind = "oauth_state" | "login";

export interface CodeRecord {
  userId: string | null;
  redirectUri: string | null;
}

export interface NewProject {
  ownerId: string;
  name: string;
  type: ProjectType;
  repository: string;
  defaultBranch: string;
  installationId: number;
}

export interface ProjectRecord extends Project {
  installationId: number;
}

export interface NewRun {
  projectId: string;
  ownerId: string;
  goal: string;
  provider: AiProvider;
  model: string;
  baseBranch: string;
}

export type RunRecord = AgentRunDetails & { ownerId: string };

export type RunUpdate = Partial<Pick<AgentRunDetails, "status" | "branch" | "files" | "diff" | "summary" | "log" | "error" | "finishedAt">>;

/** Persistance de l'API. D1 en production, une version en mémoire dans les tests. */
export interface Store {
  upsertUser(user: Omit<UserRecord, "id">): Promise<UserRecord>;
  getUser(id: string): Promise<UserRecord | null>;
  updateUserTokens(
    id: string,
    tokens: Pick<UserRecord, "githubTokenEnc" | "githubRefreshEnc" | "githubTokenExpiresAt">,
  ): Promise<void>;

  createSession(tokenHash: string, userId: string, expiresAt: string): Promise<void>;
  /** Utilisateur d'une session encore valide, sinon null. */
  getSessionUserId(tokenHash: string, now: string): Promise<string | null>;
  deleteSession(tokenHash: string): Promise<void>;

  putCode(codeHash: string, kind: CodeKind, record: CodeRecord, expiresAt: string): Promise<void>;
  /** Consomme un code à usage unique : il est supprimé même s'il a expiré. */
  takeCode(codeHash: string, kind: CodeKind, now: string): Promise<CodeRecord | null>;

  listProjects(ownerId: string): Promise<ProjectRecord[]>;
  getProject(id: string, ownerId: string): Promise<ProjectRecord | null>;
  insertProject(project: NewProject): Promise<ProjectRecord>;

  listAiKeys(userId: string): Promise<AiKeySummary[]>;
  /** Clé chiffrée, à ouvrir avec SecretBox juste avant de la transmettre au runner. */
  getAiKeyEnc(userId: string, provider: AiProvider): Promise<string | null>;
  putAiKey(userId: string, provider: AiProvider, keyEnc: string, hint: string): Promise<AiKeySummary>;
  deleteAiKey(userId: string, provider: AiProvider): Promise<void>;

  /** Crée la demande en file d'attente (« queued »). */
  createRun(run: NewRun): Promise<RunRecord>;
  getRun(id: string): Promise<RunRecord | null>;
  listRuns(projectId: string, ownerId: string, limit: number): Promise<RunRecord[]>;
  /** Vrai si une demande du projet est en attente ou en cours. */
  hasActiveRun(projectId: string): Promise<boolean>;
  updateRun(id: string, update: RunUpdate): Promise<void>;

  audit(event: { actorId: string; action: string; target: string; result: "ok" | "denied" | "error" }): Promise<void>;
}
