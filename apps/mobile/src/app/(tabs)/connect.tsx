import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, Card, CardTitle, ErrorText, Muted } from "../../components/ui";
import { Screen } from "../../components/Screen";
import { API_URL } from "../../config";
import { useSession } from "../../lib/session";
import { colors } from "../../theme/colors";

type ApiState = "checking" | "online" | "offline";

/** Cloudflare et Vercel sont présentés à égalité (cahier des charges, section 5). */
const UPCOMING = ["Cloudflare", "Vercel", "Supabase", "Clé IA (Claude, OpenAI, OpenRouter)", "Stripe"];

export default function ConnectScreen() {
  const [api, setApi] = useState<ApiState>("checking");
  const { state, signIn, signOut } = useSession();

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
});
