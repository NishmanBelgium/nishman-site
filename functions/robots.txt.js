/* ==========================================================================
   ROBOTS.TXT — servi selon le domaine qui le demande.

   Le site vit aujourd'hui sur une adresse de prévisualisation
   (nishman-site.pages.dev) pendant que nishman.be sert encore l'ancien
   site. Un fichier figé poserait un piège : écrit pour la prévisualisation,
   il bloquerait le vrai site le jour de la bascule ; écrit pour le vrai
   site, il laisserait Google indexer la prévisualisation et créer des pages
   dupliquées.

   On répond donc selon l'hôte appelé. Le jour où nishman.be pointera sur
   cette branche, ce fichier fera ce qu'il faut sans qu'on y touche.
   ========================================================================== */

// Les espaces qui n'ont aucune raison d'être explorés, quel que soit
// l'hôte : comptes, tunnel, documents personnels.
const PRIVE = [
  "/pro/",
  "/commander/",
  "/devis/",
  "/api/",
];

function texte(lignes) {
  return new Response(lignes.join("\n") + "\n", {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}

export function onRequestGet({ request }) {
  let hote = "";
  try { hote = new URL(request.url).hostname.toLowerCase(); } catch (e) {}

  // On raisonne à l'envers depuis le 27 octobre : seul le site public est
  // indexable, tout le reste ne l'est pas. La règle précédente listait les
  // adresses à bloquer, et laissait donc passer celles qu'on n'avait pas
  // prévues — à commencer par nouveau.nishman.be, le sous-domaine d'essai
  // posé sur le vrai domaine. Deux adresses pour le même contenu, et
  // Google choisit lui-même laquelle compter.
  const PUBLIC = ["nishman.be", "www.nishman.be"];
  const previsualisation = PUBLIC.indexOf(hote) === -1;

  if (previsualisation) {
    return texte([
      "# Adresse de travail — ne pas indexer.",
      "# Le site public est servi sur https://nishman.be",
      "User-agent: *",
      "Disallow: /",
    ]);
  }

  return texte([
    "# NBD Distribution SRL — nishman.be",
    "User-agent: *",
    ...PRIVE.map((c) => "Disallow: " + c),
    "",
    "Sitemap: https://" + hote + "/sitemap.xml",
  ]);
}
