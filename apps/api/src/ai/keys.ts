import type { AiProvider } from "@pocketdev/shared";

export type KeyCheck = "valid" | "invalid" | "unavailable";

/** Requête en lecture seule et gratuite qui échoue en 401/403 si la clé est refusée. */
function checkRequest(provider: AiProvider, key: string): [string, RequestInit] {
  switch (provider) {
    case "anthropic":
      return ["https://api.anthropic.com/v1/models", { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } }];
    case "openai":
      return ["https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` } }];
    case "openrouter":
      return ["https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${key}` } }];
  }
}

/** Vérifie une clé auprès du fournisseur : une clé n'est « connectée » que s'il l'accepte. */
export class AiKeyVerifier {
  private readonly fetchImpl: typeof fetch;

  constructor(fetchImpl: typeof fetch = fetch) {
    // Appelé comme méthode, `fetch` recevrait l'instance comme `this` : Workers refuse (« Illegal invocation »).
    this.fetchImpl = (input, init) => fetchImpl(input, init);
  }

  async verify(provider: AiProvider, key: string): Promise<KeyCheck> {
    const [url, init] = checkRequest(provider, key);
    let res: Response;
    try {
      res = await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(10_000) });
    } catch {
      return "unavailable";
    }
    if (res.ok) return "valid";
    if (res.status === 401 || res.status === 403) return "invalid";
    return "unavailable";
  }
}

/** Contrôle de forme avant tout appel réseau : une clé tient sur une ligne, sans espaces. */
export function normalizeKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim();
  return /^[\x21-\x7e]{20,300}$/.test(key) ? key : null;
}

export const keyHint = (key: string) => key.slice(-4);
