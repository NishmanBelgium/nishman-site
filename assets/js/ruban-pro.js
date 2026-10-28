/* ==========================================================================
   BANDEAU PROFESSIONNEL — la copie qui rend le défilement continu.

   Un défilement sans raccord a besoin de deux exemplaires du même contenu :
   la piste se déplace de la moitié de sa largeur, et au moment où le
   premier exemplaire sort à gauche, le second a pris sa place exacte.

   Le texte du bandeau est traduit en cinq langues et posé par catalog.js,
   après coup, dans des éléments repérés par identifiant. Dupliquer le
   balisage à la main aurait donc produit deux identifiants identiques, et
   une copie figée en français. On observe plutôt le premier exemplaire et
   on recopie ce qu'il devient — au premier remplissage comme à chaque
   changement de langue.

   Les identifiants de la copie sont retirés : un identifiant doit rester
   unique dans la page, et un lecteur d'écran n'a pas à lire deux fois la
   même mention (la copie porte aria-hidden).
   ========================================================================== */

(function () {
  var source = document.getElementById("ruban-pro-source");
  var copie = document.getElementById("ruban-pro-copie");
  if (!source || !copie) return;

  function recopier() {
    copie.innerHTML = source.innerHTML;
    var avecId = copie.querySelectorAll("[id]");
    for (var i = 0; i < avecId.length; i++) avecId[i].removeAttribute("id");
  }

  recopier();

  // catalog.js remplit le bandeau après le chargement, et le réécrit à
  // chaque changement de langue. On suit.
  if (typeof MutationObserver === "function") {
    new MutationObserver(recopier).observe(source, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
})();
