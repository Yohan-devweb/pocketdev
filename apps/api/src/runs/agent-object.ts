import { DurableObject } from "cloudflare:workers";
import { SecretBox } from "../crypto";
import type { Env } from "../env";
import { githubFromEnv } from "../github/api";
import { createLlm } from "../llm";
import { D1Store } from "../store-d1";
import type { RunDispatcher } from "./dispatcher";
import { executeApiRun } from "./execute-api";

/**
 * Un Durable Object par demande, sans conteneur : son alarme exécute l'agent par API
 * (jusqu'à 15 minutes), hors de la requête HTTP. Disponible avec l'offre Workers gratuite.
 */
export class AgentRunObject extends DurableObject<Env> {
  async dispatch(runId: string): Promise<void> {
    await this.ctx.storage.put("runId", runId);
    await this.ctx.storage.setAlarm(Date.now());
  }

  async alarm(): Promise<void> {
    const runId = await this.ctx.storage.get<string>("runId");
    if (!runId) return;
    await executeApiRun(runId, {
      store: new D1Store(this.env.DB),
      github: githubFromEnv(this.env),
      secrets: await SecretBox.fromBase64Key(this.env.SECRETS_KEY),
      llm: createLlm,
    });
  }
}

export class AgentRunDispatcher implements RunDispatcher {
  constructor(private readonly namespace: DurableObjectNamespace<AgentRunObject>) {}

  dispatch(runId: string): Promise<void> {
    return this.namespace.getByName(runId).dispatch(runId);
  }
}
