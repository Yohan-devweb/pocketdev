import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Button, Card, CardTitle, ErrorText, Loading, Muted } from "../components/ui";
import { EmptyState, Screen } from "../components/Screen";
import { apiFetch, type ApiProject, type GitHubRepo } from "../lib/api";
import { useToken } from "../lib/session";
import { useApi } from "../lib/useApi";

export default function ImportScreen() {
  const token = useToken();
  const repos = useApi<{ repos: GitHubRepo[] }>("/github/repos");
  const [importing, setImporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function importRepo(repository: string) {
    setImporting(repository);
    setError(null);
    try {
      const { project } = await apiFetch<{ project: ApiProject }>("/projects", token, {
        method: "POST",
        body: JSON.stringify({ repository }),
      });
      router.replace(`/project/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import impossible");
      setImporting(null);
    }
  }

  async function manageAccess() {
    const { url } = await apiFetch<{ url: string }>("/github/install-url", token);
    await WebBrowser.openBrowserAsync(url);
    repos.reload();
  }

  return (
    <Screen title="Importer un dépôt" subtitle="Seuls les dépôts que tu as autorisés pour PocketDev apparaissent.">
      {repos.status === "loading" ? <Loading /> : null}
      {repos.status === "error" ? <ErrorText>{repos.error}</ErrorText> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {repos.status === "ok" && repos.data.repos.length === 0 ? (
        <EmptyState
          title="Aucun dépôt autorisé"
          description="Installe l'app PocketDev sur ton compte GitHub et choisis les dépôts à lui confier."
        />
      ) : null}
      {repos.status === "ok"
        ? repos.data.repos.map((repo) => (
            <Card key={repo.fullName} onPress={importing ? undefined : () => importRepo(repo.fullName)}>
              <CardTitle>{repo.fullName}</CardTitle>
              <Muted>
                {repo.private ? "Privé" : "Public"} · {repo.defaultBranch}
                {importing === repo.fullName ? " · import en cours…" : ""}
              </Muted>
            </Card>
          ))
        : null}
      <Button label="Choisir les dépôts autorisés sur GitHub" variant="secondary" onPress={manageAccess} />
    </Screen>
  );
}
