import type { RunStatus } from "@pocketdev/shared";
import { colors } from "../theme/colors";

export const RUN_STATUS: Record<RunStatus, { label: string; color: string }> = {
  awaiting_approval: { label: "En attente de ton accord", color: colors.textMuted },
  queued: { label: "En attente d'un runner", color: colors.textMuted },
  running: { label: "L'agent travaille…", color: colors.accent },
  succeeded: { label: "Terminé", color: colors.success },
  failed: { label: "Échec", color: colors.danger },
  cancelled: { label: "Annulé", color: colors.textMuted },
};

export const firstLine = (text: string) => text.split("\n")[0] ?? text;
