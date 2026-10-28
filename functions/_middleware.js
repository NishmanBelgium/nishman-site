/* ==========================================================================
   UNE SEULE ADRESSE

   Le site a vécu quelque temps à deux adresses : nishman.be, qui servait
   l'ancien site, et nouveau.nishman.be, qui servait celui-ci. Depuis la
   bascule, les deux pointent vers le même contenu — et c'est précisément
   ce qu'il ne faut pas laisser durer.

   Deux adresses pour un même site, Google appelle cela du contenu
   dupliqué. Il en choisit une, parfois la mauvaise, répartit la
   réputation entre les deux, et il faut des mois pour défaire ce que
   quelques semaines ont installé. Les balises canoniques désignent déjà
   nishman.be, mais une canonique est un conseil ; une redirection est
   une règle.

   Toute adresse autre que nishman.be renvoie donc ici, définitivement,
   vers nishman.be — en gardant le chemin et les paramètres, pour qu'un
   lien partagé vers une fiche produit tombe sur la bonne fiche et non
   sur l'accueil.

   Les adresses de prévisualisation (*.pages.dev) sont épargnées : elles
   servent à regarder un déploiement avant qu'il ne parte, et les
   rediriger reviendrait à les supprimer.
   ========================================================================== */

const CANONIQUE = "nishman.be";

function aLaisser(hote) {
  return hote === CANONIQUE
    || hote.endsWith(".pages.dev")      // prévisualisation d'un déploiement
    || hote === "localhost"
    || hote.startsWith("127.0.0.1");
}

export async function onRequest(contexte) {
  const url = new URL(contexte.request.url);
  const hote = url.hostname.toLowerCase();

  if (!aLaisser(hote)) {
    url.hostname = CANONIQUE;
    url.protocol = "https:";
    url.port = "";
    /* 301 et non 302 : on veut que les moteurs transfèrent la
     * réputation de l'ancienne adresse vers la nouvelle, ce qu'une
     * redirection temporaire ne fait pas. */
    return Response.redirect(url.toString(), 301);
  }

  return contexte.next();
}
