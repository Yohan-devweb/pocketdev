import { describe, expect, it } from "vitest";
import { isTerminal } from "./events";

describe("isTerminal", () => {
  it("considère qu'une tâche échouée est terminée, jamais réussie", () => {
    expect(isTerminal("failed")).toBe(true);
    expect(isTerminal("running")).toBe(false);
    expect(isTerminal("awaiting_approval")).toBe(false);
  });
});
