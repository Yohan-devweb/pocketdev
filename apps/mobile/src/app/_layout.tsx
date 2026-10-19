import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "../lib/session";
import { colors } from "../theme/colors";

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.background, card: colors.surface, primary: colors.accent },
};

export default function RootLayout() {
  return (
    <SessionProvider>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="import" options={{ presentation: "modal" }} />
          <Stack.Screen
            name="project/[id]"
            options={{
              headerShown: true,
              title: "",
              headerBackTitle: "Projets",
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.accent,
              headerShadowVisible: false,
            }}
          />
        </Stack>
      </ThemeProvider>
    </SessionProvider>
  );
}
