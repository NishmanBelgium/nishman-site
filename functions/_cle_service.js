/* ==========================================================================
   LA CLÉ DE SERVICE — comment une machine prouve qu'elle est la nôtre.

   Le veilleur tourne chez Google, hors de Cloudflare, et doit pouvoir
   appeler certaines pages réservées sans session humaine. Il porte pour
   cela un secret dans l'en-tête « x-cle-veilleur », comparé à la variable
   Cloudflare « CLE_VEILLEUR ».

   Deux propriétés comptent, et sont faciles à perdre en réécrivant ceci :

   1. TANT QUE LA VARIABLE N'EXISTE PAS, LA PORTE N'EXISTE PAS. Une clé
      absente, vide ou courte ne vaut pas « accès libre » : elle vaut
      « aucun porteur de clé ». Sans cette règle, oublier le secret sur un
      déploiement ouvrirait les pages réservées à l'internet entier.

   2. LA COMPARAISON NE DOIT PAS FUITER PAR SA DURÉE. Un `===` sort au
      premier caractère différent ; qui mesure le temps de réponse
      devine le secret lettre par lettre. On compare donc toute la
      longueur, quoi qu'il arrive.

   NOTE — api/souffrance.js porte sa propre copie de ces deux fonctions,
   écrite avant ce fichier. Elle n'a pas été remplacée par un import :
   cette page est le seul déclencheur de la ronde de reprise, donc la
   seule alarme de la boutique, et un import de plus n'y vaut pas le
   risque d'y toucher. À fusionner le jour où ce fichier sera touché pour
   une autre raison, pas avant.
   ========================================================================== */

/** Comparaison à durée constante. Faux si l'une des deux est absente. */
export function memeSecret(a, b) {
  const x = String(a || ""), y = String(b || "");
  if (!x || !y || x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

/** Vrai si l'appelant porte la clé de service. Faux si aucune n'est configurée. */
export function cleDeService(request, env) {
  const attendue = String((env && env.CLE_VEILLEUR) || "");
  if (attendue.length < 24) return false;   // absente, ou trop courte pour être sérieuse
  return memeSecret(request.headers.get("x-cle-veilleur"), attendue);
}
