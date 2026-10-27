/* ==========================================================================
   FLUX GOOGLE — le catalogue grand public tel que Merchant Center le lit.

   Format RSS 2.0 avec l'espace de noms g: de Google. Une seule source : le
   même fichier boutique.json qui compose les fiches produit. C'est
   volontaire — un flux alimenté séparément finit toujours par annoncer un
   prix que la page n'affiche plus, et c'est le refus « prix incohérent ».

   Attributs obligatoires repris de la spécification de Google :
   id, title, description, link, image_link, availability, price, brand.
   condition n'est requis que pour l'occasion ; gtin est fortement
   recommandé quand il existe — et il existe, ce sont vos EAN.
   ========================================================================== */

import { catalogue, echapper, origine } from "./_boutique.js";

const TITRE_MAX = 150;
const DESC_MAX = 5000;

// Le chiffre de contrôle d'un EAN : un code invalide fait refuser l'article.
// Plutôt que d'envoyer un identifiant faux, on l'omet pour cet article-là.
function gtinValide(ean) {
  const e = String(ean || "");
  if (!/^\d+$/.test(e) || ![8, 12, 13, 14].includes(e.length)) return false;
  const corps = e.slice(0, -1).split("").map(Number);
  const somme = corps.reduce((s, d, i) => s + d * (i % 2 ? 3 : 1), 0);
  return (10 - (somme % 10)) % 10 === Number(e.slice(-1));
}

function couper(t, max) {
  const s = String(t || "").replace(/\s+/g, " ").trim();
  return s.length <= max ? s : s.slice(0, max - 1).trim() + "…";
}

function article(p, base) {
  const nom = p.nom_court || p.nom;
  const titre = couper(["NISHMAN", nom, p.volume].filter(Boolean).join(" "), TITRE_MAX);
  const lien = base + "/boutique/" + p.slug + "/";
  const image = base + "/assets/img/products/" + p.image;
  const dispo = p.bientot ? "preorder" : "in_stock";

  const lignes = [
    "<g:id>" + echapper(p.ean) + "</g:id>",
    "<g:title>" + echapper(titre) + "</g:title>",
    "<g:description>" + echapper(couper(p.desc_fr, DESC_MAX)) + "</g:description>",
    "<g:link>" + echapper(lien) + "</g:link>",
    "<g:image_link>" + echapper(image) + "</g:image_link>",
    "<g:availability>" + dispo + "</g:availability>",
    "<g:price>" + Number(p.ttc).toFixed(2) + " EUR</g:price>",
    "<g:brand>NISHMAN</g:brand>",
    "<g:condition>new</g:condition>",
  ];
  if (gtinValide(p.ean)) lignes.push("<g:gtin>" + echapper(p.ean) + "</g:gtin>");
  if (p.famille) lignes.push("<g:product_type>" + echapper(p.famille) + "</g:product_type>");

  return "<item>\n      " + lignes.join("\n      ") + "\n    </item>";
}

export async function onRequestGet({ request }) {
  const base = origine(request);
  let liste;
  try { liste = await catalogue(request); }
  catch (e) { return new Response("Catalogue indisponible.", { status: 503 }); }

  const vendables = liste.filter((p) => p && p.ean && p.ttc > 0);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>NISHMAN — Boutique officielle</title>
    <link>${echapper(base)}/boutique/</link>
    <description>Cires, colognes, poudres et soins barbe NISHMAN. Importateur officiel pour la Belgique, la France et le Luxembourg.</description>
    ${vendables.map((p) => article(p, base)).join("\n    ")}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      // Merchant Center relit le flux une fois par jour : un quart d'heure
      // de cache suffit, et garantit qu'un prix corrigé le matin part dans
      // la lecture du soir.
      "cache-control": "public, max-age=0, s-maxage=900",
    },
  });
}
