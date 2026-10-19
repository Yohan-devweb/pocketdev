import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { API_URL } from "../config";
import { ApiError, apiFetch, type Me } from "./api";
import { readSessionToken, writeSessionToken } from "./session-storage";

WebBrowser.maybeCompleteAuthSession();

type SessionState =
  | { status: "loading" }
  | { status: "signedOut"; error?: string }
  | { status: "signedIn"; token: string; user: Me };

interface SessionContextValue {
  state: SessionState;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    (async () => {
      const token = await readSessionToken();
      if (!token) return setState({ status: "signedOut" });
      try {
        const user = await apiFetch<Me>("/me", token);
        setState({ status: "signedIn", token, user });
      } catch (err) {
        // Session refusée : on l'oublie. Serveur injoignable : on la garde pour plus tard.
        if (err instanceof ApiError && err.status === 401) await writeSessionToken(null);
        setState({ status: "signedOut", error: err instanceof ApiError && err.status !== 401 ? err.message : undefined });
      }
    })();
  }, []);

  const signIn = useCallback(async () => {
    const redirect = Linking.createURL("auth");
    const startUrl = `${API_URL}/auth/github/start?redirect_uri=${encodeURIComponent(redirect)}`;
    const result = await WebBrowser.openAuthSessionAsync(startUrl, redirect);
    if (result.type !== "success") return;

    const code = new URL(result.url).searchParams.get("code");
    if (!code) return setState({ status: "signedOut", error: "GitHub n'a pas renvoyé de code" });
    try {
      const { token } = await apiFetch<{ token: string }>("/auth/exchange", null, {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      await writeSessionToken(token);
      const user = await apiFetch<Me>("/me", token);
      setState({ status: "signedIn", token, user });
    } catch (err) {
      setState({ status: "signedOut", error: err instanceof Error ? err.message : "Connexion impossible" });
    }
  }, []);

  const signOut = useCallback(async () => {
    if (state.status === "signedIn") {
      await apiFetch("/auth/logout", state.token, { method: "POST" }).catch(() => undefined);
    }
    await writeSessionToken(null);
    setState({ status: "signedOut" });
  }, [state]);

  const value = useMemo(() => ({ state, signIn, signOut }), [state, signIn, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession doit être utilisé dans SessionProvider");
  return value;
}

/** Jeton de la session courante, ou null si l'utilisateur n'est pas connecté. */
export function useToken(): string | null {
  const { state } = useSession();
  return state.status === "signedIn" ? state.token : null;
}
