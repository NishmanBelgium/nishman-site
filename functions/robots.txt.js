/* ==========================================================================
   ROBOTS.TXT — servi, pas déposé.

   Un fichier statique dirait la même chose à tout le monde. Or le site
   vit à deux adresses : nishman.be, qui doit être référencé, et l'adresse
   de préproduction, qui ne doit jamais l'être. Un jour où l'autre,
   quelqu'un publie un lien vers la préproduction, Google le suit, et le
   site se retrouve indexé deux fois — ce que Google traite comme du
   contenu dupliqué et qu'il faut ensuite des mois à défaire.

   D'où cette règle, qui ne dépend d'aucune variable à ne pas oublier :
   seul le domaine public s'ouvre aux robots. Tout le reste se ferme.
   ========================================================================== */

/* Les domaines qui ont le droit d'être référencés. Tout autre hôte —
   préproduction, adresse .pages.dev, prévisualisation d'une branche —
   est fermé. */
const PUBLICS = new Set(["nishman.be", "www.nishman.be"]);

/* Ce qui n'a rien à faire dans un moteur de recherche : les espaces
   personnels, les tunnels de commande et les points d'entrée techniques.
   Une page de caisse indexée, c'est un visiteur qui arrive panier vide
   sur un formulaire qu'il n'a pas demandé. */
const INTERDITS = [
  "/pro/",
  "/devis/",
  "/commander/",
  "/boutique/commander/",
  "/api/",
];

export async function onRequestGet({ request }) {
  const hote = new URL(request.url).hostname.toLowerCase();
  const ouvert = PUBLICS.has(hote);

  let corps;
  if (!ouvert) {
    corps = "# Adresse de préproduction : rien à indexer ici.\n"
          + "# Le site public est https://nishman.be/\n"
          + "User-agent: *\n"
          + "Disallow: /\n";
  } else {
    corps = "# nishman.be — NBD Distribution SRL\n"
          + "# Importateur officiel NISHMAN pour la Belgique, la France et le Luxembourg.\n"
          + "\n"
          + "User-agent: *\n"
          + INTERDITS.map((c) => "Disallow: " + c + "\n").join("")
          + "Allow: /\n"
          + "\n"
          + "Sitemap: https://nishman.be/sitemap.xml\n";
  }

  return new Response(corps, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=300",
    },
  });
}

export async function onRequest() {
  return new Response("Méthode non autorisée.", { status: 405 });
}
