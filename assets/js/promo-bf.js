/* ==========================================================================
   BLACK FRIDAY 2026 — la même règle, côté navigateur.

   POURQUOI CE FICHIER EXISTE EN DOUBLE. Le catalogue boutique a deux
   lecteurs : le serveur, qui rend les fiches produit et calcule le panier
   et le paiement, et le navigateur, qui télécharge boutique.json pour
   dessiner la grille et le panier affiché. Si les deux ne remisent pas de
   la même façon, le client lit un prix et en paie un autre.

   La parade est celle que le site emploie déjà pour l'offre de salon
   (assets/js/offre.js et api/devis.js) : la règle est écrite deux fois, et
   LE SERVEUR FAIT FOI. Ce fichier-ci ne sert qu'à l'affichage. Même si on
   le modifiait depuis la console du navigateur, le panier serait recalculé
   côté serveur et le paiement porterait le vrai prix.

   Et pour que la double écriture ne dérive jamais en silence, le
   diagnostic compare les deux et le signale. C'est le prix à payer pour
   cette duplication, et il est payé.

   TOUTE MODIFICATION ICI DOIT ÊTRE REPORTÉE DANS functions/_promo_bf.js.
   ========================================================================== */

(function (w) {
  "use strict";

  var ACTIVE = true;
  var TAUX = 0.35;

  // Bruxelles est à UTC+1 en novembre : minuit ici, 23 h la veille en UTC.
  var HABILLAGE_DEBUT = Date.UTC(2026, 10, 9, 23, 0, 0);   // 10 nov. 00h00
  var REMISE_DEBUT    = Date.UTC(2026, 10, 9, 23, 0, 0);   // 10 nov. 00h00 (avancé par NBD)
  var FIN             = Date.UTC(2026, 10, 30, 23, 0, 0);  // 30 nov. 23h59'59

  var ELIGIBLES = [
    "8682035088004", "8682035088134", "8682035088141", "8682035082736",
    "8682035082002", "8682035080176", "8682035083696", "8682035083702",
    "8682035083719", "8682035083726", "8682035083733", "8682035083740",
    "8682035084556", "8684736674883", "8684736674890", "8684736674906",
    "8684736674913", "8684736674920", "8684736674937", "8684736676047"
  ];

  /* Au centime INFÉRIEUR, pour que la remise soit toujours d'au moins
     35 % : 9,90 × 0,65 = 6,435 et l'arrondi habituel donnerait 6,44, soit
     34,95 % seulement. Voir functions/_promo_bf.js, qui fait foi. */
  function prixRemise(ttc) {
    var brut = Number(ttc) * (1 - TAUX);
    return Math.floor(Math.round(brut * 10000) / 100) / 100;
  }

  function habillageActif(t) {
    t = Number(t || Date.now());
    return ACTIVE && t >= HABILLAGE_DEBUT && t < FIN;
  }

  function remiseActive(t) {
    t = Number(t || Date.now());
    return ACTIVE && t >= REMISE_DEBUT && t < FIN;
  }

  function estEligible(ean) {
    return ELIGIBLES.indexOf(String(ean || "")) !== -1;
  }

  /* Rend une nouvelle liste, comme côté serveur : remiser en place
     remiserait deux fois si la fonction était rappelée. */
  function appliquer(produits, t) {
    if (!remiseActive(t)) return produits || [];
    var out = [];
    for (var i = 0; i < (produits || []).length; i++) {
      var p = produits[i];
      if (!p || !estEligible(p.ean) || !(Number(p.ttc) > 0)) { out.push(p); continue; }
      var plein = Number(p.ttc);
      var copie = {};
      for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) copie[k] = p[k];
      copie.ttc = prixRemise(plein);
      copie.ttc_plein = plein;
      copie.promo = TAUX;
      out.push(copie);
    }
    return out;
  }

  /* ── L'HABILLAGE ────────────────────────────────────────────────────────
   *
   * Posé par le script plutôt qu'écrit dans chaque page : la boutique, les
   * cinq pages de famille et les 125 fiches produit le reçoivent alors
   * d'un seul endroit, et le 30 novembre il disparaît des trois d'un coup.
   *
   * L'attribut est posé tout de suite, avant le premier rendu, pour que la
   * page ne s'affiche pas une fraction de seconde en version normale.
   */
  var CIBLE = "/boutique/famille/colognes/";
  var DATES = "Du 10 au 30 novembre 2026";
  var LIBELLE = "sur toutes les eaux de Cologne Nishman";

  if (habillageActif()) {
    try { document.documentElement.setAttribute("data-bf", "1"); } catch (e) { /* sans importance */ }
  }

  function ticker(classe) {
    var t = "BLACK FRIDAY   −35 % COLOGNE   ";
    return '<div class="bf-ticker ' + classe + '" aria-hidden="true">' +
      new Array(7).join(t) + "</div>";
  }

  function banniere() {
    var s = document.createElement("section");
    s.className = "bf-banniere";
    s.setAttribute("aria-label", "Offre Black Friday");
    s.innerHTML =
      ticker("bf-ticker-haut") +
      '<h2>Black <span class="bf-or">Friday</span></h2>' +
      '<div class="bf-taux">−35<sup>%</sup></div>' +
      '<p class="bf-sous">' + LIBELLE + "</p>" +
      '<p class="bf-dates">' + DATES + "</p>" +
      '<a class="bf-bouton" href="' + CIBLE + '">Découvrir l’offre</a>' +
      '<p class="bf-livraison">Toute la gamme · Livraison offerte dès 29,90 €</p>' +
      ticker("bf-ticker-bas");
    return s;
  }

  /* Le pop-up ne revient pas à chaque page. On note sa fermeture et on
   * laisse passer 24 heures — assez pour ne pas harceler, assez peu pour
   * que quelqu'un revenu une semaine plus tard revoie l'offre.
   *
   * Le stockage peut être refusé (navigation privée, cookies bloqués) :
   * dans ce cas on n'affiche rien plutôt que d'afficher à chaque page. */
  var CLE = "bf2026-vu";
  var REPOS = 24 * 60 * 60 * 1000;

  function dejaVu() {
    try {
      var v = Number(w.localStorage.getItem(CLE));
      return !!(v && Date.now() - v < REPOS);
    } catch (e) { return false; }
  }

  function noterVu() {
    try { w.localStorage.setItem(CLE, String(Date.now())); } catch (e) { /* tant pis */ }
  }

  function popup() {
    var d = document.createElement("div");
    d.className = "bf-pop";
    d.setAttribute("role", "dialog");
    d.setAttribute("aria-modal", "true");
    d.setAttribute("aria-label", "Offre Black Friday");
    d.innerHTML =
      '<div class="bf-pop-carte">' +
        ticker("bf-ticker-haut") +
        '<button class="bf-pop-fermer" type="button" aria-label="Fermer">×</button>' +
        '<h2>Black <span class="bf-or">Friday</span></h2>' +
        '<div class="bf-taux">−35<sup>%</sup></div>' +
        '<p class="bf-sous">' + LIBELLE + "</p>" +
        '<p class="bf-dates">' + DATES + "</p>" +
        '<a class="bf-bouton" href="' + CIBLE + '">Découvrir l’offre</a>' +
      "</div>";

    function fermer() { noterVu(); if (d.parentNode) d.parentNode.removeChild(d); }
    d.querySelector(".bf-pop-fermer").addEventListener("click", fermer);
    d.querySelector(".bf-bouton").addEventListener("click", noterVu);
    // Un clic à côté ferme aussi, et la touche Échap : un pop-up dont on
    // ne sort qu'en visant une croix de 40 px est un pop-up subi.
    d.addEventListener("click", function (e) { if (e.target === d) fermer(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" || e.key === "Esc") fermer();
    });
    return d;
  }

  function habiller() {
    if (!habillageActif()) return;
    var main = document.querySelector("main");
    if (main && !document.querySelector(".bf-banniere")) {
      main.insertBefore(banniere(), main.firstChild);
    }
    if (!dejaVu() && !document.querySelector(".bf-pop")) {
      document.body.appendChild(popup());
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", habiller);
  } else {
    habiller();
  }

  w.PROMO_BF = {
    ACTIVE: ACTIVE,
    TAUX: TAUX,
    ELIGIBLES: ELIGIBLES,
    habillageActif: habillageActif,
    remiseActive: remiseActive,
    estEligible: estEligible,
    appliquer: appliquer,
    prixRemise: prixRemise
  };
})(window);
