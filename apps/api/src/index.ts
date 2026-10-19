import { AiKeyVerifier } from "./ai/keys";
import { createApp } from "./app";
import { githubFromEnv } from "./github/api";
import { CloudflareRunnerProvider } from "./runner/cloudflare";
import { D1Store } from "./store-d1";

export { WorkspaceContainer } from "./runner/cloudflare";

export default createApp({
  store: (env) => new D1Store(env.DB),
  github: githubFromEnv,
  aiKeys: () => new AiKeyVerifier(),
  runners: (env) => new CloudflareRunnerProvider(env.WORKSPACE),
});
