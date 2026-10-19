// Entités essentielles du cahier des charges (section 4). Partagées entre l'app et l'API.

export type Id = string;
export type IsoDate = string;

export type ProjectType = "web" | "saas" | "mobile";

export interface Project {
  id: Id;
  ownerId: Id;
  name: string;
  type: ProjectType;
  stack: string | null;
  /** "owner/repo" sur GitHub, source de vérité du code. */
  repository: string;
  defaultBranch: string;
  status: "active" | "archived";
  createdAt: IsoDate;
}

export type ConnectionProvider =
  | "github"
  | "cloudflare"
  | "vercel"
  | "supabase"
  | "anthropic"
  | "openai"
  | "openrouter"
  | "stripe";

/** Le secret lui-même ne quitte jamais le serveur : on ne manipule qu'une référence. */
export interface Connection {
  id: Id;
  ownerId: Id;
  provider: ConnectionProvider;
  scopes: string[];
  secretRef: string;
  state: "connected" | "revoked" | "error";
}

export type AgentRole = "orchestrator" | "frontend" | "backend" | "qa";

export type RunStatus =
  | "awaiting_approval"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface AgentRun {
  id: Id;
  projectId: Id;
  goal: string;
  plan: string | null;
  agent: AgentRole;
  status: RunStatus;
  /** Branche de travail isolée créée pour cette tâche. */
  branch: string | null;
  costUsd: number | null;
  createdAt: IsoDate;
  finishedAt: IsoDate | null;
}

export interface ChangeSet {
  runId: Id;
  branch: string;
  baseCommit: string;
  diff: string;
  tests: { command: string; exitCode: number }[];
}

export type DeployProvider = "cloudflare" | "vercel";
export type DeployEnvironment = "preview" | "staging" | "production";

export interface Deployment {
  id: Id;
  projectId: Id;
  provider: DeployProvider;
  environment: DeployEnvironment;
  commit: string;
  url: string | null;
  status: "pending" | "building" | "ready" | "failed";
  createdAt: IsoDate;
}

export interface AuditEvent {
  id: Id;
  actorId: Id;
  action: string;
  target: string;
  result: "ok" | "denied" | "error";
  at: IsoDate;
}

/** Fournisseurs d'IA pour lesquels l'utilisateur apporte sa propre clé (BYOK). */
export type AiProvider = "anthropic" | "openai" | "openrouter";

export const AI_PROVIDERS: readonly AiProvider[] = ["anthropic", "openai", "openrouter"];

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: "Claude (Anthropic)",
  openai: "ChatGPT (OpenAI)",
  openrouter: "OpenRouter",
};

/** Ce que l'app voit d'une clé IA : jamais la clé elle-même, seulement ses 4 derniers caractères. */
export interface AiKeySummary {
  provider: AiProvider;
  hint: string;
  updatedAt: IsoDate;
}

/** Modèle proposé par défaut ; l'utilisateur peut en saisir un autre de son fournisseur. */
export const DEFAULT_AI_MODELS: Record<AiProvider, string> = {
  anthropic: "claude-sonnet-5-5",
  openai: "gpt-6-astra",
  openrouter: "anthropic/claude-sonnet-5.5",
};

/** Une demande confiée à l'agent de code, telle que l'app l'affiche. */
export interface AgentRunDetails {
  id: Id;
  projectId: Id;
  goal: string;
  provider: AiProvider;
  model: string;
  status: RunStatus;
  baseBranch: string;
  /** Branche poussée sur GitHub quand l'agent a modifié des fichiers. */
  branch: string | null;
  files: string[];
  diff: string | null;
  /** Fin du journal de l'agent, pour comprendre ce qu'il a fait. */
  log: string;
  error: string | null;
  createdAt: IsoDate;
  finishedAt: IsoDate | null;
}
