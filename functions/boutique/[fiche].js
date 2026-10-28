/* ==========================================================================
   FICHE PRODUIT — une adresse par référence, rendue par le serveur.

   Google Shopping demande une page d'arrivée par article, et sur cette page
   le prix TTC particulier doit être le plus visible, et déclaré dans les
   données structurées de l'en-tête. Un prix pro peut y figurer, à condition
   d'être visuellement secondaire — c'est ce que fait le lien discret vers
   l'espace professionnel, en bas de la fiche.

   Pas de fenêtre d'accueil ici : une fenêtre qui masque le produit est un
   motif de refus. Le choix professionnel / particulier reste à la porte
   d'entrée du site, où Google n'envoie personne.
   ========================================================================== */

import { parSlug, echapper, euros, origine } from "../_boutique.js";
import { ENTETES_SECURITE, CSP_PAGE } from "../_commun.js";
import { REGLES } from "../_calcul_b2c.js";

const DESCRIPTION_MAX = 155;

/* Les données structurées, en JSON-LD.
 *
 * La fiche portait déjà un balisage itemprop, correct mais limité : on ne
 * peut pas y loger proprement une politique de retour ou des frais de port
 * sans alourdir le HTML visible. Et surtout, deux descriptions du même
 * produit sur une même page — l'une en itemprop, l'autre en JSON-LD —
 * risquent d'être lues comme deux produits. Une seule source, donc, et
 * c'est celle que Google préfère.
 *
 * Ce qui a été ajouté au passage, et qui manquait :
 *
 * - priceValidUntil, sans quoi Google signale le prix comme périmé. Fixé
 *   à quatre-vingt-dix jours, recalculé à chaque rendu plutôt qu'écrit en
 *   dur : une date gelée finit toujours par passer.
 * - la politique de retour. Quatorze jours, frais de renvoi à la charge
 *   du client : c'est ce que disent les conditions de vente, et c'est ce
 *   que le balisage doit dire aussi.
 * - les frais de port. On annonce le tarif payant, pas la gratuité au-delà
 *   de 29,90 € : il n'existe pas de propriété fiable pour exprimer un
 *   seuil, et il vaut mieux sous-promettre que l'inverse.
 * - le fil d'Ariane, qui fait apparaître « nishman.be › Boutique › produit »
 *   sous le résultat au lieu de l'adresse brute.
 */
function donneesStructurees(p, base, url, image, nom, desc, dispo) {
  const dans90 = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

  const produit = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: nom,
    description: resume(desc),
    image: [image],
    sku: p.ean,
    gtin13: p.ean,
    brand: { "@type": "Brand", name: "NISHMAN" },
    offers: {
      "@type": "Offer",
      url: url,
      price: Number(p.ttc).toFixed(2),
      priceCurrency: "EUR",
      priceValidUntil: dans90,
      availability: "https://schema.org/" + dispo,
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: "NBD Distribution SRL" },
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: REGLES.pays,
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: 14,
        returnMethod: "https://schema.org/ReturnByMail",
        returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
      },
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: {
          "@type": "MonetaryAmount",
          value: Number(REGLES.port).toFixed(2),
          currency: "EUR",
        },
        shippingDestination: REGLES.pays.map((pays) => ({
          "@type": "DefinedRegion", addressCountry: pays,
        })),
        deliveryTime: {
          "@type": "ShippingDeliveryTime",
          handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 2, unitCode: "DAY" },
          transitTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 5, unitCode: "DAY" },
        },
      },
    },
  };
  if (p.famille) produit.category = p.famille;

  const fil = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Boutique", item: base + "/boutique/" },
      { "@type": "ListItem", position: 2, name: nom, item: url },
    ],
  };

  /* Le chevron fermant doit être neutralisé : « </script> » dans une
     valeur refermerait la balise et le reste de la fiche deviendrait du
     texte. On échappe tous les chevrons ouvrants, ce qui règle la
     question une fois pour toutes. */
  return JSON.stringify([produit, fil]).replace(/</g, "\\u003c");
}

function resume(texte) {
  const t = String(texte || "").replace(/\s+/g, " ").trim();
  if (t.length <= DESCRIPTION_MAX) return t;
  const coupe = t.slice(0, DESCRIPTION_MAX);
  const espace = coupe.lastIndexOf(" ");
  return (espace > 80 ? coupe.slice(0, espace) : coupe).trim() + "…";
}

