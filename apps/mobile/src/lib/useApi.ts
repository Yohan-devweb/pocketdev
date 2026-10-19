import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { apiFetch } from "./api";
import { useToken } from "./session";

type Result<T> = { status: "idle" | "loading" } | { status: "error"; error: string } | { status: "ok"; data: T };

/** Charge une ressource de l'API à chaque fois que l'écran redevient visible. */
export function useApi<T>(path: string | null): Result<T> & { reload(): void } {
  const token = useToken();
  const [result, setResult] = useState<Result<T>>({ status: "idle" });
  const [version, setVersion] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!path || !token) return setResult({ status: "idle" });
      let cancelled = false;
      setResult({ status: "loading" });
      apiFetch<T>(path, token)
        .then((data) => !cancelled && setResult({ status: "ok", data }))
        .catch((err: Error) => !cancelled && setResult({ status: "error", error: err.message }));
      return () => {
        cancelled = true;
      };
    }, [path, token, version]),
  );

  return { ...result, reload: () => setVersion((v) => v + 1) };
}
