import { describe, expect, it } from "vitest";
import { collectDiff, gitAuthEnv, prepareWorkspace, RunnerCommandError } from "./git";
import type { ExecOptions, ExecResult, Runner } from "./types";

type Call = { cmd: string[]; options?: ExecOptions };

function fakeRunner(respond: (cmd: string[]) => Partial<ExecResult> = () => ({})) {
  const calls: Call[] = [];
  const runner: Runner = {
    id: "run-test",
    async exec(cmd, options) {
      calls.push({ cmd, options });
      return { exitCode: 0, stdout: "", stderr: "", ...respond(cmd) };
    },
    fetchPort: async () => new Response(null),
    destroy: async () => {},
  };
  return { runner, calls };
}

describe("prepareWorkspace", () => {
  it("clone, crée la branche de travail et renvoie le commit de base", async () => {
    const { runner, calls } = fakeRunner((cmd) => (cmd[1] === "rev-parse" ? { stdout: "abc123\n" } : {}));
    const base = await prepareWorkspace(runner, {
      repository: "owner/repo",
      baseBranch: "main",
      workBranch: "pocketdev/run-1",
      token: "secret-token",
    });

    expect(base).toBe("abc123");
    expect(calls.map((c) => c.cmd.slice(0, 3).join(" "))).toEqual([
      "git clone --depth=50",
      "git checkout -b",
      "git rev-parse HEAD",
    ]);
  });

  it("ne met jamais le jeton GitHub dans les arguments de commande", async () => {
    const { runner, calls } = fakeRunner();
    await prepareWorkspace(runner, {
      repository: "owner/repo",
      baseBranch: "main",
      workBranch: "w",
      token: "secret-token",
    });
    for (const call of calls) expect(call.cmd.join(" ")).not.toContain("secret-token");
  });

  it("signale un échec de clone au lieu de continuer", async () => {
    const { runner } = fakeRunner((cmd) => (cmd[1] === "clone" ? { exitCode: 128, stderr: "not found" } : {}));
    await expect(
      prepareWorkspace(runner, { repository: "o/r", baseBranch: "main", workBranch: "w", token: "t" }),
    ).rejects.toBeInstanceOf(RunnerCommandError);
  });
});

describe("gitAuthEnv", () => {
  it("encode le jeton dans un en-tête limité à github.com", () => {
    const env = gitAuthEnv("tok");
    expect(env.GIT_CONFIG_KEY_0).toBe("http.https://github.com/.extraheader");
    expect(env.GIT_CONFIG_VALUE_0).toBe(`AUTHORIZATION: basic ${btoa("x-access-token:tok")}`);
  });
});

describe("collectDiff", () => {
  it("liste les fichiers modifiés par rapport au commit de base", async () => {
    const { runner } = fakeRunner((cmd) =>
      cmd.includes("--name-only") ? { stdout: "src/a.ts\nREADME.md\n" } : { stdout: "diff --git ..." },
    );
    const result = await collectDiff(runner, "abc123");
    expect(result.files).toEqual(["src/a.ts", "README.md"]);
    expect(result.diff).toBe("diff --git ...");
  });
});
