/* ==========================================================================
   DÉCEMBRE 2026 — la même règle, côté navigateur.

   POURQUOI CE FICHIER EXISTE EN DOUBLE. Exactement la raison écrite en
   tête de `assets/js/promo-bf.js` : le catalogue boutique a deux lecteurs.
   Le serveur rend les fiches produit, calcule le panier et encaisse ; le
   navigateur télécharge `boutique.json` pour dessiner la grille. Si les
   deux ne remisent pas de la même façon, le client lit un prix et en paie
   un autre.

   LE SERVEUR FAIT FOI. Ce fichier ne sert qu'à l'affichage : même modifié
   depuis la console, le panier est recalculé côté serveur et le paiement
   porte le vrai prix. Et le diagnostic compare les deux — c'est le prix de
   cette duplication, et il est payé.

   TOUTE MODIFICATION ICI DOIT ÊTRE REPORTÉE DANS functions/_promo_decembre.js.

   L'HABILLAGE RÉUTILISE LES CLASSES `bf-*` de `assets/css/promo-bf.css`.
   Elles ne sont pas réservées au Black Friday : seules deux règles de cette
   feuille sont portées par `[data-bf]`, et `[data-dec]` y a été ajouté.
   Dupliquer 150 lignes de CSS pour changer trois mots aurait créé une
   deuxième feuille à maintenir, et une divergence de plus à surveiller.
   ========================================================================== */

