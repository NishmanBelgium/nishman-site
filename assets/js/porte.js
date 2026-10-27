/* ==========================================================================
   PORTE — le bandeau qui oriente le visiteur à son arrivée en boutique.

   C'était une fenêtre qui recouvrait la page et bloquait le défilement.
   Google Merchant Center refuse une page d'arrivée dont une fenêtre masque
   les informations : « si vous affichez une fenêtre, assurez-vous qu'elle
   puisse être fermée et qu'elle ne bloque pas les détails du produit ».

   C'est devenu un bandeau. Il oriente sans rien cacher, ne verrouille rien,
   et disparaît dès qu'on le ferme ou qu'on a choisi une fois.

   Le ton a changé aussi : on ne demande plus au visiteur de se déclarer
   professionnel avant d'entrer, on lui dit qu'il est au bon endroit et on
   indique la porte d'à côté à ceux qui achètent pour leur salon.
   ========================================================================== */
(function () {
  "use strict";

  var CLE = "nishman-porte";
  var boite = document.getElementById("porte");
  if (!boite) return;

  // Le stockage peut être refusé (navigation privée, cookies bloqués) :
  // on montre alors le bandeau, ce qui reste le comportement correct.
  function dejaVu() {
    try { return localStorage.getItem(CLE) === "1"; } catch (e) { return false; }
  }
  function retenir() {
    try { localStorage.setItem(CLE, "1"); } catch (e) {}
  }

  function fermer() {
    retenir();
    boite.classList.remove("on");
    setTimeout(function () { boite.hidden = true; }, 240);
  }

  // Le visiteur qui arrive avec ?pro dans l'adresse est un professionnel
  // attendu : on l'envoie directement, sans lui poser la question.
  if (location.search.indexOf("pro") !== -1) { retenir(); location.href = "/pro/"; return; }

  if (dejaVu()) return;

  boite.hidden = false;
  requestAnimationFrame(function () { boite.classList.add("on"); });

  document.getElementById("porte-fermer").addEventListener("click", fermer);
  // Partir vers l'espace professionnel vaut réponse : on la retient.
  var pro = boite.querySelector(".porte-oui");
  if (pro) pro.addEventListener("click", retenir);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !boite.hidden) fermer();
  });
})();
