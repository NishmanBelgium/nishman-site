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
   ========================================================================== */
(function () {
  "use strict";

  var films = document.querySelectorAll("video[data-film]");
  if (!films.length) return;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var res = navigator.connection || {};
  if (res.saveData === true) return;
  if (/(^|-)2g$/.test(res.effectiveType || "")) return;

  function lancer() {
    Array.prototype.forEach.call(films, function (f) {
      if (f.querySelector("source")) return;
      var s = document.createElement("source");
      s.type = "video/mp4";
      s.src = f.getAttribute("data-film");
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