(function (w) {
  "use strict";

  var ACTIVE = true;
  var TAUX = 0.20;

  // Bruxelles est à UTC+1 en décembre : minuit ici, 23 h la veille en UTC.
  var DEBUT = Date.UTC(2026, 10, 30, 23, 0, 0);  // 1er déc. 00h00
  var FIN   = Date.UTC(2026, 11, 31, 23, 0, 0);  // 31 déc. 23h59'59

  /* Toute la boutique est éligible — décision de NBD du 27 novembre 2026.
     Pas de liste d'EAN ici, contrairement au Black Friday : une référence
     ajoutée en décembre doit être remisée comme les autres, sinon la
     boutique annonce « −20 % sur tout le site » avec un produit au prix
     plein au milieu. Voir functions/_promo_decembre.js, qui fait foi. */

  /* Prix arrêté par NBD : les coffrets à 35,00 € passent à 30,00 € (un
     prix rond) et non à 28,00 €. Tout autre prix plein suit la règle
     générale, −20 % au centime inférieur. */
  var PRIX_ARRETES = { 3500: 30 };

  function prixRemise(ttc) {
    var arrete = PRIX_ARRETES[Math.round(Number(ttc) * 100)];
    if (arrete !== undefined) return arrete;
    var brut = Number(ttc) * (1 - TAUX);
    return Math.floor(Math.round(brut * 10000) / 100) / 100;
  }

  function remiseActive(t) {
    t = Number(t || Date.now());
    return ACTIVE && t >= DEBUT && t < FIN;
  }

  /* L'habillage suit exactement la remise : pas d'avant-première. */
  function habillageActif(t) { return remiseActive(t); }

  function estEligible() { return true; }

  /* Rend une nouvelle liste, comme côté serveur : remiser en place
     remiserait deux fois si la fonction était rappelée. Une fiche qui
     porte déjà `ttc_plein` est laissée telle quelle — c'est ce qui rend
     l'enchaînement avec le Black Friday inoffensif. */
  function appliquer(produits, t) {
    if (!remiseActive(t)) return produits || [];
    var out = [];
    for (var i = 0; i < (produits || []).length; i++) {
      var p = produits[i];
      if (!p || p.ttc_plein !== undefined || !(Number(p.ttc) > 0)) { out.push(p); continue; }
      var plein = Number(p.ttc);
      var remise = prixRemise(plein);
      if (!(remise > 0) || remise >= plein) { out.push(p); continue; }
      var copie = {};
      for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) copie[k] = p[k];
      copie.ttc = remise;
      copie.ttc_plein = plein;
      /* Le taux réellement obtenu sur CETTE fiche, pas celui de
         l'opération : le badge afficherait sinon « −20 % » sur un coffret
         remisé de 14 %. Voir functions/_promo_decembre.js. */
      copie.promo = (plein - remise) / plein;
      out.push(copie);
    }
    return out;
  }

  /* ── L'HABILLAGE ────────────────────────────────────────────────────────
   *
   * Posé par le script plutôt qu'écrit dans chaque page : la boutique, les
   * seize pages de famille et les 125 fiches produit le reçoivent d'un
   * seul endroit, et le 31 décembre il disparaît de toutes d'un coup.
   *
   * La cible est la page des coffrets : ce sont eux que NBD met en avant
   * ce mois-ci. Ils sont partis à 64 pièces en novembre sans aucune
   * publicité, et à 30 € ronds ils sont le cadeau tout fait de décembre.
   */
  var CIBLE = "/boutique/famille/coffrets/";
  var DATES = "Du 1er au 31 décembre 2026";
  var LIBELLE = "sur toute la boutique Nishman";

  if (habillageActif()) {
    try { document.documentElement.setAttribute("data-dec", "1"); } catch (e) { /* sans importance */ }
  }

  function ticker(classe) {
    var t = "DÉCEMBRE   −20 % SUR TOUT LE SITE   ";
    return '<div class="bf-ticker ' + classe + '" aria-hidden="true">' +
      new Array(7).join(t) + "</div>";
  }

  /* Le même garde-fou que pour le Black Friday : une bannière déjà posée
     n'est jamais doublée. Les deux opérations ne se chevauchent pas, mais
     les deux scripts visent le même emplacement. */
  function dejaPose(selecteur) { return !!document.querySelector(selecteur); }

  function banniere() {
    var s = document.createElement("section");
    s.className = "bf-banniere";
    s.setAttribute("aria-label", "Offre de décembre");
    s.innerHTML =
      ticker("bf-ticker-haut") +
      '<h2>Offre de <span class="bf-or">Décembre</span></h2>' +
      '<div class="bf-taux">−20<sup>%</sup></div>' +
      '<p class="bf-sous">' + LIBELLE + "</p>" +
      '<p class="bf-dates">' + DATES + "</p>" +
      '<a class="bf-bouton" href="' + CIBLE + '">Les coffrets à 30 €</a>' +
      '<p class="bf-livraison">Toute la gamme · Livraison offerte dès 29,90 €</p>' +
      ticker("bf-ticker-bas");
    return s;
  }

  /* Le pop-up ne revient pas à chaque page : on note sa fermeture et on
   * laisse passer 24 heures. Clé distincte de celle du Black Friday, pour
   * que quelqu'un qui avait fermé l'offre de novembre voie celle-ci.
   *
   * Le stockage peut être refusé (navigation privée, cookies bloqués) :
   * dans ce cas on n'affiche rien plutôt qu'à chaque page. */
  var CLE = "dec2026-vu";
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
    d.setAttribute("aria-label", "Offre de décembre");
    d.innerHTML =
      '<div class="bf-pop-carte">' +
        ticker("bf-ticker-haut") +
        '<button class="bf-pop-fermer" type="button" aria-label="Fermer">×</button>' +
        '<h2>Offre de <span class="bf-or">Décembre</span></h2>' +
        '<div class="bf-taux">−20<sup>%</sup></div>' +
        '<p class="bf-sous">' + LIBELLE + "</p>" +
        '<p class="bf-dates">' + DATES + "</p>" +
        '<a class="bf-bouton" href="' + CIBLE + '">Les coffrets à 30 €</a>' +
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
    if (main && !dejaPose(".bf-banniere")) {
      main.insertBefore(banniere(), main.firstChild);
    }
    if (!dejaVu() && !dejaPose(".bf-pop")) {
      document.body.appendChild(popup());
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", habiller);
  } else {
    habiller();
  }

  w.PROMO_DECEMBRE = {
    ACTIVE: ACTIVE,
    TAUX: TAUX,
    habillageActif: habillageActif,
    remiseActive: remiseActive,
    estEligible: estEligible,
    appliquer: appliquer,
    prixRemise: prixRemise
  };
})(window);
