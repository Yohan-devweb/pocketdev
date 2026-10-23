import { describe, expect, it } from "vitest";
import type { ChatMessage, LlmClient, LlmResponse, ToolCall } from "../llm/types";
import { AgentError, runApiAgent, safePath } from "./api-agent";

/** IA scriptée : une réponse par tour ; garde les messages reçus pour vérification. */
function scripted(turns: (LlmResponse | ((messages: ChatMessage[]) => LlmResponse))[]) {
  const seen: ChatMessage[][] = [];
  const llm: LlmClient = {
    async complete(_system, messages) {
      seen.push(structuredClone(messages));
      const turn = turns.shift();
      if (!turn) throw new Error("plus de réponses prévues");
      return typeof turn === "function" ? turn(messages) : turn;
    },
  };
  return { llm, seen };
}

const call = (name: string, input: Record<string, unknown>, id = name): ToolCall => ({ id, name, input });
const tools = (...calls: ToolCall[]): LlmResponse => ({ text: "", toolCalls: calls, stop: "tool_use" });

const FILES: Record<string, string> = { "README.md": "# Site\n", "src/App.tsx": "export const App = () => null;\n" };
const repo = { files: Object.keys(FILES), read: async (p: string) => FILES[p] ?? null };

describe("runApiAgent", () => {
  it("lit, modifie, crée et supprime des fichiers puis rend un résumé", async () => {
    const lines: string[] = [];
    const { llm, seen } = scripted([
      tools(call("list_files", {}), call("read_file", { path: "src/App.tsx" })),
      tools(
        call("write_file", { path: "src/App.tsx", content: "export const App = () => <footer />;\n" }),
        call("write_file", { path: "src/Footer.tsx", content: "export {};\n" }),
        call("delete_file", { path: "README.md" }),
      ),
      tools(call("finish", { summary: "Pied de page ajouté." })),
    ]);
    const result = await runApiAgent({ goal: "Ajoute un pied de page", llm, repo, log: async (l) => void lines.push(l) });

    expect(result.summary).toBe("Pied de page ajouté.");
    expect([...result.changes]).toEqual([
      ["src/App.tsx", "export const App = () => <footer />;\n"],
      ["src/Footer.tsx", "export {};\n"],
      ["README.md", null],
    ]);
    const firstResults = seen[1]!.at(-1) as Extract<ChatMessage, { role: "tool" }>;
    expect(firstResults.results[0]!.content).toBe("README.md\nsrc/App.tsx");
    expect(firstResults.results[1]!.content).toBe(FILES["src/App.tsx"]);
    expect(lines).toContain("✏️ Création de src/Footer.tsx");
  });

  it("refuse les chemins dangereux sans rien écrire", async () => {
    const { llm, seen } = scripted([
      tools(call("write_file", { path: "../secret", content: "x" }), call("write_file", { path: ".git/config", content: "x" })),
      tools(call("finish", { summary: "Rien." })),
    ]);
    const result = await runApiAgent({ goal: "x", llm, repo, log: async () => {} });
    expect(result.changes.size).toBe(0);
    const res = seen[1]!.at(-1) as Extract<ChatMessage, { role: "tool" }>;
    expect(res.results.map((r) => r.content)).toEqual(["Erreur : chemin invalide.", "Erreur : chemin invalide."]);
  });

  it("ignore une réécriture identique et accepte une fin sans outil", async () => {
    const { llm } = scripted([
      tools(call("write_file", { path: "README.md", content: FILES["README.md"] })),
      { text: "C'était déjà bon.", toolCalls: [], stop: "end" },
    ]);
    const result = await runApiAgent({ goal: "x", llm, repo, log: async () => {} });
    expect(result.changes.size).toBe(0);
    expect(result.summary).toBe("C'était déjà bon.");
  });

  it("échoue clairement s'il ne termine pas", async () => {
    const { llm } = scripted(Array.from({ length: 3 }, () => tools(call("list_files", {}))));
    await expect(runApiAgent({ goal: "x", llm, repo, log: async () => {}, maxSteps: 3 })).rejects.toThrow(AgentError);
  });
});

describe("safePath", () => {
  it("n'accepte que des chemins relatifs dans le dépôt", () => {
    expect(safePath("./src/a.ts")).toBe("src/a.ts");
    for (const bad of ["/etc/passwd", "a/../../b", ".git/HEAD", "a\\b", "", "a//b", 3]) expect(safePath(bad)).toBeNull();
  });
});
