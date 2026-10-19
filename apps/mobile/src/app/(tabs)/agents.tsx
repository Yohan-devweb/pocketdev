import { EmptyState, Screen } from "../../components/Screen";

export default function AgentsScreen() {
  return (
    <Screen title="Agents" subtitle="Tâches en cours, progression, coûts et résultats.">
      <EmptyState title="Aucune tâche" description="Les tâches lancées depuis le chat s'affichent ici." />
    </Screen>
  );
}
