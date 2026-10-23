import { AI_PROVIDER_LABELS } from "@pocketdev/shared";
import { AGENT_IGNORED, agentCommand, redact } from "../agent/aider";
import type { SecretBox } from "../crypto";
import { GitHubError, type GitHubApi } from "../github/api";
import { collectDiff, prepareWorkspace, pushWorkBranch, REPO_DIR, RunnerCommandError } from "../runner/git";
import type { Runner } from "../runner/types";
import type { Store } from "../store";

const AGENT_TIMEOUT_MS = 10 * 60 * 1000;
export const LOG_LIMIT = 20_000;
/** Une ligne D1 est limitée à 2 Mo : au-delà, le diff complet reste consultable sur GitHub. */
export const DIFF_LIMIT = 500_000;
/** Erreurs d'appel au modèle affichées par Aider (via LiteLLM) alors qu'il se termine sans code d'erreur. */
const PROVIDER_ERROR = /AuthenticationError|PermissionDeniedError|RateLimitError|NotFoundError|BadRequestError|APIConnectionError|InternalServerError|ServiceUnavailableError/;

export interface ExecuteDeps {
  store: Store;
  github: GitHubApi;
  secrets: SecretBox;
  runner: Runner;
  now?(): Date;
}

/** Erreur expliquée à l'utilisateur telle quelle. */
export class RunError extends Error {}

export const tail = (text: string, limit: number) => (text.length > limit ? `…${text.slice(-limit)}` : text);

/** Nom de la branche poussée sur GitHub pour une demande. */
export const workBranchFor = (runId: string) => `pocketdev/${runId.slice(0, 8)}`;

/**
 * Exécute une demande de bout en bout dans son runner : clone, agent, diff, push de la branche.
 * Ne dépend que de l'interface Runner. Sans effet si la demande n'est plus en attente.
 */
export async function executeRun(runId: string, deps: ExecuteDeps): Promise<void> {
  const { store, github, secrets, runner } = deps;
  const now = deps.now ?? (() => new Date());
  const run = await store.getRun(runId);
  if (!run || run.status !== "queued") return;

  const hidden: string[] = [];
  let log = "";
  /** Ajoute au journal, enregistré aussitôt pour que l'app suive l'avancement. */
  const write = async (text: string) => {
    log = tail(log + redact(text, hidden).trimEnd() + "\n", LOG_LIMIT);
    await store.updateRun(run.id, { log });
  };

  await store.updateRun(run.id, { status: "running" });
  try {
    const project = await store.getProject(run.projectId, run.ownerId);
    if (!project) throw new RunError("Le projet n'existe plus");
    const keyEnc = await store.getAiKeyEnc(run.ownerId, run.provider);
    if (!keyEnc) throw new RunError(`Ta clé ${AI_PROVIDER_LABELS[run.provider]} n'est plus connectée`);
    const apiKey = await secrets.open(keyEnc);
    hidden.push(apiKey);
    const token = await github.installationToken(project.installationId, project.repository, "write");
    hidden.push(token);

    await write(`Clonage de ${project.repository} (${run.baseBranch})…`);
    const workBranch = workBranchFor(run.id);
    const baseCommit = await prepareWorkspace(runner, {
      repository: project.repository,
      baseBranch: run.baseBranch,
      workBranch,
      token,
    });
    await runner.exec(["sh", "-c", `echo '${AGENT_IGNORED}' >> .git/info/exclude`], { cwd: REPO_DIR });

    await write(`L'agent travaille avec ${run.model}…`);
    const agent = agentCommand({ goal: run.goal, provider: run.provider, model: run.model, apiKey });
    const result = await runner.exec(agent.cmd, { cwd: REPO_DIR, env: agent.env, timeoutMs: AGENT_TIMEOUT_MS });
    await write(result.stdout);
    if (result.stderr.trim()) await write(result.stderr);
    if (result.exitCode !== 0) throw new RunError(`L'agent s'est arrêté sur une erreur (code ${result.exitCode}), voir le journal`);

    const { files, diff } = await collectDiff(runner, baseCommit);
    if (files.length === 0) {
      if (PROVIDER_ERROR.test(result.stdout + result.stderr)) {
        throw new RunError(`${AI_PROVIDER_LABELS[run.provider]} a refusé la demande, voir le journal`);
      }
      await write("L'agent n'a modifié aucun fichier.");
      await store.updateRun(run.id, { status: "succeeded", files: [], finishedAt: now().toISOString() });
      return;
    }

    await write(`Envoi de la branche ${workBranch} sur GitHub…`);
    const title = run.goal.split("\n")[0]!.slice(0, 72);
    await pushWorkBranch(runner, { workBranch, message: `PocketDev : ${title}`, token });
    await write("Terminé.");
    await store.updateRun(run.id, {
      status: "succeeded",
      branch: workBranch,
      files,
      diff: diff.length > DIFF_LIMIT ? `${diff.slice(0, DIFF_LIMIT)}\n… diff tronqué, version complète sur GitHub` : diff,
      finishedAt: now().toISOString(),
    });
  } catch (err) {
    let message: string;
    if (err instanceof RunError || err instanceof GitHubError) message = err.message;
    else if (err instanceof RunnerCommandError) {
      message = err.message;
      await write(err.stderr);
    } else message = `Le runner a échoué : ${err instanceof Error ? err.message : String(err)}`;
    await store.updateRun(run.id, { status: "failed", error: redact(message, hidden), finishedAt: now().toISOString() });
  } finally {
    await runner.destroy().catch(() => {});
  }
}
