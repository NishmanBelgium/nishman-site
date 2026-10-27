/* ==========================================================================
   PLAN DU SITE — ce que Google a le droit d'indexer, et rien d'autre.

   robots.txt annonçait un sitemap.xml qui n'existait pas : Search Console
   signale ce renvoi mort à chaque lecture.

   Règle tenue ici : une adresse ne figure au plan que si elle est
   réellement indexable. Lister une page porteuse de « noindex » n'avance à
   rien et fait remonter un avertissement « page exclue par noindex »
   semaine après semaine. Les fiches produit n'apparaissent donc qu'une
   fois l'interrupteur INDEXER_BOUTIQUE posé sur « oui ».
   ========================================================================== */

import { catalogue, echapper, origine } from "./_boutique.js";

function url(adresse, priorite, frequence) {
  return "  <url>\n    <loc>" + echapper(adresse) + "</loc>\n"
       + "    <changefreq>" + frequence + "</changefreq>\n"
       + "    <priority>" + priorite + "</priority>\n  </url>";
}

export async function onRequestGet({ request, env }) {
  const base = origine(request);
  const indexable = String((env && env.INDEXER_BOUTIQUE) || "").trim().toLowerCase() === "oui";

  const adresses = [url(base + "/", "1.0", "weekly")];

  if (indexable) {
    adresses.push(url(base + "/boutique/", "0.9", "daily"));
    try {
      const liste = await catalogue(request);
      for (const p of liste) {
        if (!p || !p.slug) continue;
        adresses.push(url(base + "/boutique/" + p.slug + "/", "0.8", "weekly"));
      }
    } catch (e) {
      // Catalogue injoignable : on rend un plan réduit plutôt qu'une erreur.
      // Un sitemap partiel se rattrape à la lecture suivante, pas un 503.
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${adresses.join("\n")}
</urlset>
`;

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=900",
    },
  });
}
