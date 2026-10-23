import { AiKeyVerifier } from "./ai/keys";
import { createApp } from "./app";
import { githubFromEnv } from "./github/api";
import { AgentRunDispatcher } from "./runs/agent-object";
import { D1Store } from "./store-d1";

export { WorkspaceContainer } from "./runner/cloudflare";
export { AgentRunObject } from "./runs/agent-object";

export default createApp({
  store: (env) => new D1Store(env.DB),
  github: githubFromEnv,
  aiKeys: () => new AiKeyVerifier(),
  // Agent par API : aucun conteneur, rien à payer en plus. Le runner (CloudflareRunnerProvider)
  // reste disponible pour une offre avec exécution de commandes et preview en direct.
  runs: (env) => new AgentRunDispatcher(env.AGENT_RUN),
});
