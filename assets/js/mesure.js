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
  var CLE_C = "nishman-c";

  /* L'étiquette de campagne.
   *
   * Instagram n'envoie pas de référent depuis son application : sans
   * étiquette, toutes ces visites arrivent en « direct » et on ne sait
   * plus quel contenu les a produites. On met donc l'étiquette dans le
   * lien qu'on publie — /produits/?c=ig-reel-mcb — et on la retient le
   * temps de la visite, pour que la deuxième et la troisième page soient
   * attribuées à la même origine que la première.
   *
   * Ce n'est pas un identifiant : « ig-bio » est partagée par tout le
   * monde et ne reconnaît personne. Elle vit dans la mémoire de l'onglet
   * et disparaît avec lui.
   *
   * Et on la retire de la barre d'adresse une fois lue : une adresse
   * propre se partage mieux, et personne ne recopie par mégarde
   * l'étiquette de quelqu'un d'autre.
   *
   * LA PREMIÈRE ÉTIQUETTE D'UNE VISITE L'EMPORTE. Celle qui a fait venir
   * quelqu'un est celle de son arrivée ; une étiquette rencontrée plus
   * tard, en cliquant d'une page à l'autre, ne l'a pas fait venir. Si
   * elle écrasait la première, l'origine réelle disparaîtrait et la
   * nouvelle afficherait des pages vues sans aucune visite — un lien
   * qui a l'air de ne rien rapporter alors qu'il a tout amené. */
  function campagne() {
    var deja = null;
    try { deja = sessionStorage.getItem(CLE_C) || null; } catch (e) {}

    var vue = null;
    try {
      var p = new URLSearchParams(location.search).get("c");
      if (p && /^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/.test(p)) vue = p.toLowerCase();
    } catch (e) { /* adresse illisible : tant pis */ }

    // L'adresse est nettoyée même quand l'étiquette est ignorée : ce qui
    // compte ici, c'est qu'elle ne traîne pas dans ce qu'on partage.
    if (vue) {
      try {
        var u = new URL(location.href);
        u.searchParams.delete("c");
        history.replaceState(null, "", u.pathname + u.search + u.hash);
      } catch (e) { /* l'adresse reste telle quelle, sans conséquence */ }
    }

    if (deja) return deja;
    if (vue) { try { sessionStorage.setItem(CLE_C, vue); } catch (e) {} }
    return vue;
  }

  /* L'origine publicitaire, pour la commande.
   *
   * Même mécanisme que l'étiquette ci-dessus, et pour la même raison :
   * la première origine de la visite l'emporte. Mais elle ne sert pas au
   * même usage, et c'est ce qui justifie de la garder à part.
   *
   * L'étiquette « c » compte des pages vues. Celle-ci sera écrite sur la
   * COMMANDE, dans Odoo, à côté du montant facturé. C'est elle qui
   * permettra de dire « la campagne de novembre a rapporté tant
   * d'euros » plutôt que « tant de clics ».
   *
   * Pourquoi la première et pas la dernière : un barbier découvre la
   * marque par une publicité, revient trois semaines plus tard en tapant
   * « nishman » dans Google, et commande. En dernière origine, c'est
   * Google qui empocherait le mérite et la publicité paraîtrait inutile
   * — alors que sans elle, il n'aurait jamais su quoi taper.
   *
   * Comme l'étiquette, ces trois valeurs ne désignent personne :
   * « meta / cpc / salons-novembre » est la même chaîne pour tous ceux
   * qui ont cliqué sur la même annonce. Elle vit dans la mémoire de
   * l'onglet et s'efface avec lui. */
  var CLE_O = "nishman-origine";

  function propre(v) {
    if (!v) return "";
    var s = String(v).trim().toLowerCase().slice(0, 60);
    return /^[a-z0-9][a-z0-9 ._\-+/]*$/.test(s) ? s : "";
  }

  function origineAnnonce() {
    var deja = null;
    try { deja = sessionStorage.getItem(CLE_O); } catch (e) {}
    if (deja) { try { return JSON.parse(deja); } catch (e) { return null; } }

    var vue = null;
    try {
      var q = new URLSearchParams(location.search);
      var o = {
        source: propre(q.get("utm_source")),
        medium: propre(q.get("utm_medium")),
        campagne: propre(q.get("utm_campaign")),
      };
      if (o.source || o.medium || o.campagne) vue = o;
    } catch (e) { /* adresse illisible : tant pis */ }

    if (!vue) return null;
    try { sessionStorage.setItem(CLE_O, JSON.stringify(vue)); } catch (e) {}
    return vue;
  }

  /* Les pages de commande lisent l'origine par ici. Elles ne chargent pas
     toutes ce fichier, d'où la lecture directe du stockage en secours. */
  window.nishmanOrigine = function () {
    try {
      var brut = sessionStorage.getItem(CLE_O);
      return brut ? JSON.parse(brut) : null;
    } catch (e) { return null; }
  };

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
    /* L'ordre compte : l'étiquette est lue AVANT premiere(), qui pose le
       drapeau de session. Sinon, sur la toute première page, le nettoyage
       de l'adresse partirait après coup. */
    var c = campagne();
    // Retenue au passage, pour la commande qui viendra peut-être plus
    // tard. Elle ne part pas dans la mesure d'audience : celle-ci compte
    // des pages, pas des euros.
    origineAnnonce();
    var charge = JSON.stringify({
      chemin: location.pathname,
      source: origine(document.referrer),
      nouvelle: premiere(),
      campagne: c,
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

  /* Les gestes qu'une page vue ne raconte pas : sur la porte d'entrée,
     savoir de quel côté partent les visiteurs. On envoie le nom du geste,
     rien d'autre — pas de quoi reconnaître qui que ce soit.

     L'écoute est posée sur le document plutôt que sur chaque lien : les
     liens peuvent être redessinés après coup, un écouteur au-dessus
     survit. Et « sendBeacon » part même si la page se ferme dans la
     foulée, ce qui est exactement le cas quand on clique. */
  function geste(nom) {
    var charge = JSON.stringify({ geste: nom });
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
    } catch (e) { /* tant pis */ }
  }

  document.addEventListener("click", function (e) {
    var cible = e.target && e.target.closest ? e.target.closest("[data-mesure]") : null;
    if (cible) geste(cible.getAttribute("data-mesure"));
  }, true);

  if (document.readyState === "complete" || document.readyState === "interactive") {
    annoncer();
  } else {
    document.addEventListener("DOMContentLoaded", annoncer, { once: true });
  }
})();
