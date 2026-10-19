import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router/tabs";
import type { ComponentProps } from "react";
import { colors } from "../../theme/colors";

type IconName = ComponentProps<typeof Ionicons>["name"];

/** Les cinq onglets du cahier des charges (section 3). */
const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: "index", title: "Projects", icon: "folder-open-outline" },
  { name: "chat", title: "AI Chat", icon: "chatbubbles-outline" },
  { name: "preview", title: "Preview", icon: "phone-portrait-outline" },
  { name: "agents", title: "Agents", icon: "git-network-outline" },
  { name: "connect", title: "Connect", icon: "link-outline" },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ focused, size }) => (
              <Ionicons name={tab.icon} color={focused ? colors.accent : colors.textMuted} size={size} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
