import { Redirect } from "expo-router";

/**
 * Page de retour de la connexion GitHub. Sur iPhone, la session d'authentification
 * intercepte l'adresse avant ; sur le web, maybeCompleteAuthSession (dans session.tsx)
 * transmet le résultat à la fenêtre d'origine. Dans tous les cas, on revient à l'accueil.
 */
export default function AuthReturn() {
  return <Redirect href="/" />;
}
