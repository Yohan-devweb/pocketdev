import type { Project } from "@pocketdev/shared";
import { API_URL } from "../config";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, token: string | null, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, "Serveur PocketDev injoignable");
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Erreur ${res.status}`);
  return body;
}

export interface Me {
  id: string;
  githubLogin: string;
}

export interface GitHubRepo {
  fullName: string;
  private: boolean;
  defaultBranch: string;
  installationId: number;
}

export interface RepoEntry {
  name: string;
  path: string;
  type: "file" | "dir" | "symlink" | "submodule";
}

export type ApiProject = Project & { installationId: number };
