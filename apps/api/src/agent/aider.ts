import type { AiProvider } from "@pocketdev/shared";

/**
 * Agent de code exécuté dans le runner : Aider (https://aider.chat), un agent open source
 * compatible avec les trois fournisseurs. Il modifie les fichiers ; c'est PocketDev qui
 * calcule le diff, commit et pousse la branche.
 */

export interface AgentInput {
  goal: string;
  provider: AiProvider;
  model: string;
  apiKey: string;
}

/** Variable d'environnement lue par Aider (via LiteLLM) pour chaque fournisseur. */
const KEY_ENV: Record<AiProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

/** Fichiers de travail d'Aider, à ne jamais inclure dans le diff. */
export const AGENT_IGNORED = ".aider*";

export function agentCommand(input: AgentInput): { cmd: string[]; env: Record<string, string> } {
  return {
    cmd: [
      "aider",
      "--model",
      `${input.provider}/${input.model}`,
      "--message",
      input.goal,
      // Pas de questions : l'agent travaille seul jusqu'au bout.
      "--yes-always",
      // PocketDev commit et pousse lui-même, une fois le diff vérifié.
      "--no-auto-commits",
      "--no-dirty-commits",
      // Jamais de commande shell proposée puis exécutée automatiquement.
      "--no-suggest-shell-commands",
      "--no-detect-urls",
      "--no-gitignore",
      "--no-check-update",
      "--no-show-model-warnings",
      "--no-analytics",
      "--no-pretty",
      "--no-stream",
      "--edit-format",
      "diff",
      "--chat-history-file",
      "/tmp/aider-chat.md",
      "--input-history-file",
      "/tmp/aider-input",
    ],
    // La clé ne passe que par l'environnement de cette commande : ni arguments, ni disque.
    env: { [KEY_ENV[input.provider]]: input.apiKey },
  };
}

/** Retire toute occurrence d'un secret avant d'enregistrer un texte. */
export function redact(text: string, secrets: string[]): string {
  return secrets.filter((s) => s.length >= 8).reduce((acc, secret) => acc.split(secret).join("***"), text);
}
