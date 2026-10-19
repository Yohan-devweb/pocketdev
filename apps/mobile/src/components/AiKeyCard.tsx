import { AI_PROVIDER_LABELS, type AiKeySummary, type AiProvider } from "@pocketdev/shared";
import { useState } from "react";
import { Linking, StyleSheet, TextInput } from "react-native";
import { apiFetch } from "../lib/api";
import { useToken } from "../lib/session";
import { colors } from "../theme/colors";
import { Button, Card, CardTitle, ErrorText, Muted } from "./ui";

/** Où l'utilisateur crée sa clé, et à quoi elle ressemble. */
const PROVIDER_HELP: Record<AiProvider, { url: string; placeholder: string }> = {
  anthropic: { url: "https://console.anthropic.com/settings/keys", placeholder: "sk-ant-…" },
  openai: { url: "https://platform.openai.com/api-keys", placeholder: "sk-…" },
  openrouter: { url: "https://openrouter.ai/keys", placeholder: "sk-or-…" },
};

/**
 * Connexion d'une clé IA. La clé saisie part une seule fois vers l'API, qui la vérifie
 * auprès du fournisseur avant de l'enregistrer chiffrée ; l'app ne la garde pas.
 */
export function AiKeyCard({
  provider,
  saved,
  onChange,
}: {
  provider: AiProvider;
  saved: AiKeySummary | undefined;
  onChange(): void;
}) {
  const token = useToken();
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const help = PROVIDER_HELP[provider];

  async function call(init: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/ai/keys/${provider}`, token, init);
      setKey("");
      setEditing(false);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action impossible");
    } finally {
      setBusy(false);
    }
  }

  const showForm = editing || !saved;

  return (
    <Card>
      <CardTitle>{AI_PROVIDER_LABELS[provider]}</CardTitle>
      <Muted>{saved ? `Connecté · clé se terminant par ${saved.hint}` : "Non connecté"}</Muted>
      {showForm ? (
        <>
          <TextInput
            value={key}
            onChangeText={setKey}
            placeholder={help.placeholder}
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            style={styles.input}
          />
          {error ? <ErrorText>{error}</ErrorText> : null}
          <Button
            label={busy ? "Vérification…" : "Vérifier et enregistrer"}
            onPress={() => call({ method: "PUT", body: JSON.stringify({ key }) })}
            disabled={busy || key.trim().length === 0}
          />
          {saved ? (
            <Button label="Annuler" variant="secondary" onPress={() => setEditing(false)} disabled={busy} />
          ) : (
            <Button label="Créer une clé sur le site du fournisseur" variant="secondary" onPress={() => Linking.openURL(help.url)} />
          )}
        </>
      ) : (
        <>
          {error ? <ErrorText>{error}</ErrorText> : null}
          <Button label="Remplacer la clé" variant="secondary" onPress={() => setEditing(true)} disabled={busy} />
          <Button label="Retirer" variant="secondary" onPress={() => call({ method: "DELETE" })} disabled={busy} />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  input: {
    color: colors.text,
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
});
