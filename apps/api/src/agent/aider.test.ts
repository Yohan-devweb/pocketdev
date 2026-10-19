import { describe, expect, it } from "vitest";
import { agentCommand, redact } from "./aider";

describe("agentCommand", () => {
  it("donne la clé du bon fournisseur par l'environnement uniquement", () => {
    for (const [provider, env] of [
      ["anthropic", "ANTHROPIC_API_KEY"],
      ["openai", "OPENAI_API_KEY"],
      ["openrouter", "OPENROUTER_API_KEY"],
    ] as const) {
      const { cmd, env: vars } = agentCommand({ goal: "x", provider, model: "m", apiKey: "secret-key-123" });
      expect(vars).toEqual({ [env]: "secret-key-123" });
      expect(cmd.join(" ")).not.toContain("secret-key-123");
      expect(cmd).toContain(`${provider}/m`);
    }
  });

  it("passe la demande comme un seul argument, sans shell", () => {
    const goal = "Ajoute $(rm -rf /) ; echo";
    const { cmd } = agentCommand({ goal, provider: "openai", model: "m", apiKey: "k" });
    expect(cmd[cmd.indexOf("--message") + 1]).toBe(goal);
  });
});

describe("redact", () => {
  it("masque chaque secret mais ignore les valeurs trop courtes pour être sûres", () => {
    expect(redact("a SECRET123 b SECRET123", ["SECRET123", "abc"])).toBe("a *** b ***");
  });
});
