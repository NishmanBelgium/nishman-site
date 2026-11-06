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

import { parSlug, catalogue, echapper, euros, origine } from "../_boutique.js";
import { ENTETES_SECURITE, CSP_PAGE } from "../_commun.js";
import { REGLES } from "../_calcul_b2c.js";
import { FAMILLES, ODEURS, slugFamille, pied } from "./famille/[nom].js";

const DESCRIPTION_MAX = 155;
const VOISINS_MAX = 4;

/* Les autres produits de la même famille.
 *
 * Quatre, pas davantage : une fiche sert à décider d'un produit, pas à
 * en proposer douze. Et on prend les voisins immédiats dans l'ordre de
 * la famille plutôt que les quatre premiers, sans quoi toutes les fiches
 * d'une même famille renverraient vers les mêmes quatre têtes de liste.
 *
 * Le tri compte les chiffres comme des nombres. Sans cela « NO:10 » se
 * range entre « NO:1 » et « NO:2 », et la cologne no:12 se retrouve
 * voisine des no:2 et no:3 au lieu des no:11 et no:16. */
function voisins(liste, p) {
  const meme = liste
    .filter((x) => x.famille === p.famille)
    .sort((a, b) => String(a.nom).localeCompare(String(b.nom), "fr", { numeric: true }));
  const i = meme.findIndex((x) => x.ean === p.ean);
  if (i < 0) return meme.slice(0, VOISINS_MAX);
  const avant = meme.slice(0, i);
  const apres = meme.slice(i + 1);
  const pris = [];
  let g = avant.length - 1;
  let d = 0;
  while (pris.length < VOISINS_MAX && (g >= 0 || d < apres.length)) {
    if (d < apres.length) pris.push(apres[d++]);
    if (pris.length < VOISINS_MAX && g >= 0) pris.unshift(avant[g--]);
  }
  return pris;
}

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

/* La charge utile de l'évènement « vue de fiche », prête à être insérée
   dans une balise script. JSON.stringify échappe ce qu'il faut pour du
   JavaScript ; reste à neutraliser la seule séquence qui fermerait la
   balise par surprise. */
function donneesVue(p, nom) {
  return JSON.stringify({
    content_type: "product",
    content_ids: [String(p.ean)],
    content_name: nom,
    value: Number(Number(p.ttc).toFixed(2)),
    currency: "EUR",
  }).replace(/</g, "\\u003c");
}

