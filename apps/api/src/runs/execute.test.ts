import { beforeEach, describe, expect, it } from "vitest";
import { SecretBox } from "../crypto";
import { GitHubApi } from "../github/api";
import type { ExecOptions, ExecResult, Runner } from "../runner/types";
import { MemoryStore } from "../test/memory-store";
import { executeRun, workBranchFor } from "./execute";

const API_KEY = "sk-ant-api03-secret-de-test-xyz";
const GH_TOKEN = "ghs_jeton_installation_secret";

class FakeGitHub extends GitHubApi {
  access: string[] = [];
  constructor() {
    super({ appId: "1", slug: "s", clientId: "c", clientSecret: "x", privateKey: "" });
  }
  override async installationToken(_id: number, _repo: string, access: "read" | "write" = "read") {
    this.access.push(access);
    return GH_TOKEN;
  }
}

type Call = { cmd: string[]; options?: ExecOptions };

/** Faux runner : répond selon la commande, comme le ferait le conteneur. */
function fakeRunner(respond: (cmd: string[]) => Partial<ExecResult> | Error = () => ({})) {
  const calls: Call[] = [];
  let destroyed = false;
  const runner: Runner = {
    id: "r",
    async exec(cmd, options) {
      calls.push({ cmd, options });
      const answer = respond(cmd);
      if (answer instanceof Error) throw answer;
      return { exitCode: 0, stdout: "", stderr: "", ...answer };
    },
    fetchPort: async () => new Response(null),
    destroy: async () => {
      destroyed = true;
    },
  };
  return { runner, calls, isDestroyed: () => destroyed };
}

/** Réponses d'un dépôt où l'agent modifie un fichier. */
function happyPath(cmd: string[], agentOutput = "Applied edit to src/App.tsx"): Partial<ExecResult> {
  if (cmd[0] === "aider") return { stdout: `${agentOutput}\nclé vue : ${API_KEY}` };
  if (cmd[1] === "rev-parse") return { stdout: "base123\n" };
  if (cmd.includes("--name-only")) return { stdout: "src/App.tsx\n" };
  if (cmd[1] === "diff") return { stdout: "+<footer />" };
  return {};
}

let store: MemoryStore;
let github: FakeGitHub;
let secrets: SecretBox;
let runId: string;

beforeEach(async () => {
  store = new MemoryStore();
  github = new FakeGitHub();
  secrets = await SecretBox.fromBase64Key(btoa(String.fromCharCode(...new Uint8Array(32).fill(3))));
  const project = await store.insertProject({
    ownerId: "u1",
    name: "site",
    type: "web",
    repository: "yohan/site",
    defaultBranch: "main",
    installationId: 42,
  });
  await store.putAiKey("u1", "anthropic", await secrets.seal(API_KEY), "-xyz");
  const run = await store.createRun({
    projectId: project.id,
    ownerId: "u1",
    goal: "Ajoute un pied de page\navec le copyright",
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    baseBranch: "main",
  });
  runId = run.id;
});

const execute = (runner: Runner) => executeRun(runId, { store, github, secrets, runner });

describe("executeRun", () => {
  it("clone, lance l'agent, pousse une branche dédiée et enregistre le diff", async () => {
    const { runner, calls, isDestroyed } = fakeRunner((cmd) => happyPath(cmd));
    await execute(runner);

    const run = (await store.getRun(runId))!;
    expect(run).toMatchObject({
      status: "succeeded",
      branch: workBranchFor(runId),
      files: ["src/App.tsx"],
      diff: "+<footer />",
      error: null,
    });
    expect(run.finishedAt).not.toBeNull();
    expect(github.access).toEqual(["write"]);
    expect(isDestroyed()).toBe(true);

    const agent = calls.find((c) => c.cmd[0] === "aider")!;
    expect(agent.cmd).toContain("anthropic/claude-sonnet-5-5");
    expect(agent.cmd).toContain("--no-auto-commits");
    expect(agent.options?.env).toEqual({ ANTHROPIC_API_KEY: API_KEY });

    const commit = calls.find((c) => c.cmd.includes("commit"))!;
    expect(commit.cmd.at(-1)).toBe("PocketDev : Ajoute un pied de page");
    const push = calls.find((c) => c.cmd[1] === "push")!;
    expect(push.cmd).toEqual(["git", "push", "origin", `HEAD:refs/heads/${workBranchFor(runId)}`]);
  });

  it("ne laisse fuir ni la clé IA ni le jeton GitHub (arguments, journal)", async () => {
    const { runner, calls } = fakeRunner((cmd) => happyPath(cmd));
    await execute(runner);
    for (const call of calls) {
      expect(call.cmd.join(" ")).not.toContain(API_KEY);
      expect(call.cmd.join(" ")).not.toContain(GH_TOKEN);
    }
    const run = (await store.getRun(runId))!;
    expect(run.log).not.toContain(API_KEY);
    expect(run.log).toContain("clé vue : ***");
  });

  it("ne pousse rien et le dit quand l'agent ne modifie aucun fichier", async () => {
    const { runner, calls } = fakeRunner((cmd) => (cmd.includes("--name-only") ? { stdout: "" } : happyPath(cmd)));
    await execute(runner);
    const run = (await store.getRun(runId))!;
    expect(run).toMatchObject({ status: "succeeded", branch: null, files: [] });
    expect(run.log).toContain("L'agent n'a modifié aucun fichier.");
    expect(calls.some((c) => c.cmd[1] === "push")).toBe(false);
  });

  it("présente un refus du fournisseur IA comme un échec, pas comme un succès", async () => {
    const { runner } = fakeRunner((cmd) =>
      cmd.includes("--name-only") ? { stdout: "" } : happyPath(cmd, "litellm.AuthenticationError: invalid x-api-key"),
    );
    await execute(runner);
    expect(await store.getRun(runId)).toMatchObject({
      status: "failed",
      error: "Claude (Anthropic) a refusé la demande, voir le journal",
    });
  });

  it("enregistre l'étape en échec avec la sortie d'erreur, sans secret", async () => {
    const { runner, isDestroyed } = fakeRunner((cmd) =>
      cmd[1] === "clone" ? { exitCode: 128, stderr: `fatal: accès refusé ${GH_TOKEN}` } : happyPath(cmd),
    );
    await execute(runner);
    const run = (await store.getRun(runId))!;
    expect(run.status).toBe("failed");
    expect(run.error).toBe("Échec de l'étape « clone » (code 128)");
    expect(run.log).toContain("fatal: accès refusé ***");
    expect(isDestroyed()).toBe(true);
  });

  it("explique l'absence de runner au lieu d'une erreur muette", async () => {
    const { runner } = fakeRunner(() => new Error("aucun conteneur disponible sur ce serveur"));
    await execute(runner);
    expect(await store.getRun(runId)).toMatchObject({
      status: "failed",
      error: "Le runner a échoué : aucun conteneur disponible sur ce serveur",
    });
  });

  it("échoue clairement si la clé IA a été retirée entre-temps", async () => {
    await store.deleteAiKey("u1", "anthropic");
    const { runner, calls } = fakeRunner();
    await execute(runner);
    expect(await store.getRun(runId)).toMatchObject({ status: "failed", error: "Ta clé Claude (Anthropic) n'est plus connectée" });
    expect(calls).toEqual([]);
  });

  it("ne relance pas une demande déjà démarrée", async () => {
    await store.updateRun(runId, { status: "running" });
    const { runner, calls } = fakeRunner();
    await execute(runner);
    expect(calls).toEqual([]);
  });
});
