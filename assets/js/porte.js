/* ==========================================================================
   PORTE — la fenêtre qui oriente le visiteur à son arrivée.
   Un professionnel part vers /pro/, un particulier reste sur la boutique.
   Le choix est retenu pour ne plus importuner le visiteur ensuite.
   ========================================================================== */
(function () {
  "use strict";

  var CLE = "nishman-porte";
  var boite = document.getElementById("porte");
  if (!boite) return;

  // Le stockage peut être refusé (navigation privée, cookies bloqués) :
  // dans ce cas on affiche la fenêtre, ce qui reste le comportement correct.
  function dejaVu() {
    try { return localStorage.getItem(CLE) === "1"; } catch (e) { return false; }
  }
  function retenir() {
    try { localStorage.setItem(CLE, "1"); } catch (e) {}
  }

  function fermer() {
    retenir();
    boite.classList.remove("on");
    document.body.style.overflow = "";
    setTimeout(function () { boite.hidden = true; }, 220);
  }

  // Le visiteur qui arrive avec ?pro dans l'adresse est un professionnel
  // attendu : on l'envoie directement, sans lui poser la question.
  if (location.search.indexOf("pro") !== -1) { retenir(); location.href = "/pro/"; return; }

  if (dejaVu()) return;

  // On laisse la page s'afficher avant d'ouvrir : moins brutal, et la
  // fenêtre ne retarde pas l'affichage du premier écran.
  setTimeout(function () {
    boite.hidden = false;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(function () { boite.classList.add("on"); });
  }, 700);

  document.getElementById("porte-non").addEventListener("click", fermer);
  document.getElementById("porte-fermer").addEventListener("click", fermer);
  document.getElementById("porte-oui") && null;
  boite.addEventListener("click", function (e) { if (e.target === boite) fermer(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !boite.hidden) fermer();
  });
  // Le clic vers l'espace pro vaut réponse : on la retient aussi.
  boite.querySelector(".porte-oui").addEventListener("click", retenir);
})();
