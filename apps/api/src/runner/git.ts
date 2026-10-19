import type { Runner } from "./types";

export const REPO_DIR = "/workspace/repo";

export class RunnerCommandError extends Error {
  constructor(
    readonly step: string,
    readonly exitCode: number,
    readonly stderr: string,
  ) {
    super(`Échec de l'étape « ${step} » (code ${exitCode})`);
  }
}

/**
 * Le jeton GitHub passe par les variables GIT_CONFIG_* de la commande : il n'apparaît
 * ni dans les arguments, ni dans .git/config, ni dans les logs.
 */
export function gitAuthEnv(token: string): Record<string, string> {
  const basic = btoa(`x-access-token:${token}`);
  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
    GIT_TERMINAL_PROMPT: "0",
  };
}

async function run(runner: Runner, step: string, cmd: string[], env?: Record<string, string>) {
  const result = await runner.exec(cmd, { cwd: REPO_DIR, env });
  if (result.exitCode !== 0) throw new RunnerCommandError(step, result.exitCode, result.stderr);
  return result;
}

export interface PrepareWorkspaceInput {
  /** "owner/repo" */
  repository: string;
  baseBranch: string;
  workBranch: string;
  token: string;
}

/** Clone le dépôt et crée la branche de travail isolée de la tâche. */
export async function prepareWorkspace(runner: Runner, input: PrepareWorkspaceInput): Promise<string> {
  const env = gitAuthEnv(input.token);
  const clone = await runner.exec(
    [
      "git",
      "clone",
      "--depth=50",
      "--branch",
      input.baseBranch,
      `https://github.com/${input.repository}.git`,
      REPO_DIR,
    ],
    { cwd: "/workspace", env },
  );
  if (clone.exitCode !== 0) throw new RunnerCommandError("clone", clone.exitCode, clone.stderr);

  await run(runner, "branch", ["git", "checkout", "-b", input.workBranch]);
  const head = await run(runner, "base-commit", ["git", "rev-parse", "HEAD"]);
  return head.stdout.trim();
}

/** Diff complet de la branche de travail par rapport au commit de base, fichiers non suivis compris. */
export async function collectDiff(runner: Runner, baseCommit: string) {
  await run(runner, "stage", ["git", "add", "--all"]);
  const files = await run(runner, "diff-files", ["git", "diff", "--cached", "--name-only", baseCommit]);
  const diff = await run(runner, "diff", ["git", "diff", "--cached", baseCommit]);
  return {
    files: files.stdout.split("\n").filter(Boolean),
    diff: diff.stdout,
  };
}

export interface PushInput {
  workBranch: string;
  message: string;
  token: string;
}

/** Commit les changements déjà indexés par collectDiff et pousse la branche de travail (jamais la branche de base). */
export async function pushWorkBranch(runner: Runner, input: PushInput): Promise<void> {
  await run(runner, "commit", [
    "git",
    "-c",
    "user.name=PocketDev",
    "-c",
    "user.email=pocketdev@users.noreply.github.com",
    "commit",
    "--no-verify",
    "-m",
    input.message,
  ]);
  await run(runner, "push", ["git", "push", "origin", `HEAD:refs/heads/${input.workBranch}`], gitAuthEnv(input.token));
}
