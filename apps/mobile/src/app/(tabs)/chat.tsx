import { EmptyState, Screen } from "../../components/Screen";

export default function ChatScreen() {
  return (
    <Screen title="AI Chat" subtitle="Décris ce que tu veux changer, l'agent propose un plan.">
      <EmptyState
        title="Choisis d'abord un projet"
        description="La conversation s'appuie sur le contexte du projet sélectionné et sur ta propre clé IA."
      />
    </Screen>
  );
}
