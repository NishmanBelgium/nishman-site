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

  // Adresse de prévisualisation : rien ne doit être indexé. Ce sont les
  // mêmes pages que le site réel, et deux adresses pour un même contenu
  // valent mieux que rien dans aucune.
  const previsualisation = hote.endsWith(".pages.dev") || hote === "localhost";

  if (previsualisation) {
    return texte([
      "# Adresse de prévisualisation — ne pas indexer.",
      "# Le site public est servi sur nishman.be.",
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
