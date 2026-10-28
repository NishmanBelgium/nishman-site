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

// Les pays servis, et ce que coûte le port chez chacun. On annonce le
// tarif plein : Merchant Center ne sait pas exprimer « offert au-delà de
// 29,90 € », et annoncer moins que la réalité est un motif de sanction.
// Promettre 4,95 € puis livrer gratuitement ne déçoit personne.
const PAYS = ["BE", "FR", "LU"];
const PORT = "4.95 EUR";

/* Catégories Google, relevées dans la taxonomie officielle
   (taxonomy-with-ids). Une catégorie fausse classe mal l'article ;
   l'absence de catégorie laisse Google deviner. On ne renseigne donc
   que ce dont on est sûr. */
const CAT_FAMILLE = {
  "Mat Wax": 1901,                      // Hair Care > Hair Styling Products
  "Aqua Wax": 1901,
  "Spider": 1901,
  "Gels & Mousses": 1901,
  "Poudres coiffantes": 1901,
  "Crèmes coiffantes": 1901,
  "Pommades & Brillantine": 1901,
  "Colognes": 529,                      // Shaving & Grooming > Aftershave
  "Cream Cologne": 529,
  "Rasage": 528,                        // Shaving & Grooming
  "Soins barbe": 528,
  "Shampoings & Après-shampoings": 2441, // Hair Care > Shampoo & Conditioner
  "Coloration": 2814,                   // Hair Care > Hair Color
  "Crème & Bien-être": 567,             // Cosmetics > Skin Care
  "Coffrets": 473,                      // Cosmetics
};

// Quelques articles ne suivent pas leur famille : une eau de cologne
// n'est pas un après-rasage, une crème pour boucles n'est pas un soin
// du visage, et les consommables de salon n'ont rien de cosmétique.
const CAT_NOM = [
  [/EAU DE COLOGNE|^PARFUM /i, 479],    // Cosmetics > Perfume & Cologne
  [/BOUCLES|CHEVEUX/i, 486],            // Hair Care
  [/CIRE DURE|EASY WAX/i, 4508],        // Shaving & Grooming > Hair Removal > Depilatories
  [/SPATULES/i, 4507],                  // Shaving & Grooming > Hair Removal
  [/NETTOYANT TONDEUSE/i, 6842],        // Hair Clipper & Trimmer Accessories
];

function categorie(p) {
  const nom = String(p.nom_court || p.nom || "");
  for (const [motif, id] of CAT_NOM) if (motif.test(nom)) return id;
  return CAT_FAMILLE[p.famille] || 0;
}

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

  const lignes = [
    "<g:id>" + echapper(p.ean) + "</g:id>",
    "<g:title>" + echapper(titre) + "</g:title>",
    "<g:description>" + echapper(couper(p.desc_fr, DESC_MAX)) + "</g:description>",
    "<g:link>" + echapper(lien) + "</g:link>",
    "<g:image_link>" + echapper(image) + "</g:image_link>",
    "<g:availability>in_stock</g:availability>",
    "<g:price>" + Number(p.ttc).toFixed(2) + " EUR</g:price>",
    "<g:brand>NISHMAN</g:brand>",
    "<g:condition>new</g:condition>",
  ];
  if (gtinValide(p.ean)) lignes.push("<g:gtin>" + echapper(p.ean) + "</g:gtin>");
  if (p.famille) lignes.push("<g:product_type>" + echapper(p.famille) + "</g:product_type>");

  const cat = categorie(p);
  if (cat) lignes.push("<g:google_product_category>" + cat + "</g:google_product_category>");

  for (const pays of PAYS) {
    lignes.push(
      "<g:shipping>\n        <g:country>" + pays + "</g:country>" +
      "\n        <g:service>Point relais</g:service>" +
      "\n        <g:price>" + PORT + "</g:price>\n      </g:shipping>"
    );
  }

  return "<item>\n      " + lignes.join("\n      ") + "\n    </item>";
}

export async function onRequestGet({ request }) {
  const base = origine(request);
  let liste;
  try { liste = await catalogue(request); }
  catch (e) { return new Response("Catalogue indisponible.", { status: 503 }); }

  // Un article « bientôt » ne peut pas être mis au panier : le site le
  // refuse. L'annoncer enverrait l'acheteur sur une page où il ne peut
  // rien faire — et « preorder » sans date de mise en vente est de toute
  // façon refusé par Merchant Center. Il reste visible sur la boutique ;
  // il n'entre dans le flux que le jour où on peut l'acheter.
  const vendables = liste.filter((p) => p && p.ean && p.ttc > 0 && !p.bientot);

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
