import { type ChatMessage, type LlmClient, type LlmResponse, providerError, type ToolSpec } from "./types";

const MAX_TOKENS = 16_000;

type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

/** API Messages d'Anthropic (Claude), avec appels d'outils. */
export class AnthropicClient implements LlmClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  async complete(system: string, messages: ChatMessage[], tools: ToolSpec[]): Promise<LlmResponse> {
    const res = await this.fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: MAX_TOKENS,
        system,
        tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
        messages: messages.map(toAnthropic),
      }),
    });
    if (!res.ok) throw await providerError("Claude (Anthropic)", res);
    const body = (await res.json()) as { content: Block[]; stop_reason: string };
    return {
      text: body.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n"),
      toolCalls: body.content.flatMap((b) => (b.type === "tool_use" ? [{ id: b.id, name: b.name, input: b.input }] : [])),
      stop: body.stop_reason === "tool_use" ? "tool_use" : body.stop_reason === "max_tokens" ? "length" : "end",
    };
  }
}

function toAnthropic(message: ChatMessage): { role: "user" | "assistant"; content: Block[] } {
  switch (message.role) {
    case "user":
      return { role: "user", content: [{ type: "text", text: message.text }] };
    case "assistant":
      return {
        role: "assistant",
        content: [
          ...(message.text ? [{ type: "text" as const, text: message.text }] : []),
          ...message.toolCalls.map((c) => ({ type: "tool_use" as const, id: c.id, name: c.name, input: c.input })),
        ],
      };
    case "tool":
      return {
        role: "user",
        content: message.results.map((r) => ({ type: "tool_result" as const, tool_use_id: r.id, content: r.content })),
      };
  }
}
