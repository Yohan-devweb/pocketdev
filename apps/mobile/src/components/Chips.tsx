import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { colors } from "../theme/colors";

/** Choix unique parmi quelques options (branches, projets, fournisseurs). */
export function Chips<T extends string>({
  options,
  selected,
  onSelect,
  label = (value) => value,
}: {
  options: readonly T[];
  selected: T | null;
  onSelect(value: T): void;
  label?(value: T): string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {options.map((value) => (
        <Pressable
          key={value}
          accessibilityRole="button"
          accessibilityState={{ selected: value === selected }}
          onPress={() => onSelect(value)}
          style={[styles.chip, value === selected && styles.chipActive]}
        >
          <Text style={[styles.chipLabel, value === selected && { color: "#FFFFFF" }]}>{label(value)}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.section}>{children}</Text>;
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
});