function page(p, base, indexable) {
  const url = base + "/boutique/" + p.slug + "/";
  const image = base + "/assets/img/products/" + p.image;
  const nom = p.nom_court || p.nom;
  const desc = p.desc_fr || "";
  const dispo = p.bientot ? "PreOrder" : "InStock";

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${echapper(nom)} — NISHMAN</title>
<meta name="description" content="${echapper(resume(desc))}" />
<link rel="canonical" href="${echapper(url)}" />${indexable ? "" : `
<!-- Pas encore indexable : les fiches n'ouvrent à Google qu'une fois le flux,
     la porte d'entrée et le plan du site en place. Interrupteur côté
     Cloudflare : variable INDEXER_BOUTIQUE = oui. -->
<meta name="robots" content="noindex, nofollow" />`}
<meta property="og:type" content="product" />
<meta property="og:site_name" content="Nishman — NBD Distribution Belgium" />
<meta property="og:title" content="${echapper(nom)} — NISHMAN" />
<meta property="og:description" content="${echapper(resume(desc))}" />
<meta property="og:image" content="${echapper(image)}" />
<meta property="og:url" content="${echapper(url)}" />
<meta property="og:locale" content="fr_BE" />
<meta name="twitter:card" content="summary_large_image" />
<meta property="product:price:amount" content="${Number(p.ttc).toFixed(2)}" />
<meta property="product:price:currency" content="EUR" />
<meta property="product:availability" content="${dispo === "InStock" ? "in stock" : "out of stock"}" />
<script type="application/ld+json">${donneesStructurees(p, base, url, image, nom, desc, dispo)}</script>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Manrope:wght@400;600;700&display=swap" />
<link rel="stylesheet" href="/assets/css/boutique.css?v=284" />
<style>
  .fiche-page { max-width: 1040px; margin: 0 auto; padding: 24px 16px 72px;
                display: grid; gap: 32px; grid-template-columns: 1fr; }
  @media (min-width: 820px) { .fiche-page { grid-template-columns: 1fr 1fr; gap: 48px; align-items: start; } }
  .fiche-visuel { background: #f4f1ea; border-radius: 16px; overflow: hidden; }
  .fiche-visuel img { width: 100%; height: auto; display: block; }
  .fiche-fam { text-transform: uppercase; letter-spacing: .08em; font-size: .75rem;
               color: #8a8070; margin-bottom: 8px; }
  .fiche-titre { font-family: "Space Grotesk", system-ui, sans-serif; font-weight: 700;
                 font-size: clamp(1.5rem, 4vw, 2.1rem); line-height: 1.15; margin: 0 0 4px; }
  .fiche-volume { color: #8a8070; margin-bottom: 18px; }
  .fiche-prix { font-family: "Space Grotesk", system-ui, sans-serif; font-weight: 700;
                font-size: 2rem; line-height: 1.1; }
  .fiche-prix-note { font-size: .8rem; color: #8a8070; margin-top: 2px; }
  .fiche-achat { display: flex; gap: 10px; align-items: center; margin: 20px 0 24px; flex-wrap: wrap; }
  .fiche-qte { display: inline-flex; align-items: center; border: 1px solid #ddd6c4;
               border-radius: 10px; overflow: hidden; }
  .fiche-qte button { border: 0; background: none; font: inherit; font-size: 1.1rem;
                      width: 38px; height: 44px; cursor: pointer; }
  .fiche-qte span { min-width: 34px; text-align: center; font-variant-numeric: tabular-nums; }
  .fiche-texte { line-height: 1.65; white-space: pre-line; }
  .fiche-pro { margin-top: 28px; padding-top: 16px; border-top: 1px solid #e6e0d2;
               font-size: .85rem; color: #8a8070; }
  .fiche-pro a { color: #8a8070; }
  .fiche-retour { display: inline-block; margin-bottom: 14px; font-size: .9rem; }
  .fiche-dispo { font-size: .85rem; color: #8a8070; margin-top: 10px; }
</style>
</head>
<body>

<div class="ruban">
  Livraison offerte dès <b>${euros(REGLES.franco)}</b> · Expédition sous 2 jours ouvrables · Belgique, France, Luxembourg
</div>

<header class="bar">
  <div class="wrap bar-in">
    <a class="logo" href="/boutique/" aria-label="Nishman, accueil"><img src="/assets/img/nishman.svg" alt="Nishman" /></a>
    <div class="bar-sp"></div>
    <a class="pill" href="/?pro"><span class="long">Espace professionnel</span><span class="court">Pro</span></a>
    <a class="pill pill-gold" href="/boutique/#panier">Panier</a>
  </div>
</header>

<main class="fiche-page">
  <div class="fiche-visuel">
    <img src="/assets/img/products/${echapper(p.image)}"
         alt="${echapper(p.nom)}" width="900" height="900" />
  </div>

  <div>
    <!-- Les données que Google lit sont désormais en JSON-LD, dans
         l'en-tête. Elles y sont complètes — politique de retour, frais de
         port, fil d'Ariane — là où le balisage itemprop obligeait à les
         faire entrer dans le HTML visible, au prix de blocs cachés qui
         décalaient la mise en page. -->

    <a class="fiche-retour" href="/boutique/">← Toute la boutique</a>
    <div class="fiche-fam">${echapper(p.famille || "")}</div>
    <h1 class="fiche-titre">${echapper(nom)}</h1>
    <div class="fiche-volume">${echapper(p.volume || "")}</div>

    <div>
      <div class="fiche-prix">${euros(p.ttc)}</div>
      <div class="fiche-prix-note">Prix particulier, TVA comprise</div>
    </div>

    ${p.bientot
      ? '<div class="fiche-dispo">Bientôt disponible.</div>'
      : `<div class="fiche-achat">
      <div class="fiche-qte">
        <button type="button" id="moins" aria-label="Retirer un article">−</button>
        <span id="qte">1</span>
        <button type="button" id="plus" aria-label="Ajouter un article">+</button>
      </div>
      <button class="pill pill-gold" id="ajouter" data-ean="${echapper(p.ean)}">Ajouter au panier</button>
      <span class="fiche-dispo" id="ajout-msg" hidden>Ajouté au panier.</span>
    </div>`}

    <div class="fiche-texte">${echapper(desc)}</div>

    <p class="fiche-pro">Vous êtes coiffeur ou barbier ?
      <a href="/?pro">Voir les tarifs professionnels</a> — vente au carton,
      facture et livraison.</p>
  </div>
</main>

<script>
(function () {
  var qte = 1;
  var vue = document.getElementById("qte");
  var bouton = document.getElementById("ajouter");
  if (!bouton) return;
  function afficher() { vue.textContent = qte; }
  document.getElementById("plus").addEventListener("click", function () { qte++; afficher(); });
  document.getElementById("moins").addEventListener("click", function () {
    if (qte > 1) { qte--; afficher(); } });
  bouton.addEventListener("click", function () {
    var ean = bouton.getAttribute("data-ean");
    var panier = {};
    try { panier = JSON.parse(sessionStorage.getItem("nishman-panier") || "{}") || {}; }
    catch (e) { panier = {}; }
    panier[ean] = (panier[ean] || 0) + qte;
    try { sessionStorage.setItem("nishman-panier", JSON.stringify(panier)); } catch (e) {}
    var msg = document.getElementById("ajout-msg");
    if (msg) { msg.hidden = false; msg.textContent = qte + " ajouté" + (qte > 1 ? "s" : "") + " au panier."; }
  });
})();
</script>
<script src="/assets/js/mesure.js?v=278" defer></script>
</body>
</html>`;
}

/* Les adresses de /boutique/ qui ne sont PAS des fiches produit.
 *
 * Cette fonction répond à tout ce qui ressemble à /boutique/quelque-chose/,
 * y compris aux vraies pages posées à côté d'elle. Chez Cloudflare, une
 * fonction passe avant un fichier statique : /boutique/commander/ tombait
 * donc ici, ne correspondait à aucun produit, et repartait vers la
 * boutique. Le tunnel de commande était inatteignable, et rien dans son
 * code ne pouvait le laisser deviner.
 *
 * On rend donc la main au fichier statique pour ces adresses-là. Toute
 * page ajoutée plus tard sous /boutique/ devra figurer dans cette liste —
 * c'est le prix d'une fonction qui attrape un chemin entier.
 */
const PAGES_RESERVEES = new Set(["commander"]);

export async function onRequestGet({ request, params, env }) {
  const demande = String(params.fiche || "").toLowerCase();
  if (PAGES_RESERVEES.has(demande)) {
    // env.ASSETS sert le fichier statique correspondant. S'il manquait, on
    // préfère un 404 franc à une redirection silencieuse vers la boutique :
    // une page qui disparaît sans rien dire est le défaut qu'on vient de
    // corriger.
    if (env && env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Page introuvable.", { status: 404 });
  }

  const base = origine(request);
  let trouve;
  try { trouve = await parSlug(request, params.fiche); }
  catch (e) { return new Response("Boutique momentanément indisponible.", { status: 503 }); }

  if (!trouve) {
    return new Response(null, { status: 302, headers: { location: "/boutique/" } });
  }
  if (!trouve.exact) {
    return new Response(null, {
      status: 301,
      headers: { location: "/boutique/" + trouve.produit.slug + "/" },
    });
  }

  const indexable = String((env && env.INDEXER_BOUTIQUE) || "").trim().toLowerCase() === "oui";

  return new Response(page(trouve.produit, base, indexable), {
    headers: {
      // _headers ne s'applique pas aux pages produites par une fonction.
      ...ENTETES_SECURITE,
      "content-security-policy": CSP_PAGE,
      "content-type": "text/html; charset=utf-8",
      // Un prix doit correspondre au flux Google au centime près : une page
      // gardée une heure en cache afficherait l'ancien prix après une
      // modification, et c'est exactement le motif de refus qu'on cherche à
      // éviter. Le navigateur revérifie à chaque visite, le cache de
      // Cloudflare ne garde la page qu'une minute, et peut servir une version
      // d'au plus dix minutes pendant qu'il la rafraîchit.
      "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=600",
    },
  });
}
