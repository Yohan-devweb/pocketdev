import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "pocketdev.session";

/** Le jeton de session vit dans le trousseau iOS ; sur le web, dans le stockage du navigateur. */
export async function readSessionToken(): Promise<string | null> {
  if (Platform.OS === "web") return globalThis.localStorage?.getItem(KEY) ?? null;
  return SecureStore.getItemAsync(KEY);
}

export async function writeSessionToken(token: string | null): Promise<void> {
  if (Platform.OS === "web") {
    if (token) globalThis.localStorage?.setItem(KEY, token);
    else globalThis.localStorage?.removeItem(KEY);
    return;
  }
  if (token) await SecureStore.setItemAsync(KEY, token);
  else await SecureStore.deleteItemAsync(KEY);
}
