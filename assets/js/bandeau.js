/* ==========================================================================
   LES BANDEAUX ANIMÉS — chargés seulement quand ça ne coûte rien.

   Même règle que sur la porte d'entrée : un film décoratif ne doit coûter
   à personne ce que personne n'a demandé. L'image fixe s'affiche tout de
   suite, et la vidéo n'est demandée qu'une fois la page posée — jamais si
   le système demande moins d'animations, jamais en économie de données,
   jamais sur un réseau lent.

   Un écouteur pour tous les <video data-film> de la page : les deux
   catalogues n'en ont qu'un chacun aujourd'hui, mais la règle ne doit pas
   être réécrite le jour où il y en aura un troisième.

   Deux montages pour le bandeau professionnel, et non un seul étiré :
   sur téléphone la boîte est presque carrée, sur ordinateur c'est une
   bande très large. Un unique fichier 1920×480 posé dans la boîte du
   téléphone n'en montrait que la tranche centrale, soit des pots coupés
   en deux. Le choix se fait ici plutôt qu'avec l'attribut media d'un
   <source>, que les navigateurs n'honorent pas sur une vidéo. L'affiche
   fixe, elle, est un fond CSS : elle suit le même point de rupture, en
   une seule ligne de feuille de style.
   ========================================================================== */
(function () {
  "use strict";

  var films = document.querySelectorAll("video[data-film]");
  if (!films.length) return;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var res = navigator.connection || {};
  if (res.saveData === true) return;
  if (/(^|-)2g$/.test(res.effectiveType || "")) return;

  // Le même seuil que la feuille de style (min-width: 900px), écrit une
  // fois : si les deux divergent, on sert le montage large dans la boîte
  // étroite, ce qui est exactement le défaut qu'on corrige.
  var large = window.matchMedia("(min-width: 900px)").matches;

  function lancer() {
    Array.prototype.forEach.call(films, function (f) {
      if (f.querySelector("source")) return;
      var s = document.createElement("source");
      s.type = "video/mp4";
      var etroit = f.getAttribute("data-film-haut");
      s.src = !large && etroit ? etroit : f.getAttribute("data-film");
      f.appendChild(s);
      f.load();
      var p = f.play();
      // Un refus de lecture automatique n'est pas une erreur : l'image
      // fixe reste à l'écran et la page ne s'en porte pas plus mal.
      if (p && p.catch) p.catch(function () {});
    });
  }

  if ("requestIdleCallback" in window) requestIdleCallback(lancer, { timeout: 2000 });
  else window.addEventListener("load", lancer);
})();
