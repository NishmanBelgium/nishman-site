/* ==========================================================================
   LE PLAN DU SITE — ce que Google a le droit de connaître.

   Engendré, pas écrit à la main. Cent vingt-cinq fiches produit changent
   au rythme du catalogue, et un plan recopié devient faux au premier
   produit ajouté — c'est le même défaut que le PDF des conditions
   professionnelles, qui a gardé six mois une adresse périmée parce qu'il
   était tenu séparément.

   Les pages de compte, de devis et de caisse n'y figurent pas : elles
   n'ont rien à faire dans un moteur de recherche, et une page de tunnel
   indexée est une page qui sera visitée hors contexte, panier vide, par
   quelqu'un qui n'a rien demandé.
   ========================================================================== */

import { catalogue, origine } from "./_boutique.js";

/* Les pages fixes, avec l'importance relative qu'on leur donne. La
   fréquence annoncée est indicative : Google s'en sert comme d'un indice,
   pas d'une promesse. */
const PAGES = [
  ["/", 1.0, "weekly"],
  ["/boutique/", 0.9, "daily"],
  ["/produits/", 0.9, "weekly"],
  ["/contact/", 0.6, "monthly"],
  ["/france/", 0.6, "monthly"],
  ["/liens/", 0.4, "monthly"],
  ["/conditions-de-vente/", 0.3, "yearly"],
  ["/retractation/", 0.3, "yearly"],
  ["/mentions-legales/", 0.3, "yearly"],
  ["/confidentialite/", 0.3, "yearly"],
  ["/cgv/", 0.3, "yearly"],
];

function entree(url, priorite, frequence, date) {
  return "  <url>\n"
    + "    <loc>" + url + "</loc>\n"
    + (date ? "    <lastmod>" + date + "</lastmod>\n" : "")
    + "    <changefreq>" + frequence + "</changefreq>\n"
    + "    <priority>" + priorite.toFixed(1) + "</priority>\n"
    + "  </url>\n";
}

export async function onRequestGet({ request }) {
  const base = origine(request);
  const aujourdhui = new Date().toISOString().slice(0, 10);

  let corps = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  for (const [chemin, priorite, frequence] of PAGES) {
    corps += entree(base + chemin, priorite, frequence, aujourdhui);
  }

  /* Les fiches produit. Celles annoncées « bientôt » sont incluses : la
     page existe, elle est honnête sur la disponibilité, et la retirer du
     plan reviendrait à la faire découvrir plus tard que nécessaire. */
  try {
    for (const p of await catalogue(request)) {
      if (!p || !p.slug) continue;
      corps += entree(base + "/boutique/" + p.slug + "/",
                      p.bientot ? 0.5 : 0.8, "weekly", aujourdhui);
    }
  } catch (e) {
    // Catalogue injoignable : mieux vaut un plan des pages fixes qu'aucun
    // plan du tout. Google reviendra.
  }

  corps += "</urlset>\n";

  return new Response(corps, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600",
    },
  });
}

export async function onRequest() {
  return new Response("Méthode non autorisée.", { status: 405 });
}
