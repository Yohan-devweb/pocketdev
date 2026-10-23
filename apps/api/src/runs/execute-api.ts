import { AI_PROVIDER_LABELS } from "@pocketdev/shared";
import { redact } from "../agent/aider";
import { AgentError, runApiAgent } from "../agent/api-agent";
import type { SecretBox } from "../crypto";
import { GitHubError, type GitHubApi } from "../github/api";
import type { LlmFactory } from "../llm";
import { LlmError } from "../llm/types";
import type { Store } from "../store";
import { DIFF_LIMIT, LOG_LIMIT, RunError, tail, workBranchFor } from "./execute";

export interface ApiExecuteDeps {
  store: Store;
  github: GitHubApi;
  secrets: SecretBox;
  llm: LlmFactory;
  now?(): Date;
}

/**
 * Exécute une demande sans runner : l'agent lit le dépôt par l'API GitHub, l'IA de l'utilisateur
 * propose les changements, puis un seul commit part sur une nouvelle branche pocketdev/….
 * Sans effet si la demande n'est plus en attente.
 */
export async function executeApiRun(runId: string, deps: ApiExecuteDeps): Promise<void> {
  const { store, github, secrets } = deps;
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

    const snapshot = await github.snapshot(token, project.repository, run.baseBranch);
    await write(`Lecture de ${project.repository} (${run.baseBranch}) : ${snapshot.files.length} fichiers.`);
    if (snapshot.truncated) await write("Dépôt très gros : l'agent ne voit qu'une partie des fichiers.");

    // Chaque fichier n'est téléchargé qu'une fois, au commit de base.
    const cache = new Map<string, Promise<string | null>>();
    const repo = {
      files: snapshot.files,
      read: (path: string) => {
        let content = cache.get(path);
        if (!content) {
          content = github.readFile(token, project.repository, snapshot.commit, path);
          cache.set(path, content);
        }
        return content;
      },
    };

    await write(`L'agent travaille avec ${run.model}…`);
    const result = await runApiAgent({
      goal: run.goal,
      llm: deps.llm(run.provider, apiKey, run.model),
      repo,
      log: write,
    });
    await store.updateRun(run.id, { summary: redact(result.summary, hidden) });

    if (result.changes.size === 0) {
      await write("L'agent n'a modifié aucun fichier.");
      await store.updateRun(run.id, { status: "succeeded", files: [], finishedAt: now().toISOString() });
      return;
    }

    const workBranch = workBranchFor(run.id);
    await write(`Envoi de la branche ${workBranch} sur GitHub…`);
    const title = run.goal.split("\n")[0]!.slice(0, 72);
    await github.commitToNewBranch(token, project.repository, {
      baseCommit: snapshot.commit,
      branch: workBranch,
      message: `PocketDev : ${title}\n\n${result.summary}`,
      changes: result.changes,
    });
    const diff = await github.compare(token, project.repository, snapshot.commit, workBranch);
    await write("Terminé.");
    await store.updateRun(run.id, {
      status: "succeeded",
      branch: workBranch,
      files: [...result.changes.keys()].sort((a, b) => a.localeCompare(b)),
      diff: diff.length > DIFF_LIMIT ? `${diff.slice(0, DIFF_LIMIT)}\n… diff tronqué, version complète sur GitHub` : diff,
      finishedAt: now().toISOString(),
    });
  } catch (err) {
    const known = err instanceof RunError || err instanceof GitHubError || err instanceof LlmError || err instanceof AgentError;
    const message = known ? err.message : `Erreur inattendue : ${err instanceof Error ? err.message : String(err)}`;
    await store.updateRun(run.id, { status: "failed", error: redact(message, hidden), finishedAt: now().toISOString() });
  }
}
