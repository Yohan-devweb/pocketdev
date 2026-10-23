import type { WorkspaceContainer } from "./runner/cloudflare";
import type { AgentRunObject } from "./runs/agent-object";

export interface Env {
  WORKSPACE: DurableObjectNamespace<WorkspaceContainer>;
  AGENT_RUN: DurableObjectNamespace<AgentRunObject>;
  DB: D1Database;
  // Secrets (wrangler secret put) — voir docs/github-app.md.
  GITHUB_APP_ID: string;
  GITHUB_APP_SLUG: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_PRIVATE_KEY: string;
  /** Clé AES de 32 octets en base64 pour chiffrer les jetons stockés. */
  SECRETS_KEY: string;
  /** Préfixes de redirection autorisés vers l'app, séparés par des virgules. */
  APP_REDIRECT_PREFIXES: string;
}
