/* ==========================================================================
   NISHMAN — offre flash
   Un carton d'Aqua Wax offert par tranche de 500 EUR HT, jusqu'au 2 octobre.
   Tout est pilote ici : la date de fin, le seuil, les textes. Passez
   OFFRE.active a false pour tout retirer sans toucher au reste du site.
   ========================================================================== */
(function () {
  "use strict";

  var OFFRE = {
    active: true,
    fin: new Date(2026, 9, 3, 0, 0, 0),   // 3 octobre 00h00 = fin du 2 au soir
    seuil: 500,                            // euros HT par palier
    cadeau: "1 carton d'Aqua Wax 48 pcs offert",
    // Fiche Odoo du cadeau : c'est cette reference que le script ajoute
    // au devis, a 0 EUR, une ligne par palier atteint.
    ean: "NISH-OFFERT-AW",
    nom: "AQUA WAX ASSORTI — OFFERT",
    pieces: 48,
  };

  // Nombre de cartons offerts pour un total donne (utilise par la page devis).
  window.offreCartons = function (total) {
    if (!encore() || !total || total <= 0) return 0;
    return Math.floor(total / OFFRE.seuil);
  };
  window.offreCadeau = function () {
    return { ean: OFFRE.ean, nom: OFFRE.nom, pieces: OFFRE.pieces };
  };

  var T = {
    fr: { titre: "Offre flash — 1 carton d'Aqua Wax 48 pcs offert dès 500 €",
          reste: "Plus que : ", fini: "Offre terminée",
          manque: "Encore {x} pour obtenir ", debloque: " débloqué",
          debloques: " débloqués", suivant: "Encore {x} pour un carton de plus",
          j: "j", cartons: "{n} cartons d'Aqua Wax offerts",
          sur: "OFFRE FLASH", parTranche: "par tranche de 500 € de commande",
          cta: "J\u2019en profite", uJours: "jours", uHeures: "heures" },
    en: { titre: "Flash offer — 1 free carton of Aqua Wax, 48 pcs, from €500",
          reste: "Only: ", fini: "Offer ended",
          manque: "{x} more to unlock ", debloque: " unlocked",
          debloques: " unlocked", suivant: "{x} more for another carton",
          j: "d", cartons: "{n} free cartons of Aqua Wax",
          sur: "FLASH OFFER", parTranche: "for every €500 ordered",
          cta: "Shop now", uJours: "days", uHeures: "hours" },
    nl: { titre: "Flash-actie — 1 gratis doos Aqua Wax 48 st. vanaf € 500",
          reste: "Nog: ", fini: "Actie afgelopen",
          manque: "Nog {x} voor ", debloque: " vrijgespeeld",
          debloques: " vrijgespeeld", suivant: "Nog {x} voor een extra doos",
          j: "d", cartons: "{n} gratis dozen Aqua Wax",
          sur: "FLASH-ACTIE", parTranche: "per schijf van € 500 bestelling",
          cta: "Ik profiteer ervan", uJours: "dagen", uHeures: "uur" },
    de: { titre: "Flash-Aktion — 1 Karton Aqua Wax 48 Stk. gratis ab 500 €",
          reste: "Nur noch: ", fini: "Aktion beendet",
          manque: "Noch {x} für ", debloque: " freigeschaltet",
          debloques: " freigeschaltet", suivant: "Noch {x} für einen weiteren Karton",
          j: "T", cartons: "{n} Kartons Aqua Wax gratis",
          sur: "FLASH-AKTION", parTranche: "je 500 € Bestellwert",
          cta: "Jetzt nutzen", uJours: "Tage", uHeures: "Std" },
    tr: { titre: "Flaş kampanya — 500 €'dan itibaren 48 adetlik 1 koli Aqua Wax hediye",
          reste: "Sadece: ", fini: "Kampanya sona erdi",
          manque: "Hediye için {x} daha", debloque: " kazanıldı",
          debloques: " kazanıldı", suivant: "Bir koli daha için {x}",
          j: "g", cartons: "{n} koli Aqua Wax hediye",
          sur: "FLAŞ KAMPANYA", parTranche: "her 500 € sipariş için",
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
  function encore() { return OFFRE.active && (OFFRE.fin - Date.now()) > 0; }

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

  /* ---------- compteur sur la page devis ---------- */
  window.offreMaj = function (total) {
    var bloc = document.getElementById("offre-progres");
    if (!bloc) return;
    if (!encore() || !total || total <= 0) { bloc.hidden = true; return; }
    bloc.hidden = false;

    var paliers = Math.floor(total / OFFRE.seuil);
    var reste = OFFRE.seuil - (total % OFFRE.seuil);
    var pct = ((total % OFFRE.seuil) / OFFRE.seuil) * 100;
    if (paliers > 0 && pct === 0) pct = 100;

    var barre = bloc.querySelector(".offre-barre span");
    var ligne = bloc.querySelector(".offre-ligne");
    var sous = bloc.querySelector(".offre-sous");

    barre.style.width = (paliers > 0 ? 100 : pct).toFixed(0) + "%";
    barre.className = paliers > 0 ? "offre-plein" : "";

    if (paliers === 0) {
      ligne.className = "offre-ligne";
      ligne.textContent = t.manque.replace("{x}", euros(reste)) + OFFRE.cadeau;
      sous.textContent = "";
    } else {
      ligne.className = "offre-ligne offre-ok";
      ligne.textContent = paliers === 1
        ? OFFRE.cadeau + t.debloque
        : t.cartons.replace("{n}", paliers) + t.debloques;
      sous.textContent = t.suivant.replace("{x}", euros(reste));
    }
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

  /* ---------- barre de progression flottante (catalogue) ---------- */
  window.offreBarre = function (total) {
    var b = document.getElementById("offre-flottante");
    if (!encore() || !total || total <= 0) {
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

    var paliers = Math.floor(total / OFFRE.seuil);
    var reste = OFFRE.seuil - (total % OFFRE.seuil);
    var pct = ((total % OFFRE.seuil) / OFFRE.seuil) * 100;

    var jauge = b.querySelector(".offre-fbarre span");
    var txt = b.querySelector(".offre-ftxt");
    jauge.style.width = (paliers > 0 ? 100 : pct).toFixed(0) + "%";
    jauge.className = paliers > 0 ? "offre-plein" : "";

    if (paliers === 0) {
      txt.className = "offre-ftxt";
      txt.textContent = t.manque.replace("{x}", euros(reste)) + OFFRE.cadeau;
    } else {
      txt.className = "offre-ftxt offre-ok";
      txt.textContent = (paliers === 1
        ? OFFRE.cadeau + t.debloque
        : t.cartons.replace("{n}", paliers) + t.debloques)
        + " • " + t.suivant.replace("{x}", euros(reste));
    }
  };

  function demarrer() { bandeau(); setTimeout(popup, 1100); }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", demarrer);
  } else { demarrer(); }
})();
