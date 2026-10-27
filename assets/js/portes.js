/* ==========================================================================
   PORTES — le choix à l'arrivée sur nishman.be.

   L'accueil ouvrait sur un logo au milieu du noir, puis sur un catalogue
   de gros. Un particulier n'avait aucun moyen de deviner qu'il pouvait
   acheter, et un coiffeur devait faire défiler pour trouver ses prix.

   Deux portes règlent les deux cas. Et comme personne n'aime choisir deux
   fois, le choix est retenu : au retour, on arrive directement du bon côté.
   La porte reste joignable depuis l'autre bord — « Espace professionnel »
   en boutique, « Pour moi » ici — pour qu'un choix ne soit jamais une
   impasse.
   ========================================================================== */
(function () {
  "use strict";

  var CLE = "nishman-porte-choix";

  function lire() {
    try { return localStorage.getItem(CLE) || ""; } catch (e) { return ""; }
  }
  function retenir(valeur) {
    try { localStorage.setItem(CLE, valeur); } catch (e) {}
  }

  function versCatalogue(doux) {
    var cible = document.getElementById("search-sticky")
             || document.getElementById("catalog-sheet");
    if (!cible) return;
    cible.scrollIntoView({ behavior: doux ? "smooth" : "auto", block: "start" });
  }

  var pro = document.getElementById("porte-pro");
  var client = document.getElementById("porte-client");

  if (pro) {
    pro.addEventListener("click", function (e) {
      e.preventDefault();
      retenir("salon");
      versCatalogue(true);
    });
  }
  if (client) {
    client.addEventListener("click", function () { retenir("client"); });
  }

  // « ?portes » dans l'adresse rouvre le choix : utile pour se montrer le
  // site, et pour sortir d'un choix fait par erreur.
  if (location.search.indexOf("portes") !== -1) {
    try { localStorage.removeItem(CLE); } catch (e) {}
    return;
  }

  var choix = lire();
  if (choix === "client") { location.replace("/boutique/"); return; }
  if (choix === "salon") {
    // Sans animation : on n'a pas choisi, on revient chez soi.
    if (document.readyState === "complete") versCatalogue(false);
    else window.addEventListener("load", function () { versCatalogue(false); });
  }
})();
