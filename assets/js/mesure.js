/* ==========================================================================
   MESURE D'AUDIENCE — côté navigateur.

   Le plus petit script possible, et le plus discret. Il annonce la page
   vue, puis se tait.

   Ce qu'il n'envoie PAS, délibérément : aucun identifiant, aucune
   empreinte d'appareil, aucune adresse complète de provenance — juste
   l'origine, sans le chemin ni les paramètres, qui peuvent contenir une
   recherche ou un jeton.

   Le seul état gardé sur l'appareil est un drapeau dans la mémoire de
   l'onglet, qui distingue la première page d'une visite des suivantes.
   Il disparaît quand l'onglet se ferme, ne traverse pas les sessions, et
   ne permet de reconnaître personne. C'est pour cela qu'aucun bandeau de
   consentement n'est nécessaire.
   ========================================================================== */
(function () {
  "use strict";

  var CLE = "nishman-vu";

  function premiere() {
    // Le stockage peut être refusé — navigation privée, réglages stricts.
    // Dans ce cas on compte la page vue et on renonce à la session : un
    // chiffre manquant vaut mieux qu'une erreur chez le visiteur.
    try {
      if (sessionStorage.getItem(CLE)) return false;
      sessionStorage.setItem(CLE, "1");
      return true;
    } catch (e) { return false; }
  }

  function origine(url) {
    try { return new URL(url).origin; } catch (e) { return ""; }
  }

  function annoncer() {
    var charge = JSON.stringify({
      chemin: location.pathname,
      source: origine(document.referrer),
      nouvelle: premiere(),
    });

    // sendBeacon survit au départ de la page et ne retarde rien. Quand il
    // n'existe pas, un fetch en « keepalive » fait le même travail.
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/mesure", new Blob([charge], { type: "text/plain" }));
        return;
      }
    } catch (e) { /* on tente l'autre voie */ }

    try {
      fetch("/api/mesure", {
        method: "POST", body: charge, keepalive: true,
        headers: { "content-type": "text/plain" },
      }).catch(function () {});
    } catch (e) { /* tant pis : la mesure n'est pas une fonctionnalité */ }
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    annoncer();
  } else {
    document.addEventListener("DOMContentLoaded", annoncer, { once: true });
  }
})();
