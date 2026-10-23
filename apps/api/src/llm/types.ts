/** Interface commune aux fournisseurs d'IA : l'agent ne dépend que de ces types. */

export interface ToolSpec {
  name: string;
  description: string;
  /** Schéma JSON des arguments. */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type ChatMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolCalls: ToolCall[] }
  | { role: "tool"; results: { id: string; content: string }[] };

export interface LlmResponse {
  text: string;
  toolCalls: ToolCall[];
  /** « length » : la réponse a été coupée par la limite de longueur. */
  stop: "tool_use" | "end" | "length";
}

export interface LlmClient {
  complete(system: string, messages: ChatMessage[], tools: ToolSpec[]): Promise<LlmResponse>;
}

/** Erreur du fournisseur d'IA, expliquée à l'utilisateur sans jamais citer sa clé. */
export class LlmError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Message d'erreur lisible à partir de la réponse d'un fournisseur. */
export async function providerError(label: string, res: Response): Promise<LlmError> {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } | string } | null;
  const detail = typeof body?.error === "string" ? body.error : body?.error?.message;
  if (res.status === 401 || res.status === 403) return new LlmError(res.status, `${label} a refusé la clé`);
  if (res.status === 429) return new LlmError(429, `${label} : limite d'utilisation atteinte (quota ou crédit)`);
  return new LlmError(res.status, `${label} : erreur ${res.status}${detail ? ` (${detail.slice(0, 200)})` : ""}`);
}
