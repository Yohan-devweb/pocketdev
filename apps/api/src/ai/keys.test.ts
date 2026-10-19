import { describe, expect, it } from "vitest";
import { AiKeyVerifier, keyHint, normalizeKey } from "./keys";

function recordingFetch(status: number, calls: { url: string; headers: Headers }[] = []) {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) });
    return new Response("{}", { status });
  }) as typeof fetch;
}

describe("AiKeyVerifier", () => {
  it("interroge chaque fournisseur avec son propre en-tête d'authentification", async () => {
    const calls: { url: string; headers: Headers }[] = [];
    const verifier = new AiKeyVerifier(recordingFetch(200, calls));
    expect(await verifier.verify("anthropic", "k1")).toBe("valid");
    expect(await verifier.verify("openai", "k2")).toBe("valid");
    expect(await verifier.verify("openrouter", "k3")).toBe("valid");
    expect(calls[0]!.url).toBe("https://api.anthropic.com/v1/models");
    expect(calls[0]!.headers.get("x-api-key")).toBe("k1");
    expect(calls[1]!.headers.get("authorization")).toBe("Bearer k2");
    expect(calls[2]!.url).toBe("https://openrouter.ai/api/v1/key");
  });

  it("distingue une clé refusée d'un fournisseur indisponible", async () => {
    expect(await new AiKeyVerifier(recordingFetch(401)).verify("openai", "k")).toBe("invalid");
    expect(await new AiKeyVerifier(recordingFetch(403)).verify("openai", "k")).toBe("invalid");
    expect(await new AiKeyVerifier(recordingFetch(500)).verify("openai", "k")).toBe("unavailable");
    const offline = (async () => {
      throw new TypeError("réseau");
    }) as unknown as typeof fetch;
    expect(await new AiKeyVerifier(offline).verify("openai", "k")).toBe("unavailable");
  });
});

describe("normalizeKey", () => {
  it("retire les espaces autour et refuse ce qui ne ressemble pas à une clé", () => {
    expect(normalizeKey("  sk-abcdefghijklmnopqrstuv \n")).toBe("sk-abcdefghijklmnopqrstuv");
    expect(normalizeKey("sk abc defghijklmnopqrstuvwxyz")).toBeNull();
    expect(normalizeKey("court")).toBeNull();
    expect(normalizeKey(undefined)).toBeNull();
    expect(keyHint("sk-abcdefghijklmnopqrstuv")).toBe("stuv");
  });
});
