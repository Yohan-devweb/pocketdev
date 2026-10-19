import { type AgentRunDetails, isTerminal } from "@pocketdev/shared";
import { useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { SectionLabel } from "../../components/Chips";
import { Screen } from "../../components/Screen";
import { Button, Card, ErrorText, Loading, Muted } from "../../components/ui";
import { apiFetch, type ApiProject } from "../../lib/api";
import { firstLine, RUN_STATUS } from "../../lib/runs";
import { useToken } from "../../lib/session";
import { useApi } from "../../lib/useApi";
import { colors } from "../../theme/colors";

const POLL_MS = 3000;
/** Au-delà, le diff se lit sur GitHub : un téléphone n'affiche pas confortablement des milliers de lignes. */
const DIFF_PREVIEW_LINES = 400;

export default function RunScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const token = useToken();
  const [run, setRun] = useState<AgentRunDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const project = useApi<{ project: ApiProject }>(run ? `/projects/${run.projectId}` : null);

  // Interroge l'API tant que la demande n'est pas terminée.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const { run: latest } = await apiFetch<{ run: AgentRunDetails }>(`/runs/${id}`, token);
        if (stopped) return;
        setRun(latest);
        setError(null);
        if (!isTerminal(latest.status)) timer = setTimeout(poll, POLL_MS);
      } catch (err) {
        if (stopped) return;
        setError(err instanceof Error ? err.message : "Chargement impossible");
        timer = setTimeout(poll, POLL_MS * 2);
      }
    }
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [id, token]);

  if (!run) {
    return <Screen title="Demande">{error ? <ErrorText>{error}</ErrorText> : <Loading />}</Screen>;
  }

  const status = RUN_STATUS[run.status];
  const repository = project.status === "ok" ? project.data.project.repository : null;
  const diffLines = run.diff ? run.diff.split("\n") : [];

  return (
    <Screen title={firstLine(run.goal)} subtitle={`${run.model} · depuis ${run.baseBranch}`}>
      <View style={styles.statusRow}>
        <View style={[styles.dot, { backgroundColor: status.color }]} />
        <Text style={[styles.status, { color: status.color }]}>{status.label}</Text>
      </View>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {run.error ? <ErrorText>{run.error}</ErrorText> : null}

      {run.status === "succeeded" && run.files.length === 0 ? (
        <Muted>L'agent n'a modifié aucun fichier. Son journal ci-dessous explique pourquoi.</Muted>
      ) : null}

      {run.branch && repository ? (
        <Card>
          <Muted>{`Branche ${run.branch} poussée sur GitHub. Rien n'est fusionné : à toi de relire et décider.`}</Muted>
          <Button
            label="Voir sur GitHub"
            onPress={() =>
              WebBrowser.openBrowserAsync(`https://github.com/${repository}/compare/${run.baseBranch}...${run.branch}`)
            }
          />
        </Card>
      ) : null}

      {run.files.length > 0 ? (
        <>
          <SectionLabel>{`Fichiers modifiés (${run.files.length})`}</SectionLabel>
          <Card>
            {run.files.map((file) => (
              <Text key={file} style={styles.mono}>
                {file}
              </Text>
            ))}
          </Card>
        </>
      ) : null}

      {diffLines.length > 0 ? (
        <>
          <SectionLabel>Diff</SectionLabel>
          <Card>
            {diffLines.slice(0, DIFF_PREVIEW_LINES).map((line, i) => (
              <Text key={i} style={[styles.mono, diffColor(line)]}>
                {line || " "}
              </Text>
            ))}
            {diffLines.length > DIFF_PREVIEW_LINES ? (
              <Muted>{`… ${diffLines.length - DIFF_PREVIEW_LINES} lignes de plus, à lire sur GitHub.`}</Muted>
            ) : null}
          </Card>
        </>
      ) : null}

      <SectionLabel>Journal</SectionLabel>
      {run.log ? (
        <>
          <Button label={showLog ? "Masquer le journal" : "Afficher le journal"} variant="secondary" onPress={() => setShowLog(!showLog)} />
          {showLog ? (
            <Card>
              <Text style={styles.mono}>{run.log}</Text>
            </Card>
          ) : null}
        </>
      ) : (
        <Muted>{isTerminal(run.status) ? "Journal vide." : "Le runner démarre…"}</Muted>
      )}
    </Screen>
  );
}

function diffColor(line: string) {
  if (line.startsWith("+++") || line.startsWith("---")) return { color: colors.textMuted };
  if (line.startsWith("+")) return { color: colors.success };
  if (line.startsWith("-")) return { color: colors.danger };
  if (line.startsWith("@@")) return { color: colors.accent };
  return null;
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  status: { fontSize: 16, fontWeight: "600" },
  mono: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
});
