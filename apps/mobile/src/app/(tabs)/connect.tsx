import { AI_PROVIDERS, type AiKeySummary } from "@pocketdev/shared";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AiKeyCard } from "../../components/AiKeyCard";
import { Button, Card, CardTitle, ErrorText, Muted } from "../../components/ui";
import { Screen } from "../../components/Screen";
import { API_URL } from "../../config";
import { useSession } from "../../lib/session";
import { useApi } from "../../lib/useApi";
import { colors } from "../../theme/colors";

type ApiState = "checking" | "online" | "offline";

/** Cloudflare et Vercel sont présentés à égalité (cahier des charges, section 5). */
const UPCOMING = ["Cloudflare", "Vercel", "Supabase", "Stripe"];

export default function ConnectScreen() {
  const [api, setApi] = useState<ApiState>("checking");
  const { state, signIn, signOut } = useSession();
  const aiKeys = useApi<{ keys: AiKeySummary[] }>(state.status === "signedIn" ? "/ai/keys" : null);

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((res) => setApi(res.ok ? "online" : "offline"))
      .catch(() => setApi("offline"));
  }, []);

  return (
    <Screen title="Connect" subtitle="Tes services : dépôts, déploiement, bases de données et IA.">
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: api === "online" ? colors.success : colors.danger }]} />
        <Text style={styles.label}>
          Serveur PocketDev : {api === "checking" ? "vérification…" : api === "online" ? "en ligne" : "injoignable"}
        </Text>
      </View>

      <Card>
        <CardTitle>GitHub</CardTitle>
        {state.status === "signedIn" ? (
          <>
            <Muted>Connecté en tant que @{state.user.githubLogin}</Muted>
            <Button label="Se déconnecter" variant="secondary" onPress={signOut} />
          </>
        ) : (
          <>
            <Muted>{state.status === "loading" ? "Vérification…" : "Non connecté"}</Muted>
            {state.status === "signedOut" && state.error ? <ErrorText>{state.error}</ErrorText> : null}
            <Button
              label="Se connecter avec GitHub"
              onPress={signIn}
              disabled={state.status === "loading" || api !== "online"}
            />
          </>
        )}
      </Card>

      <Text style={styles.section}>IA</Text>
      <Muted>Tu utilises ta propre clé : ta consommation est facturée directement par ton fournisseur.</Muted>
      {state.status !== "signedIn" ? (
        <Muted>Connecte GitHub pour ajouter une clé IA.</Muted>
      ) : aiKeys.status === "error" ? (
        <ErrorText>{aiKeys.error}</ErrorText>
      ) : aiKeys.status === "ok" ? (
        AI_PROVIDERS.map((provider) => (
          <AiKeyCard
            key={provider}
            provider={provider}
            saved={aiKeys.data.keys.find((k) => k.provider === provider)}
            onChange={aiKeys.reload}
          />
        ))
      ) : null}

      <Text style={styles.section}>Bientôt</Text>
      {UPCOMING.map((service) => (
        <Card key={service}>
          <CardTitle>{service}</CardTitle>
          <Muted>Non connecté</Muted>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { color: colors.text, fontSize: 15 },
  section: { color: colors.text, fontSize: 20, fontWeight: "700", marginTop: 8 },
});