function page(p, base, indexable, autres) {
  const url = base + "/boutique/" + p.slug + "/";
  const slugFam = slugFamille(p.famille);
  const fam = slugFam ? FAMILLES[slugFam] : null;
  const lienFam = slugFam ? "/boutique/famille/" + slugFam + "/" : "/boutique/";
  const odeur = ODEURS[String(p.ean)];
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
  href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=Manrope:wght@400;500;600;700&display=swap" />
<link rel="stylesheet" href="/assets/css/base.css?v=355" />
<link rel="stylesheet" href="/assets/css/boutique.css?v=354" />
<link rel="stylesheet" href="/assets/css/consentement.css?v=359" />
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
  .fiche-dispo { font-size: .85rem; color: #8a8070; margin-top: 10px; }

  .fiche-fil { font-size: .8rem; color: #8a8070; margin-bottom: 12px; }
  .fiche-fil a { color: #8a8070; text-decoration: none; }
  .fiche-fil a:hover { color: var(--encre); text-decoration: underline; }
  .fiche-fil span { margin: 0 7px; color: #c3bbab; }

  .fiche-odeur { display: flex; gap: 14px; align-items: center; margin-top: 22px;
                 padding: 12px; border-radius: 12px; background: #0b0b0c; }
  .fiche-odeur img { width: 76px; height: 76px; border-radius: 8px; object-fit: cover;
                     flex: 0 0 auto; display: block; }
  .fiche-odeur b { display: block; font-family: var(--titre); font-weight: 700; font-size: .625rem;
                   letter-spacing: .26em; text-transform: uppercase; color: var(--orange);
                   margin-bottom: 5px; }
  .fiche-odeur span { display: block; font-family: var(--titre); font-weight: 800; font-stretch: 86%;
                      font-size: .95rem; line-height: 1.25; text-transform: uppercase; color: #fff; }

  .fiche-suite { border-top: 1px solid var(--gris); padding: var(--e7) 0 var(--e8); }
  .fiche-suite h2 { font-size: var(--t-sous); margin: 0 0 var(--e5); }
  .fiche-voisins { display: grid; gap: var(--e4); grid-template-columns: 1fr 1fr; }
  @media (min-width: 720px) { .fiche-voisins { grid-template-columns: repeat(4, 1fr); } }
  .voisin { display: block; text-decoration: none; color: inherit; }
  .voisin-img { display: grid; place-items: center; aspect-ratio: 1/1; padding: var(--e4);
                background: var(--gris-fond); border-radius: var(--r-objet);
                transition: background .22s ease; }
  .voisin:hover .voisin-img { background: var(--gris-fond-appui); }
  .voisin-img img { max-width: 100%; max-height: 100%; width: auto; height: auto;
                    object-fit: contain; mix-blend-mode: multiply; }
  .voisin-nom { display: block; font-family: var(--titre); font-stretch: 86%; font-weight: 700;
                font-size: .8125rem; line-height: 1.25; margin: var(--e3) 0 2px; }
  .voisin-prix { display: block; font-size: .8125rem; color: var(--encre-douce); }
  .fiche-suite-tout { margin: var(--e5) 0 0; font-size: var(--t-petit); }
  .fiche-suite-tout a { color: var(--orange-fonce); font-weight: 600; }
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
    <a class="pill" href="/"><span class="long">Accueil</span><span class="court">Accueil</span></a>
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

    <!-- Le fil d'Ariane était déclaré à Google depuis le lot 318, mais
         invisible à l'écran : le visiteur arrivé d'une recherche n'avait
         qu'un « ← Toute la boutique » qui le renvoyait aux 125
         références. Il voit maintenant sa famille, et peut y monter. -->
    <nav class="fiche-fil" aria-label="Fil d'Ariane">
      <a href="/boutique/">Boutique</a>
      <span aria-hidden="true">›</span>
      <a href="${echapper(lienFam)}">${echapper(fam ? fam.nom : p.famille || "Catalogue")}</a>
    </nav>
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
${odeur ? `
    <!-- L'inspiration de la fragrance, avec la matière qui la porte.
         C'est le même couple image + mot que sur la page de famille :
         le visiteur qui a cliqué depuis la famille retrouve exactement
         ce qui l'a fait cliquer. -->
    <div class="fiche-odeur">
      <img src="/assets/img/odeurs/${echapper(p.ean)}.webp" alt="" aria-hidden="true"
           width="512" height="512" loading="lazy" decoding="async" />
      <div><b>Inspiré par</b><span>${echapper(odeur)}</span></div>
    </div>` : ""}

    <p class="fiche-pro">Vous êtes coiffeur ou barbier ?
      <a href="/">Le catalogue professionnel passe par l'accueil</a> — vente
      au carton, facture et livraison.</p>
  </div>
</main>
${autres.length ? `
<!-- Les voisins de rayon. Une fiche sans sortie latérale oblige le
     visiteur à revenir en arrière pour comparer, et beaucoup ne
     reviennent pas. -->
<section class="fiche-suite" aria-labelledby="fiche-suite-titre">
  <div class="wrap">
    <h2 id="fiche-suite-titre">Dans la même famille</h2>
    <div class="fiche-voisins">
      ${autres.map((v) => `<a class="voisin" href="/boutique/${echapper(v.slug)}/">
        <span class="voisin-img"><img src="/assets/img/products/${echapper(v.image)}"
              alt="${echapper(v.nom)}" width="600" height="600" loading="lazy" decoding="async" /></span>
        <span class="voisin-nom">${echapper(v.nom_court || v.nom)}</span>
        <span class="voisin-prix">${v.bientot ? "Bientôt disponible" : euros(v.ttc)}</span>
      </a>`).join("\n      ")}
    </div>
    <p class="fiche-suite-tout"><a href="${echapper(lienFam)}">Voir toute la famille ${echapper(fam ? fam.nom : p.famille || "")} →</a></p>
  </div>
</section>` : ""}

${pied()}

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
<script src="/assets/js/mesure.js?v=391" defer></script>
<script src="/assets/js/consentement.js?v=394" defer></script>
<script>
/* La vue de fiche, pour la mesure publicitaire. Elle attend que le
   module de consentement soit chargé — « defer » garantit l'ordre, mais
   pas que le visiteur ait déjà répondu : si ce n'est pas le cas, le
   module ignore l'appel, et c'est exactement ce qu'on veut.

   Les données passent par JSON.stringify et non par echapper() : cette
   dernière protège du HTML, pas du JavaScript. Un nom comme « AQUA
   D'ASIL » en ressortirait avec son apostrophe transformée en entité,
   visible telle quelle dans le rapport Meta. */
window.addEventListener("load", function () {
  if (!window.nishmanConsentement) return;
  window.nishmanConsentement.evenement("ViewContent", ${donneesVue(p, nom)});
});
</script>
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

  /* Les voisins de rayon sont un agrément, pas la fiche. Si le catalogue
     ne répond pas, la fiche sort quand même : un prix et un bouton
     d'achat valent mieux qu'une page d'erreur. */
  let autres = [];
  try { autres = voisins(await catalogue(request), trouve.produit); }
  catch (e) { autres = []; }

  return new Response(page(trouve.produit, base, indexable, autres), {
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
