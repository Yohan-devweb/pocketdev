/**
 * Contrat commun à tous les fournisseurs de runners (Cloudflare aujourd'hui, E2B ou serveurs
 * dédiés plus tard). Le reste de l'API ne dépend que de ces interfaces.
 */

export interface ExecOptions {
  cwd?: string;
  /** Variables passées à cette commande seulement ; jamais écrites sur le disque. */
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface Runner {
  readonly id: string;
  exec(cmd: string[], options?: ExecOptions): Promise<ExecResult>;
  /** Relaie une requête HTTP vers un port ouvert dans le runner (preview). */
  fetchPort(port: number, request: Request): Promise<Response>;
  destroy(): Promise<void>;
}

export interface RunnerProvider {
  /** Retourne le runner dédié à une tâche, en le démarrant si besoin. */
  acquire(runId: string): Promise<Runner>;
}
