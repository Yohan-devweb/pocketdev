import type { WorkspaceContainer } from "./runner/cloudflare";

export interface Env {
  WORKSPACE: DurableObjectNamespace<WorkspaceContainer>;
}
