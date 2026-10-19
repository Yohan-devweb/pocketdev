import { EmptyState, Screen } from "../../components/Screen";

export default function PreviewScreen() {
  return (
    <Screen title="Preview" subtitle="L'aperçu de ton projet, servi depuis son runner.">
      <EmptyState
        title="Aucun aperçu en cours"
        description="Un aperçu apparaît ici dès qu'une tâche démarre le serveur de ton projet."
      />
    </Screen>
  );
}
