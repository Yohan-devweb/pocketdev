import { router } from "expo-router";
import { Button, Card, CardTitle, ErrorText, Loading, Muted } from "../../components/ui";
import { EmptyState, Screen } from "../../components/Screen";
import type { ApiProject } from "../../lib/api";
import { useSession } from "../../lib/session";
import { useApi } from "../../lib/useApi";

export default function ProjectsScreen() {
  const { state } = useSession();
  const projects = useApi<{ projects: ApiProject[] }>(state.status === "signedIn" ? "/projects" : null);

  return (
    <Screen title="Projects" subtitle="Tes dépôts GitHub et tes nouveaux projets.">
      {state.status === "loading" ? <Loading /> : null}
      {state.status === "signedOut" ? (
        <>
          <EmptyState
            title="Connecte ton compte GitHub"
            description="Tes projets viennent de tes dépôts GitHub. Connecte-toi depuis l'onglet Connect."
          />
          <Button label="Aller à Connect" onPress={() => router.navigate("/connect")} />
        </>
      ) : null}
      {state.status === "signedIn" ? (
        <>
          <Button label="Importer un dépôt GitHub" onPress={() => router.push("/import")} />
          {projects.status === "loading" ? <Loading /> : null}
          {projects.status === "error" ? <ErrorText>{projects.error}</ErrorText> : null}
          {projects.status === "ok" && projects.data.projects.length === 0 ? (
            <EmptyState title="Aucun projet pour l'instant" description="Importe un de tes dépôts pour commencer." />
          ) : null}
          {projects.status === "ok"
            ? projects.data.projects.map((p) => (
                <Card key={p.id} onPress={() => router.push(`/project/${p.id}`)}>
                  <CardTitle>{p.name}</CardTitle>
                  <Muted>
                    {p.repository} · {p.defaultBranch}
                  </Muted>
                </Card>
              ))
            : null}
        </>
      ) : null}
    </Screen>
  );
}
