/* ==========================================================================
   FICHE PRODUIT — une adresse par référence, rendue par le serveur.

   Google Shopping demande une page d'arrivée par article, et sur cette page
   le prix TTC particulier doit être le plus visible, repérable par le
   balisage itemprop="price". Un prix pro peut y figurer, à condition d'être
   visuellement secondaire — c'est ce que fait le lien discret vers l'espace
   professionnel, en bas de la fiche.

   Pas de fenêtre d'accueil ici : une fenêtre qui masque le produit est un
   motif de refus. Le choix professionnel / particulier reste à la porte
   d'entrée du site, où Google n'envoie personne.
   ========================================================================== */

import { parSlug, echapper, euros, origine } from "../_boutique.js";

const DESCRIPTION_MAX = 155;

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
<meta property="og:title" content="${echapper(nom)} — NISHMAN" />
<meta property="og:description" content="${echapper(resume(desc))}" />
<meta property="og:image" content="${echapper(image)}" />
<meta property="og:url" content="${echapper(url)}" />
<meta property="product:price:amount" content="${Number(p.ttc).toFixed(2)}" />
<meta property="product:price:currency" content="EUR" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Manrope:wght@400;600;700&display=swap" />
<link rel="stylesheet" href="/assets/css/boutique.css?v=218" />
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
  Livraison offerte dès <b>49 €</b> · Expédition sous 2 jours ouvrables · Belgique, France, Luxembourg
</div>

<header class="bar">
  <div class="wrap bar-in">
    <a class="logo" href="/boutique/" aria-label="Nishman, accueil"><img src="/assets/img/nishman.svg" alt="Nishman" /></a>
    <div class="bar-sp"></div>
    <a class="pill" href="/"><span class="long">Espace professionnel</span><span class="court">Pro</span></a>
    <a class="pill pill-gold" href="/boutique/#panier">Panier</a>
  </div>
</header>

<main class="fiche-page" itemscope itemtype="https://schema.org/Product">
  <div class="fiche-visuel">
    <img itemprop="image" src="/assets/img/products/${echapper(p.image)}"
         alt="${echapper(p.nom)}" width="900" height="900" />
  </div>

  <div>
    <!-- Les données que Google lit sans qu'elles s'affichent. Elles vivent
         DANS la colonne de texte : posées entre les deux colonnes, le bloc
         « marque » comptait comme une case de la grille et décalait la mise
         en page d'un cran. -->
    <meta itemprop="gtin13" content="${echapper(p.ean)}" />
    <meta itemprop="sku" content="${echapper(p.ean)}" />
    <meta itemprop="category" content="${echapper(p.famille || "")}" />
    <div itemprop="brand" itemscope itemtype="https://schema.org/Brand" hidden>
      <meta itemprop="name" content="NISHMAN" />
    </div>

    <a class="fiche-retour" href="/boutique/">← Toute la boutique</a>
    <div class="fiche-fam">${echapper(p.famille || "")}</div>
    <h1 class="fiche-titre" itemprop="name">${echapper(nom)}</h1>
    <div class="fiche-volume">${echapper(p.volume || "")}</div>

    <div itemprop="offers" itemscope itemtype="https://schema.org/Offer">
      <meta itemprop="priceCurrency" content="EUR" />
      <meta itemprop="url" content="${echapper(url)}" />
      <link itemprop="availability" href="https://schema.org/${dispo}" />
      <link itemprop="itemCondition" href="https://schema.org/NewCondition" />
      <div class="fiche-prix" itemprop="price" content="${Number(p.ttc).toFixed(2)}">${euros(p.ttc)}</div>
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

    <div class="fiche-texte" itemprop="description">${echapper(desc)}</div>

    <p class="fiche-pro">Vous êtes coiffeur ou barbier ?
      <a href="/produits/">Voir les tarifs professionnels</a> — vente au carton,
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
</body>
</html>`;
}

export async function onRequestGet({ request, params, env }) {
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
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=3600",
    },
  });
}
