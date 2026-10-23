/** Lance l'exécution d'une demande en arrière-plan, hors de la requête HTTP qui l'a créée. */
export interface RunDispatcher {
  dispatch(runId: string): Promise<void>;
}
