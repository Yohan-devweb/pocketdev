import type { Id, RunStatus } from "./domain";

/** Événements de progression envoyés à l'app (SSE) pendant une tâche. */
export type RunEvent =
  | { type: "status"; runId: Id; status: RunStatus }
  | { type: "log"; runId: Id; stream: "stdout" | "stderr"; line: string }
  | { type: "preview"; runId: Id; url: string }
  | { type: "diff"; runId: Id; files: string[] };

export const TERMINAL_STATUSES: readonly RunStatus[] = ["succeeded", "failed", "cancelled"];

export function isTerminal(status: RunStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
