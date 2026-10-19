import { DurableObject } from "cloudflare:workers";
import { SecretBox } from "../crypto";
import type { Env } from "../env";
import { githubFromEnv } from "../github/api";
import { executeRun } from "../runs/execute";
import { D1Store } from "../store-d1";
import type { ExecOptions, ExecResult, Runner, RunnerProvider } from "./types";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
/** Le conteneur s'arrête seul après 15 minutes sans activité. */
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;

/** Un Durable Object par tâche, qui pilote son propre conteneur. */
export class WorkspaceContainer extends DurableObject<Env> {
  private get container(): Container {
    const container = this.ctx.container;
    // En local, `wrangler dev --enable-containers=false` démarre l'API sans Docker, donc sans runner.
    if (!container) throw new Error("aucun conteneur disponible sur ce serveur (en local, Docker est nécessaire)");
    return container;
  }

  /** Mémorise la demande puis rend la main : l'alarme l'exécute hors de la requête HTTP. */
  async dispatch(runId: string): Promise<void> {
    await this.ctx.storage.put("runId", runId);
    await this.ctx.storage.setAlarm(Date.now());
  }

  async alarm(): Promise<void> {
    const runId = await this.ctx.storage.get<string>("runId");
    if (!runId) return;
    const self: Runner = {
      id: runId,
      exec: (cmd, options) => this.exec(cmd, options),
      fetchPort: (port, request) => this.fetchPort(port, request),
      destroy: () => this.destroy(),
    };
    await executeRun(runId, {
      store: new D1Store(this.env.DB),
      github: githubFromEnv(this.env),
      secrets: await SecretBox.fromBase64Key(this.env.SECRETS_KEY),
      runner: self,
    });
  }

  private async ensureStarted(): Promise<Container> {
    const container = this.container;
    if (!container.running) {
      const image = container.images.workspace;
      if (!image) throw new Error("Image « workspace » introuvable");
      // Phase 0 : accès Internet ouvert pour cloner et installer. Le filtrage réseau
      // exigé par le cahier des charges arrive avec la gestion des sorties HTTP.
      // « basic » (1 Gio de mémoire) : de quoi cloner un dépôt et faire tourner l'agent (Python).
      container.start({ image, enableInternet: true, instance: "basic" });
      await container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);
    }
    return container;
  }

  async exec(cmd: string[], options: ExecOptions = {}): Promise<ExecResult> {
    const container = await this.ensureStarted();
    const process = await container.exec(cmd, {
      cwd: options.cwd ?? "/workspace",
      env: options.env,
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    const { exitCode, stdout, stderr } = await process.output();
    const decoder = new TextDecoder();
    return { exitCode, stdout: decoder.decode(stdout), stderr: decoder.decode(stderr) };
  }

  async fetchPort(port: number, request: Request): Promise<Response> {
    const container = await this.ensureStarted();
    return container.getTcpPort(port).fetch(request);
  }

  async destroy(): Promise<void> {
    if (this.ctx.container?.running) await this.ctx.container.destroy();
  }
}

export class CloudflareRunnerProvider implements RunnerProvider {
  constructor(private readonly namespace: DurableObjectNamespace<WorkspaceContainer>) {}

  async acquire(runId: string): Promise<Runner> {
    const stub = this.namespace.getByName(runId);
    return {
      id: runId,
      exec: (cmd, options) => stub.exec(cmd, options),
      fetchPort: (port, request) => stub.fetchPort(port, request),
      destroy: () => stub.destroy(),
    };
  }

  dispatch(runId: string): Promise<void> {
    return this.namespace.getByName(runId).dispatch(runId);
  }
}
