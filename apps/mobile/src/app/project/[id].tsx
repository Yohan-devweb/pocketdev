import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, ErrorText, Loading, Muted } from "../../components/ui";
import { Screen } from "../../components/Screen";
import type { ApiProject, RepoEntry } from "../../lib/api";
import { useApi } from "../../lib/useApi";
import { colors } from "../../theme/colors";

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const project = useApi<{ project: ApiProject }>(`/projects/${id}`);
  const branches = useApi<{ branches: string[] }>(`/projects/${id}/branches`);
  const [branch, setBranch] = useState<string | null>(null);
  const [path, setPath] = useState("");

  const currentBranch = branch ?? (project.status === "ok" ? project.data.project.defaultBranch : null);
  const files = useApi<{ entries: RepoEntry[] }>(
    currentBranch
      ? `/projects/${id}/files?branch=${encodeURIComponent(currentBranch)}&path=${encodeURIComponent(path)}`
      : null,
  );

  return (
    <Screen
      title={project.status === "ok" ? project.data.project.name : "Projet"}
      subtitle={project.status === "ok" ? project.data.project.repository : undefined}
    >
      {project.status === "error" ? <ErrorText>{project.error}</ErrorText> : null}

      <Text style={styles.section}>Branches</Text>
      {branches.status === "loading" ? <Loading /> : null}
      {branches.status === "error" ? <ErrorText>{branches.error}</ErrorText> : null}
      {branches.status === "ok" ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {branches.data.branches.map((name) => (
            <Pressable
              key={name}
              onPress={() => {
                setBranch(name);
                setPath("");
              }}
              style={[styles.chip, name === currentBranch && styles.chipActive]}
            >
              <Text style={[styles.chipLabel, name === currentBranch && { color: "#FFFFFF" }]}>{name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <Text style={styles.section}>Fichiers{path ? ` · ${path}` : ""}</Text>
      {files.status === "loading" ? <Loading /> : null}
      {files.status === "error" ? <ErrorText>{files.error}</ErrorText> : null}
      {files.status === "ok" ? (
        <Card>
          {path ? (
            <Row icon="arrow-up" label=".." onPress={() => setPath(path.split("/").slice(0, -1).join("/"))} />
          ) : null}
          {files.data.entries.length === 0 ? <Muted>Dossier vide</Muted> : null}
          {files.data.entries.map((entry) => (
            <Row
              key={entry.path}
              icon={entry.type === "dir" ? "folder" : "document-text-outline"}
              label={entry.name}
              onPress={entry.type === "dir" ? () => setPath(entry.path) : undefined}
            />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

function Row({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?(): void;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.row}>
      <Ionicons name={icon} size={18} color={onPress ? colors.accent : colors.textMuted} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { color: colors.textMuted, fontSize: 13, fontWeight: "600", textTransform: "uppercase", marginTop: 8 },
  chips: { gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipLabel: { color: colors.text, fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  rowLabel: { color: colors.text, fontSize: 15 },
});
