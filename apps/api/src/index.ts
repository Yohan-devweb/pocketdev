import { createApp } from "./app";
import { GitHubApi } from "./github/api";
import { D1Store } from "./store-d1";

export { WorkspaceContainer } from "./runner/cloudflare";

export default createApp({
  store: (env) => new D1Store(env.DB),
  github: (env) =>
    new GitHubApi({
      appId: env.GITHUB_APP_ID,
      slug: env.GITHUB_APP_SLUG,
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      privateKey: env.GITHUB_PRIVATE_KEY,
    }),
});
