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
    cadeau: "1 carton d'Aqua Wax offert",
  };

  var T = {
    fr: { titre: "Offre flash — " + OFFRE.cadeau + " dès 500 €",
          reste: "Plus que ", fini: "Offre terminée",
          manque: "Encore {x} pour obtenir ", debloque: " débloqué",
          debloques: " débloqués", suivant: "Encore {x} pour un carton de plus",
          j: "j", cartons: "{n} cartons d'Aqua Wax offerts" },
    en: { titre: "Flash offer — 1 free carton of Aqua Wax from €500",
          reste: "Only ", fini: "Offer ended",
          manque: "{x} more to unlock ", debloque: " unlocked",
          debloques: " unlocked", suivant: "{x} more for another carton",
          j: "d", cartons: "{n} free cartons of Aqua Wax" },
    nl: { titre: "Flash-actie — 1 gratis doos Aqua Wax vanaf € 500",
          reste: "Nog ", fini: "Actie afgelopen",
          manque: "Nog {x} voor ", debloque: " vrijgespeeld",
          debloques: " vrijgespeeld", suivant: "Nog {x} voor een extra doos",
          j: "d", cartons: "{n} gratis dozen Aqua Wax" },
    de: { titre: "Flash-Aktion — 1 Karton Aqua Wax gratis ab 500 €",
          reste: "Nur noch ", fini: "Aktion beendet",
          manque: "Noch {x} für ", debloque: " freigeschaltet",
          debloques: " freigeschaltet", suivant: "Noch {x} für einen weiteren Karton",
          j: "T", cartons: "{n} Kartons Aqua Wax gratis" },
    tr: { titre: "Flaş kampanya — 500 €'dan itibaren 1 koli Aqua Wax hediye",
          reste: "Sadece ", fini: "Kampanya sona erdi",
          manque: "Hediye için {x} daha", debloque: " kazanıldı",
          debloques: " kazanıldı", suivant: "Bir koli daha için {x}",
          j: "g", cartons: "{n} koli Aqua Wax hediye" },
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
          '<span class="offre-ico" aria-hidden="true">&#9201;</span>' +
          '<div class="offre-txt">' +
            '<span class="offre-titre">' + t.titre + '</span>' +
            '<span class="offre-timer"></span>' +
          '</div>' +
          '<button class="offre-fermer" type="button" aria-label="Fermer">&times;</button>' +
        '</div>';
      hote.querySelector(".offre-fermer").addEventListener("click", function () {
        hote.innerHTML = "";
        try { sessionStorage.setItem("offre-fermee", "1"); } catch (e) {}
      });
    });
    try {
      if (sessionStorage.getItem("offre-fermee") === "1") {
        Array.prototype.forEach.call(hotes, function (h) { h.innerHTML = ""; });
        return;
      }
    } catch (e) {}
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bandeau);
  } else { bandeau(); }
})();
