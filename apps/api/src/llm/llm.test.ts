import { describe, expect, it } from "vitest";
import { AnthropicClient } from "./anthropic";
import { OpenAiCompatibleClient } from "./openai";
import { LlmError, type ChatMessage, type ToolSpec } from "./types";

const TOOLS: ToolSpec[] = [{ name: "read_file", description: "lit", parameters: { type: "object" } }];
const HISTORY: ChatMessage[] = [
  { role: "user", text: "Ajoute un pied de page" },
  { role: "assistant", text: "Je regarde.", toolCalls: [{ id: "t1", name: "read_file", input: { path: "a.ts" } }] },
  { role: "tool", results: [{ id: "t1", content: "contenu" }] },
];

function capture(status: number, response: unknown) {
  const calls: { url: string; init: RequestInit; body: Record<string, unknown> }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init!, body: JSON.parse(String(init!.body)) });
    return Response.json(response, { status });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("AnthropicClient", () => {
  it("convertit l'historique et lit les appels d'outils", async () => {
    const { calls, fetchImpl } = capture(200, {
      content: [
        { type: "text", text: "Je modifie." },
        { type: "tool_use", id: "t2", name: "read_file", input: { path: "b.ts" } },
      ],
      stop_reason: "tool_use",
    });
    const res = await new AnthropicClient("sk-ant-x", "claude-sonnet-5-5", fetchImpl).complete("sys", HISTORY, TOOLS);
    expect(res).toEqual({ text: "Je modifie.", toolCalls: [{ id: "t2", name: "read_file", input: { path: "b.ts" } }], stop: "tool_use" });

    const { url, init, body } = calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(new Headers(init.headers).get("x-api-key")).toBe("sk-ant-x");
    expect(body.system).toBe("sys");
    expect(body.tools).toEqual([{ name: "read_file", description: "lit", input_schema: { type: "object" } }]);
    expect(body.messages).toEqual([
      { role: "user", content: [{ type: "text", text: "Ajoute un pied de page" }] },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Je regarde." },
          { type: "tool_use", id: "t1", name: "read_file", input: { path: "a.ts" } },
        ],
      },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "contenu" }] },
    ]);
  });

  it("explique une clé refusée sans la citer", async () => {
    const { fetchImpl } = capture(401, { error: { message: "invalid x-api-key sk-ant-x" } });
    const err = await new AnthropicClient("sk-ant-x", "m", fetchImpl).complete("s", HISTORY, TOOLS).catch((e) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err.message).toBe("Claude (Anthropic) a refusé la clé");
  });
});

describe("OpenAiCompatibleClient", () => {
  it("convertit l'historique au format Chat Completions et lit les tool_calls", async () => {
    const { calls, fetchImpl } = capture(200, {
      choices: [
        {
          finish_reason: "tool_calls",
          message: { content: null, tool_calls: [{ id: "c1", function: { name: "read_file", arguments: '{"path":"x.ts"}' } }] },
        },
      ],
    });
    const client = new OpenAiCompatibleClient("OpenRouter", "https://openrouter.ai/api/v1", "sk-or", "m", fetchImpl);
    const res = await client.complete("sys", HISTORY, TOOLS);
    expect(res).toEqual({ text: "", toolCalls: [{ id: "c1", name: "read_file", input: { path: "x.ts" } }], stop: "tool_use" });

    const { url, init, body } = calls[0]!;
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer sk-or");
    expect(body.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "Ajoute un pied de page" },
      {
        role: "assistant",
        content: "Je regarde.",
        tool_calls: [{ id: "t1", type: "function", function: { name: "read_file", arguments: '{"path":"a.ts"}' } }],
      },
      { role: "tool", tool_call_id: "t1", content: "contenu" },
    ]);
  });

  it("signale un quota atteint et survit à des arguments JSON invalides", async () => {
    const quota = capture(429, { error: { message: "quota" } });
    const err = await new OpenAiCompatibleClient("ChatGPT (OpenAI)", "u", "k", "m", quota.fetchImpl).complete("s", [], TOOLS).catch((e) => e);
    expect(err.message).toBe("ChatGPT (OpenAI) : limite d'utilisation atteinte (quota ou crédit)");

    const broken = capture(200, {
      choices: [{ finish_reason: "tool_calls", message: { content: "", tool_calls: [{ id: "c", function: { name: "read_file", arguments: "{oups" } }] } }],
    });
    const res = await new OpenAiCompatibleClient("X", "u", "k", "m", broken.fetchImpl).complete("s", [], TOOLS);
    expect(res.toolCalls[0]!.input).toEqual({ __invalid_json: "{oups" });
  });
});
