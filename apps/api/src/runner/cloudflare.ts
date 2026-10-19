import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env";
import type { ExecOptions, ExecResult, Runner, RunnerProvider } from "./types";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
/** Le conteneur s'arrête seul après 15 minutes sans activité. */
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;

/** Un Durable Object par tâche, qui pilote son propre conteneur. */
export class WorkspaceContainer extends DurableObject<Env> {
  private get container(): Container {
    const container = this.ctx.container;
    if (!container) throw new Error("Le binding conteneur n'est pas configuré");
    return container;
  }

  private async ensureStarted(): Promise<Container> {
    const container = this.container;
    if (!container.running) {
      const image = container.images.workspace;
      if (!image) throw new Error("Image « workspace » introuvable");
      // Phase 0 : accès Internet ouvert pour cloner et installer. Le filtrage réseau
      // exigé par le cahier des charges arrive avec la gestion des sorties HTTP.
      container.start({ image, enableInternet: true });
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
}
