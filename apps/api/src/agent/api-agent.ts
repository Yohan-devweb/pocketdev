import type { FileChanges } from "../github/api";
import type { ChatMessage, LlmClient, ToolCall, ToolSpec } from "../llm/types";

/**
 * Agent de code sans runner : l'IA de l'utilisateur lit et modifie le dépôt au travers de
 * quelques outils. Rien n'est écrit sur GitHub ici ; les changements restent en mémoire
 * jusqu'au commit final, fait par l'appelant sur une nouvelle branche.
 */

export interface RepoReader {
  /** Fichiers de la branche de base. */
  files: string[];
  read(path: string): Promise<string | null>;
}

export interface AgentOptions {
  goal: string;
  llm: LlmClient;
  repo: RepoReader;
  log(line: string): Promise<void>;
  maxSteps?: number;
}

export interface AgentResult {
  changes: FileChanges;
  summary: string;
}

export class AgentError extends Error {}

const MAX_STEPS = 40;
const MAX_LISTED = 400;
const MAX_READ_CHARS = 100_000;
const MAX_WRITE_CHARS = 300_000;

const SYSTEM = `Tu es l'agent de code de PocketDev. Tu travailles sur un dépôt GitHub pour réaliser la demande de l'utilisateur.
Règles :
- Commence par explorer : list_files puis read_file sur les fichiers utiles. Ne devine jamais le contenu d'un fichier.
- Fais des changements ciblés et cohérents avec le style du projet. write_file remplace le fichier entier : écris toujours son contenu complet.
- Tu ne peux exécuter aucune commande ; ne prétends pas avoir lancé de tests.
- Quand tu as fini, appelle finish avec un résumé court, dans la langue de la demande, de ce que tu as changé et pourquoi.
- Si la demande est impossible ou trop floue, appelle finish sans rien modifier et explique pourquoi.`;

const TOOLS: ToolSpec[] = [
  {
    name: "list_files",
    description: "Liste les fichiers du dépôt (état actuel, changements compris), éventuellement sous un dossier.",
    parameters: {
      type: "object",
      properties: { directory: { type: "string", description: "Dossier, par exemple « src/components ». Vide pour tout." } },
    },
  },
  {
    name: "read_file",
    description: "Lit le contenu texte d'un fichier.",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  },
  {
    name: "write_file",
    description: "Crée ou remplace un fichier avec son contenu complet.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    },
  },
  {
    name: "delete_file",
    description: "Supprime un fichier existant.",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  },
  {
    name: "finish",
    description: "Termine le travail avec un résumé pour l'utilisateur.",
    parameters: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] },
  },
];

/** Chemin relatif sûr : ni absolu, ni « .. », ni dossier .git. */
export function safePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const path = raw.trim().replace(/^\.\//, "");
  if (!path || path.length > 300 || path.startsWith("/") || path.includes("\\")) return null;
  const parts = path.split("/");
  if (parts.some((p) => p === "" || p === "." || p === "..") || parts[0] === ".git") return null;
  return path;
}

export async function runApiAgent(options: AgentOptions): Promise<AgentResult> {
  const { goal, llm, repo, log } = options;
  const changes: FileChanges = new Map();
  const original = new Set(repo.files);

  const exists = (path: string) => (changes.has(path) ? changes.get(path) !== null : original.has(path));
  const currentFiles = () =>
    [...new Set([...original, ...changes.keys()])].filter(exists).sort((a, b) => a.localeCompare(b));

  async function runTool(call: ToolCall): Promise<{ content: string; summary?: string }> {
    const input = call.input;
    switch (call.name) {
      case "list_files": {
        const dir = typeof input.directory === "string" ? input.directory.replace(/^\.?\/*|\/+$/g, "") : "";
        const files = currentFiles().filter((f) => !dir || f.startsWith(`${dir}/`));
        const shown = files.slice(0, MAX_LISTED).join("\n");
        return {
          content: files.length > MAX_LISTED ? `${shown}\n… ${files.length - MAX_LISTED} fichiers de plus, précise un dossier.` : shown || "(aucun fichier)",
        };
      }
      case "read_file": {
        const path = safePath(input.path);
        if (!path) return { content: "Erreur : chemin invalide." };
        if (!exists(path)) return { content: `Erreur : ${path} n'existe pas.` };
        await log(`📖 Lecture de ${path}`);
        const text = changes.has(path) ? changes.get(path)! : await repo.read(path);
        if (text === null) return { content: `Erreur : ${path} est introuvable.` };
        if (text.includes("\u0000")) return { content: `Erreur : ${path} est un fichier binaire.` };
        return {
          content: text.length > MAX_READ_CHARS ? `${text.slice(0, MAX_READ_CHARS)}\n… (fichier tronqué)` : text,
        };
      }
      case "write_file": {
        const path = safePath(input.path);
        if (!path) return { content: "Erreur : chemin invalide." };
        if (typeof input.content !== "string") return { content: "Erreur : contenu manquant." };
        if (input.content.length > MAX_WRITE_CHARS) return { content: "Erreur : fichier trop gros." };
        changes.set(path, input.content);
        await log(`✏️ ${original.has(path) ? "Modification" : "Création"} de ${path}`);
        return { content: "OK" };
      }
      case "delete_file": {
        const path = safePath(input.path);
        if (!path || !exists(path)) return { content: "Erreur : ce fichier n'existe pas." };
        if (original.has(path)) changes.set(path, null);
        else changes.delete(path);
        await log(`🗑️ Suppression de ${path}`);
        return { content: "OK" };
      }
      case "finish": {
        const summary = typeof input.summary === "string" ? input.summary.trim() : "";
        return { content: "OK", summary: summary || "Travail terminé." };
      }
      default:
        return { content: `Erreur : outil inconnu « ${call.name} ».` };
    }
  }

  const messages: ChatMessage[] = [{ role: "user", text: goal }];
  for (let step = 0; step < (options.maxSteps ?? MAX_STEPS); step++) {
    const response = await llm.complete(SYSTEM, messages, TOOLS);
    messages.push({ role: "assistant", text: response.text, toolCalls: response.toolCalls });
    if (response.text.trim()) await log(response.text.trim().slice(0, 1000));

    if (response.toolCalls.length === 0) {
      if (response.stop === "length") throw new AgentError("La réponse de l'IA a été coupée (trop longue)");
      // Sans appel d'outil, le modèle considère avoir terminé : son texte sert de résumé.
      return { changes: await withoutNoOps(changes, repo), summary: response.text.trim() || "Travail terminé." };
    }

    const results: { id: string; content: string }[] = [];
    let summary: string | undefined;
    for (const call of response.toolCalls) {
      const result = await runTool(call);
      results.push({ id: call.id, content: result.content });
      summary ??= result.summary;
    }
    messages.push({ role: "tool", results });
    if (summary !== undefined) return { changes: await withoutNoOps(changes, repo), summary };
  }
  throw new AgentError(`L'agent n'a pas terminé en ${options.maxSteps ?? MAX_STEPS} étapes`);
}

/** Retire les « modifications » qui laissent un fichier identique à l'original. */
async function withoutNoOps(changes: FileChanges, repo: RepoReader): Promise<FileChanges> {
  const result: FileChanges = new Map();
  const original = new Set(repo.files);
  for (const [path, content] of changes) {
    if (content !== null && original.has(path) && (await repo.read(path)) === content) continue;
    result.set(path, content);
  }
  return result;
}
