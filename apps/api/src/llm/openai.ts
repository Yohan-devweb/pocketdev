import { type ChatMessage, type LlmClient, type LlmResponse, providerError, type ToolSpec } from "./types";

type OpenAiMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

/**
 * API « Chat Completions », commune à OpenAI et OpenRouter (même format, adresse différente).
 */
export class OpenAiCompatibleClient implements LlmClient {
  constructor(
    private readonly label: string,
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init),
    private readonly extraHeaders: Record<string, string> = {},
  ) {}

  async complete(system: string, messages: ChatMessage[], tools: ToolSpec[]): Promise<LlmResponse> {
    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", ...this.extraHeaders },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "system", content: system }, ...messages.flatMap(toOpenAi)],
        tools: tools.map((t) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.parameters },
        })),
      }),
    });
    if (!res.ok) throw await providerError(this.label, res);
    const body = (await res.json()) as {
      choices: {
        finish_reason: string;
        message: {
          content: string | null;
          tool_calls?: { id: string; function: { name: string; arguments: string } }[];
        };
      }[];
    };
    const choice = body.choices[0];
    if (!choice) return { text: "", toolCalls: [], stop: "end" };
    const toolCalls = (choice.message.tool_calls ?? []).map((c) => ({
      id: c.id,
      name: c.function.name,
      input: parseArguments(c.function.arguments),
    }));
    return {
      text: choice.message.content ?? "",
      toolCalls,
      stop: toolCalls.length > 0 ? "tool_use" : choice.finish_reason === "length" ? "length" : "end",
    };
  }
}

/** Les arguments arrivent en texte JSON ; un JSON invalide devient une erreur renvoyée à l'outil. */
function parseArguments(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw || "{}") as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return { __invalid_json: raw.slice(0, 200) };
  }
}

function toOpenAi(message: ChatMessage): OpenAiMessage[] {
  switch (message.role) {
    case "user":
      return [{ role: "user", content: message.text }];
    case "assistant":
      return [
        {
          role: "assistant",
          content: message.text || null,
          ...(message.toolCalls.length > 0
            ? {
                tool_calls: message.toolCalls.map((c) => ({
                  id: c.id,
                  type: "function" as const,
                  function: { name: c.name, arguments: JSON.stringify(c.input) },
                })),
              }
            : {}),
        },
      ];
    case "tool":
      return message.results.map((r) => ({ role: "tool" as const, tool_call_id: r.id, content: r.content }));
  }
}
