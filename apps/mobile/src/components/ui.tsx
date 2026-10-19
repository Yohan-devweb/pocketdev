import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
}: {
  label: string;
  onPress(): void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        variant === "secondary" && styles.secondary,
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      <Text style={[styles.buttonLabel, variant === "secondary" && { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, onPress }: { children: ReactNode; onPress?(): void }) {
  if (!onPress) return <View style={styles.card}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}>
      {children}
    </Pressable>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.cardTitle}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function Loading() {
  return <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <Text style={styles.error}>{children}</Text>;
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: "center",
  },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  buttonLabel: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: "600" },
  muted: { color: colors.textMuted, fontSize: 15, lineHeight: 21 },
  error: { color: colors.danger, fontSize: 15 },
});
