/* ==========================================================================
   NISHMAN — offre de salon
   Un carton d'Aqua Wax offert par tranche de 500 EUR HT.
   Tout est pilote ici : dates, pack declencheur, textes, et ou l'offre s'affiche.
     active  : false retire tout, sans toucher au reste du site.
     debut   : avant cette date, rien ne s'affiche.
     fin     : apres cette date, tout s'eteint tout seul.
     partout : true  = visible par tous les visiteurs du site.
               false = visible uniquement si l'adresse porte ?mcb
                       (ex. nishman.be/devis/?mcb) — le stand voit l'offre,
                       le grand public ne la voit pas.
   ========================================================================== */
(function () {
  "use strict";

  var OFFRE = {
    active: true,
    debut: new Date(2026, 9, 9, 0, 0, 0),   // 9 octobre 2026 — avance d'un jour pour les tests avant salon
    fin: new Date(2026, 9, 13, 0, 0, 0),    // 13 octobre 2026, 00h00 — le 12 est donc inclus en entier
    partout: false,                          // true pour l'ouvrir a tout le site
    // Le cadeau se declenche a l'ACHAT DU PACK, pas sur un montant.
    // Collez ici le code-barres de la fiche "PACK MCB PARIS" des qu'elle existe.
    packEan: "NISH-PACK-MCB",
    packNom: "Pack MCB Paris",
    cadeau: "1 carton d'Aqua Wax 48 pcs offert",
    // Fiche Odoo du cadeau : c'est cette reference que le script ajoute
    // au devis, a 0 EUR, une ligne par palier atteint.
    ean: "NISH-OFFERT-AW",
    nom: "AQUA WAX ASSORTI — OFFERT",
    pieces: 48,
  };

  // L'offre est-elle ouverte sur cette page ?
  // Hors "partout", il faut ?mcb dans l'adresse. Une fois vu, on le retient
  // pour la session : la tablette du stand garde l'offre en naviguant.
  function ouverte() {
    if (OFFRE.partout) return true;
    try {
      if (location.search.indexOf("mcb") !== -1) {
        sessionStorage.setItem("offre-mcb", "1");
        return true;
      }
      return sessionStorage.getItem("offre-mcb") === "1";
    } catch (e) {
      return location.search.indexOf("mcb") !== -1;
    }
  }

  // Nombre de cartons offerts : un par Pack MCB Paris achete.
  // Recoit les lignes du devis (page devis) ou un nombre de packs (catalogue).
  window.offreCartons = function (lignes) {
    if (!encore()) return 0;
    if (typeof lignes === "number") return lignes > 0 ? lignes : 0;
    if (!lignes || !lignes.length) return 0;
    var n = 0;
    lignes.forEach(function (l) {
      if (String(l.ean) === String(OFFRE.packEan)) n += Number(l.pieces) || 0;
    });
    return n;
  };
  window.offrePackEan = function () { return OFFRE.packEan; };
  // Vrai quand l'offre est ouverte sur cette page : le catalogue s'en sert
  // pour n'afficher le Pack MCB qu'au stand.
  window.offreDispo = function () { return encore(); };
  window.offreCadeau = function () {
    return { ean: OFFRE.ean, nom: OFFRE.nom, pieces: OFFRE.pieces };
  };

  var T = {
    fr: { titre: "Offre MCB Paris — 1 carton d'Aqua Wax 48 pcs offert avec le Pack",
          reste: "Plus que ", fini: "Offre terminée",
          debloque: " débloqué",
          debloques: " débloqués",
          j: "j", cartons: "{n} cartons d'Aqua Wax offerts",
          sur: "OFFRE MCB PARIS", parTranche: "\u00e0 l\u2019achat du Pack MCB Paris", avecPack: "Ajout\u00e9 automatiquement \u00e0 votre devis",
          cta: "J\u2019en profite", uJours: "jours", uHeures: "heures" },
    en: { titre: "MCB Paris offer — 1 free carton of Aqua Wax, 48 pcs, with the Pack",
          reste: "Only ", fini: "Offer ended",
          debloque: " unlocked",
          debloques: " unlocked",
          j: "d", cartons: "{n} free cartons of Aqua Wax",
          sur: "MCB PARIS OFFER", parTranche: "with the MCB Paris Pack", avecPack: "Added to your quote automatically",
          cta: "Shop now", uJours: "days", uHeures: "hours" },
    nl: { titre: "MCB Paris-actie — 1 gratis doos Aqua Wax 48 st. bij het Pack",
          reste: "Nog ", fini: "Actie afgelopen",
          debloque: " vrijgespeeld",
          debloques: " vrijgespeeld",
          j: "d", cartons: "{n} gratis dozen Aqua Wax",
          sur: "MCB PARIS", parTranche: "bij aankoop van het MCB Paris Pack", avecPack: "Automatisch aan uw offerte toegevoegd",
          cta: "Ik profiteer ervan", uJours: "dagen", uHeures: "uur" },
    de: { titre: "MCB Paris — 1 Karton Aqua Wax 48 Stk. gratis zum Pack",
          reste: "Nur noch ", fini: "Aktion beendet",
          debloque: " freigeschaltet",
          debloques: " freigeschaltet",
          j: "T", cartons: "{n} Kartons Aqua Wax gratis",
          sur: "MCB PARIS", parTranche: "beim Kauf des MCB Paris Pack", avecPack: "Automatisch im Angebot erg\u00e4nzt",
          cta: "Jetzt nutzen", uJours: "Tage", uHeures: "Std" },
    tr: { titre: "MCB Paris — Pack ile 48 adetlik 1 koli Aqua Wax hediye",
          reste: "Sadece ", fini: "Kampanya sona erdi",
          debloque: " kazanıldı",
          debloques: " kazanıldı",
          j: "g", cartons: "{n} koli Aqua Wax hediye",
          sur: "MCB PARIS", parTranche: "MCB Paris Pack al\u0131m\u0131nda", avecPack: "Teklifinize otomatik eklendi",
          cta: "Hemen yararlan", uJours: "gün", uHeures: "saat" },
  };

  function langue() {
    var l = (document.documentElement.lang || "fr").slice(0, 2).toLowerCase();
    return T[l] ? l : "fr";
  }
  var t = T[langue()];

  function euros(n) {
    return n.toLocaleString("fr-BE", { minimumFractionDigits: 0,
      maximumFractionDigits: 0 }) + " €";
  }
  function deux(n) { return n < 10 ? "0" + n : "" + n; }
  function encore() {
    var t = Date.now();
    return OFFRE.active && t >= OFFRE.debut && (OFFRE.fin - t) > 0 && ouverte();
  }

  /* ---------- bandeau ---------- */
  function bandeau() {
    if (!encore()) return;
    var hotes = document.querySelectorAll("[data-offre-flash]");
    if (!hotes.length) return;
    Array.prototype.forEach.call(hotes, function (hote) {
      hote.innerHTML =
        '<div class="offre-bandeau">' +
          '<span class="offre-titre">' + t.titre + '</span>' +
          '<span class="offre-timer"></span>' +
        '</div>';
    });
    battre();
    setInterval(battre, 1000);
  }

  function battre() {
    var r = OFFRE.fin - Date.now();
    var cibles = document.querySelectorAll(".offre-timer");
    if (!cibles.length) return;
    var txt;
    if (r <= 0) {
      txt = t.fini;
      Array.prototype.forEach.call(document.querySelectorAll(".offre-bandeau"),
        function (b) { b.parentNode.innerHTML = ""; });
    } else {
      var j = Math.floor(r / 86400000);
      var h = Math.floor(r / 3600000) % 24;
      var m = Math.floor(r / 60000) % 60;
      var s = Math.floor(r / 1000) % 60;
      txt = t.reste + (j > 0 ? j + " " + t.j + " " : "") +
            deux(h) + ":" + deux(m) + ":" + deux(s);
    }
    Array.prototype.forEach.call(cibles, function (c) {
      c.textContent = txt;
      c.classList.toggle("offre-urgent", r > 0 && r < 86400000);
    });
  }

  /* ---------- confirmation sur la page devis ---------- */
  // Recoit le nombre de packs au panier. Zero = on n'affiche rien.
  window.offreMaj = function (packs) {
    var bloc = document.getElementById("offre-progres");
    if (!bloc) return;
    packs = Number(packs) || 0;
    if (!encore() || packs <= 0) { bloc.hidden = true; return; }
    bloc.hidden = false;

    var barre = bloc.querySelector(".offre-barre span");
    var ligne = bloc.querySelector(".offre-ligne");
    var sous = bloc.querySelector(".offre-sous");

    barre.style.width = "100%";
    barre.className = "offre-plein";
    ligne.className = "offre-ligne offre-ok";
    ligne.textContent = packs === 1
      ? OFFRE.cadeau + t.debloque
      : t.cartons.replace("{n}", packs) + t.debloques;
    sous.textContent = t.avecPack || "";
  };

  /* ---------- pop-up d'arrivee (catalogue uniquement) ---------- */
  function popup() {
    if (!encore()) return;
    if (!document.querySelector("[data-offre-popup]")) return;
    var fond = document.createElement("div");
    fond.className = "offre-modal";
    fond.innerHTML =
      '<div class="offre-carte" role="dialog" aria-modal="true" aria-label="' + t.titre + '">' +
        '<button class="offre-x" type="button" aria-label="Fermer">&times;</button>' +
        '<img class="offre-logo" src="/assets/img/mcb-blanc.png" alt="MCB by Beauté Sélection" />' +
        '<div class="offre-sur">' + (t.sur || "OFFRE FLASH") + '</div>' +
        '<div class="offre-h1">' + OFFRE.cadeau + '</div>' +
        '<div class="offre-h2">' + (t.parTranche || "par tranche de 500 € de commande") + '</div>' +
        '<div class="offre-blocs"></div>' +
        '<button class="offre-cta" type="button">' + (t.cta || "J\u2019en profite") + '</button>' +
      '</div>';
    document.body.appendChild(fond);

    function fermer() { fond.remove(); }
    fond.querySelector(".offre-x").addEventListener("click", fermer);
    fond.querySelector(".offre-cta").addEventListener("click", fermer);
    fond.addEventListener("click", function (e) { if (e.target === fond) fermer(); });

    blocs();
    setInterval(blocs, 1000);
  }

  function blocs() {
    var hote = document.querySelector(".offre-blocs");
    if (!hote) return;
    var r = OFFRE.fin - Date.now();
    if (r <= 0) { hote.innerHTML = ""; return; }
    var v = [
      [Math.floor(r / 86400000), t.uJours || "jours"],
      [deux(Math.floor(r / 3600000) % 24), t.uHeures || "heures"],
      [deux(Math.floor(r / 60000) % 60), "min"],
      [deux(Math.floor(r / 1000) % 60), "sec"],
    ];
    hote.innerHTML = v.map(function (x) {
      return '<div class="offre-bloc"><b>' + x[0] + '</b><i>' + x[1] + '</i></div>';
    }).join("");
  }

  /* ---------- bandeau de confirmation flottant (catalogue) ---------- */
  // Recoit le nombre de Packs MCB au panier.
  window.offreBarre = function (packs) {
    var b = document.getElementById("offre-flottante");
    packs = Number(packs) || 0;
    if (!encore() || packs <= 0) {
      if (b) b.remove();
      document.body.classList.remove("has-offre-barre");
      return;
    }
    if (!b) {
      b = document.createElement("div");
      b.id = "offre-flottante";
      b.innerHTML = '<div class="offre-fbarre"><span></span></div>' +
                    '<div class="offre-ftxt"></div>';
      document.body.appendChild(b);
    }
    document.body.classList.add("has-offre-barre");
    var jauge = b.querySelector(".offre-fbarre span");
    var txt = b.querySelector(".offre-ftxt");
    jauge.style.width = "100%";
    jauge.className = "offre-plein";
    txt.className = "offre-ftxt offre-ok";
    txt.textContent = packs === 1
      ? OFFRE.cadeau + t.debloque
      : t.cartons.replace("{n}", packs) + t.debloques;
  };

  function demarrer() { bandeau(); setTimeout(popup, 1100); }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", demarrer);
  } else { demarrer(); }
})();
