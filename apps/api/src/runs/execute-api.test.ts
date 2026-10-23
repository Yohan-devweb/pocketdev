import { beforeEach, describe, expect, it } from "vitest";
import { SecretBox } from "../crypto";
import { type FileChanges, GitHubApi } from "../github/api";
import type { LlmClient, LlmResponse } from "../llm/types";
import { LlmError } from "../llm/types";
import { MemoryStore } from "../test/memory-store";
import { workBranchFor } from "./execute";
import { executeApiRun } from "./execute-api";

const API_KEY = "sk-ant-api03-secret-de-test-xyz";
const GH_TOKEN = "ghs_jeton_installation_secret";

class FakeGitHub extends GitHubApi {
  reads: string[] = [];
  commits: { branch: string; baseCommit: string; message: string; changes: FileChanges }[] = [];
  constructor() {
    super({ appId: "1", slug: "s", clientId: "c", clientSecret: "x", privateKey: "" });
  }
  override async installationToken() {
    return GH_TOKEN;
  }
  override async snapshot() {
    return { commit: "base123", files: ["README.md"], truncated: false };
  }
  override async readFile(_t: string, _r: string, ref: string, path: string) {
    this.reads.push(`${ref}:${path}`);
    return path === "README.md" ? "# Site\n" : null;
  }
  override async commitToNewBranch(_t: string, _r: string, input: (typeof this.commits)[number]) {
    this.commits.push(input);
    return "commit456";
  }
  override async compare() {
    return "diff --git a/README.md b/README.md\n+Pourquoi";
  }
}

/** IA scriptée qui lit le README, l'enrichit puis termine. */
function editingLlm(echoKey = false): LlmClient {
  const turns: LlmResponse[] = [
    { text: "", toolCalls: [{ id: "1", name: "read_file", input: { path: "README.md" } }], stop: "tool_use" },
    { text: "", toolCalls: [{ id: "2", name: "read_file", input: { path: "README.md" } }], stop: "tool_use" },
    {
      text: echoKey ? `j'ai vu ${API_KEY}` : "",
      toolCalls: [{ id: "3", name: "write_file", input: { path: "README.md", content: "# Site\nPourquoi\n" } }],
      stop: "tool_use",
    },
    { text: "", toolCalls: [{ id: "4", name: "finish", input: { summary: "Section ajoutée." } }], stop: "tool_use" },
  ];
  return { complete: async () => turns.shift()! };
}

let store: MemoryStore;
let github: FakeGitHub;
let secrets: SecretBox;
let runId: string;
let llmArgs: unknown[];

beforeEach(async () => {
  store = new MemoryStore();
  github = new FakeGitHub();
  secrets = await SecretBox.fromBase64Key(btoa(String.fromCharCode(...new Uint8Array(32).fill(5))));
  const project = await store.insertProject({ ownerId: "u1", name: "site", type: "web", repository: "yohan/site", defaultBranch: "main", installationId: 42 });
  await store.putAiKey("u1", "anthropic", await secrets.seal(API_KEY), "-xyz");
  const run = await store.createRun({ projectId: project.id, ownerId: "u1", goal: "Ajoute une section Pourquoi", provider: "anthropic", model: "claude-sonnet-5-5", baseBranch: "main" });
  runId = run.id;
  llmArgs = [];
});

const execute = (llm: LlmClient) =>
  executeApiRun(runId, {
    store,
    github,
    secrets,
    llm: (...args) => {
      llmArgs = args;
      return llm;
    },
  });

describe("executeApiRun", () => {
  it("fait travailler l'IA de l'utilisateur et commit sur une nouvelle branche", async () => {
    await execute(editingLlm());
    const run = (await store.getRun(runId))!;
    expect(run).toMatchObject({
      status: "succeeded",
      branch: workBranchFor(runId),
      files: ["README.md"],
      summary: "Section ajoutée.",
      diff: "diff --git a/README.md b/README.md\n+Pourquoi",
      error: null,
    });
    expect(llmArgs).toEqual(["anthropic", API_KEY, "claude-sonnet-5-5"]);
    expect(github.commits).toHaveLength(1);
    expect(github.commits[0]).toMatchObject({ branch: workBranchFor(runId), baseCommit: "base123" });
    expect(github.commits[0]!.message).toBe("PocketDev : Ajoute une section Pourquoi\n\nSection ajoutée.");
    // Le README n'est téléchargé qu'une fois malgré deux lectures et la comparaison finale.
    expect(github.reads).toEqual(["base123:README.md"]);
  });

  it("masque la clé IA si elle apparaît dans le journal", async () => {
    await execute(editingLlm(true));
    const run = (await store.getRun(runId))!;
    expect(run.log).toContain("j'ai vu ***");
    expect(run.log).not.toContain(API_KEY);
  });

  it("ne crée aucune branche quand rien ne change", async () => {
    await execute({ complete: async () => ({ text: "Rien à faire.", toolCalls: [], stop: "end" }) });
    expect(await store.getRun(runId)).toMatchObject({ status: "succeeded", branch: null, files: [], summary: "Rien à faire." });
    expect(github.commits).toEqual([]);
  });

  it("présente un refus du fournisseur comme un échec", async () => {
    await execute({
      complete: async () => {
        throw new LlmError(401, "Claude (Anthropic) a refusé la clé");
      },
    });
    expect(await store.getRun(runId)).toMatchObject({ status: "failed", error: "Claude (Anthropic) a refusé la clé" });
    expect(github.commits).toEqual([]);
  });

  it("ne relance pas une demande déjà démarrée", async () => {
    await store.updateRun(runId, { status: "running" });
    await execute(editingLlm());
    expect(llmArgs).toEqual([]);
  });
});
