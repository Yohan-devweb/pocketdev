import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { EmptyState, Screen } from "../../components/Screen";
import { API_URL } from "../../config";
import { colors } from "../../theme/colors";

type ApiState = "checking" | "online" | "offline";

/** Cloudflare et Vercel sont présentés à égalité (cahier des charges, section 5). */
const SERVICES = ["GitHub", "Cloudflare", "Vercel", "Supabase", "Clé IA (Claude, OpenAI, OpenRouter)", "Stripe"];

export default function ConnectScreen() {
  const [api, setApi] = useState<ApiState>("checking");

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
      {SERVICES.map((service) => (
        <EmptyState key={service} title={service} description="Non connecté" />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { color: colors.text, fontSize: 15 },
});
