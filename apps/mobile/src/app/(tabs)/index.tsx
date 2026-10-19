import { EmptyState, Screen } from "../../components/Screen";

export default function ProjectsScreen() {
  return (
    <Screen title="Projects" subtitle="Tes dépôts GitHub et tes nouveaux projets.">
      <EmptyState
        title="Aucun projet pour l'instant"
        description="L'import d'un dépôt GitHub arrive avec la connexion GitHub (Phase 0)."
      />
    </Screen>
  );
}
