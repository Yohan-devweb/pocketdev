import {
  AI_PROVIDER_LABELS,
  type AgentRunDetails,
  type AiKeySummary,
  type AiProvider,
  DEFAULT_AI_MODELS,
} from "@pocketdev/shared";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput } from "react-native";
import { Chips, SectionLabel } from "../../components/Chips";
import { EmptyState, Screen } from "../../components/Screen";
import { Button, Card, CardTitle, ErrorText, Loading, Muted } from "../../components/ui";
import { apiFetch, type ApiProject } from "../../lib/api";
import { firstLine, RUN_STATUS } from "../../lib/runs";
import { useSession, useToken } from "../../lib/session";
import { useApi } from "../../lib/useApi";
import { colors } from "../../theme/colors";

export default function ChatScreen() {
  const { state } = useSession();
  const token = useToken();
  const signedIn = state.status === "signedIn";
  const projects = useApi<{ projects: ApiProject[] }>(signedIn ? "/projects" : null);
  const keys = useApi<{ keys: AiKeySummary[] }>(signedIn ? "/ai/keys" : null);

  const [projectId, setProjectId] = useState<string | null>(null);
  const [provider, setProvider] = useState<AiProvider | null>(null);
  const [model, setModel] = useState("");
  const [goal, setGoal] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const projectList = projects.status === "ok" ? projects.data.projects : [];
  const providers: AiProvider[] = keys.status === "ok" ? keys.data.keys.map((k) => k.provider) : [];
  const currentProject = projectList.find((p) => p.id === projectId) ?? projectList[0] ?? null;
  const currentProvider = provider && providers.includes(provider) ? provider : (providers[0] ?? null);
  const runs = useApi<{ runs: AgentRunDetails[] }>(currentProject ? `/projects/${currentProject.id}/runs` : null);

  // Le modèle proposé suit le fournisseur choisi ; l'utilisateur peut le changer.
  useEffect(() => {
    if (currentProvider) setModel(DEFAULT_AI_MODELS[currentProvider]);
  }, [currentProvider]);

  async function send() {
    if (!currentProject || !currentProvider) return;
    setSending(true);
    setError(null);
    try {
      const { run } = await apiFetch<{ run: AgentRunDetails }>(`/projects/${currentProject.id}/runs`, token, {
        method: "POST",
        body: JSON.stringify({ goal, provider: currentProvider, model }),
      });
      setGoal("");
      router.push(`/run/${run.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Envoi impossible");
    } finally {
      setSending(false);
    }
  }

  const header = { title: "AI Chat", subtitle: "Décris ce que tu veux changer : l'agent le code sur une nouvelle branche." };

  if (!signedIn) {
    return (
      <Screen {...header}>
        <EmptyState title="Connecte GitHub" description="Va dans l'onglet Connect pour te connecter avec GitHub." />
      </Screen>
    );
  }
  if (projects.status !== "ok" || keys.status !== "ok") {
    return (
      <Screen {...header}>
        {projects.status === "error" ? <ErrorText>{projects.error}</ErrorText> : null}
        {keys.status === "error" ? <ErrorText>{keys.error}</ErrorText> : null}
        {projects.status !== "error" && keys.status !== "error" ? <Loading /> : null}
      </Screen>
    );
  }
  if (!currentProject) {
    return (
      <Screen {...header}>
        <EmptyState title="Aucun projet" description="Importe d'abord un dépôt GitHub depuis l'onglet Projects." />
      </Screen>
    );
  }
  if (!currentProvider) {
    return (
      <Screen {...header}>
        <EmptyState
          title="Aucune clé IA connectée"
          description="L'agent utilise ta propre clé (Claude, ChatGPT ou OpenRouter). Ajoute-la dans l'onglet Connect."
        />
        <Button label="Ouvrir Connect" variant="secondary" onPress={() => router.navigate("/connect")} />
      </Screen>
    );
  }

  return (
    <Screen {...header}>
      <SectionLabel>Projet</SectionLabel>
      <Chips
        options={projectList.map((p) => p.id)}
        selected={currentProject.id}
        onSelect={setProjectId}
        label={(id) => projectList.find((p) => p.id === id)?.name ?? id}
      />

      <SectionLabel>IA</SectionLabel>
      <Chips<AiProvider> options={providers} selected={currentProvider} onSelect={setProvider} label={(p) => AI_PROVIDER_LABELS[p]} />
      <TextInput
        value={model}
        onChangeText={setModel}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Modèle"
        style={styles.input}
      />

      <SectionLabel>Ta demande</SectionLabel>
      <TextInput
        value={goal}
        onChangeText={setGoal}
        placeholder="Ex. : ajoute un pied de page avec le copyright et un lien vers GitHub"
        placeholderTextColor={colors.textMuted}
        multiline
        maxLength={4000}
        editable={!sending}
        style={[styles.input, styles.goal]}
      />
      <Muted>{`L'agent part de la branche ${currentProject.defaultBranch} et pousse son travail sur une nouvelle branche. Rien n'est fusionné sans toi.`}</Muted>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button
        label={sending ? "Envoi…" : "Lancer l'agent"}
        onPress={send}
        disabled={sending || goal.trim().length === 0 || model.trim().length === 0}
      />

      <SectionLabel>Demandes récentes</SectionLabel>
      {runs.status === "error" ? <ErrorText>{runs.error}</ErrorText> : null}
      {runs.status === "ok" && runs.data.runs.length === 0 ? <Muted>Aucune demande pour ce projet.</Muted> : null}
      {runs.status === "ok"
        ? runs.data.runs.map((run) => (
            <Card key={run.id} onPress={() => router.push(`/run/${run.id}`)}>
              <CardTitle>{firstLine(run.goal)}</CardTitle>
              <Text style={{ color: RUN_STATUS[run.status].color, fontSize: 14 }}>
                {RUN_STATUS[run.status].label}
                {run.files.length > 0 ? ` · ${run.files.length} fichier(s) modifié(s)` : ""}
              </Text>
            </Card>
          ))
        : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    color: colors.text,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  goal: { minHeight: 120, textAlignVertical: "top" },
});
