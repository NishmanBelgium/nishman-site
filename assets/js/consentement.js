/* ==========================================================================
   CONSENTEMENT AUX MESURES PUBLICITAIRES.

   Ce que dit la loi, et qui s'applique ici. Le pixel Meta dépose un
   identifiant sur l'appareil du visiteur et renvoie sa navigation à un
   tiers. En Belgique et en France, cela exige un consentement préalable,
   libre et éclairé : rien ne se charge avant le « oui », et refuser doit
   être aussi simple qu'accepter — d'où deux boutons de même poids, et
   non un bouton vert contre un lien gris.

   Ce que ça implique dans le code. Le pixel n'est PAS dans la page. Il
   est injecté par ce fichier, après le clic, et jamais autrement. Un
   visiteur qui refuse, ou qui ne répond pas, ne voit partir aucune
   requête vers Meta — ce n'est pas une promesse d'intention, c'est la
   seule chose que ce code sache faire.

   L'interrupteur. Tant que PIXEL est vide, il n'y a rien à consentir :
   aucun bandeau ne s'affiche, aucun stockage n'est touché, et le site se
   comporte exactement comme avant. C'est volontaire — la mesure
   s'allume en renseignant une seule ligne, et s'éteint en l'effaçant.
   ========================================================================== */
(function () {
  "use strict";

  /* L'identifiant du pixel Meta. Il n'est pas secret : tout site qui en
     porte un l'expose dans son code source, c'est ainsi que le navigateur
     le trouve. Le laisser vide désactive toute la mesure. */
  var PIXEL = "";

  /* La version du consentement. À incrémenter si les finalités changent :
     un visiteur qui a dit oui à la mesure publicitaire n'a pas dit oui à
     autre chose, et devra être réinterrogé. */
  var VERSION = 1;
  var CLE = "nishman-consentement";

  /* Le stockage peut échouer : navigation privée, cookies bloqués, mode
     restreint. Un refus de stockage ne doit jamais casser la page — on
     retombe simplement sur « pas de choix connu », donc pas de mesure. */
  function lire() {
    try {
      var brut = window.localStorage.getItem(CLE);
      if (!brut) return null;
      var o = JSON.parse(brut);
      return o && o.v === VERSION ? o : null;
    } catch (e) {
      return null;
    }
  }

  function ecrire(accepte) {
    try {
      window.localStorage.setItem(CLE, JSON.stringify({
        v: VERSION,
        pub: !!accepte,
        date: new Date().toISOString().slice(0, 10),
      }));
    } catch (e) {
      /* Sans stockage, le choix ne vaut que pour cette page. C'est
         désagréable mais correct : on redemandera, on ne supposera pas. */
    }
  }

  var charge = false;

  function chargerPixel() {
    if (charge || !PIXEL) return;
    charge = true;

    /* L'amorce officielle de Meta, réduite à ce qu'elle fait vraiment :
       une file d'attente, puis le script qui la vide. */
    /* eslint-disable */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = true; n.version = "2.0";
      n.queue = []; t = b.createElement(e); t.async = true; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    /* eslint-enable */

    window.fbq("init", PIXEL);
    window.fbq("track", "PageView");
  }

  /* --- Le bandeau --------------------------------------------------- */

  var bandeau = null;

  function fermer() {
    if (!bandeau) return;
    bandeau.remove();
    bandeau = null;
  }

  function repondre(accepte) {
    ecrire(accepte);
    fermer();
    if (accepte) chargerPixel();
  }

  function afficher() {
    if (bandeau) return;
    bandeau = document.createElement("div");
    bandeau.className = "cons";
    bandeau.setAttribute("role", "dialog");
    bandeau.setAttribute("aria-live", "polite");
    bandeau.setAttribute("aria-label", "Mesure d'audience publicitaire");
    bandeau.innerHTML =
      '<div class="cons-in">' +
        '<p class="cons-txt">Nous aimerions mesurer quelles publicités amènent des ' +
        'visiteurs sur ce site. Cela suppose de transmettre votre navigation à Meta ' +
        '(Facebook, Instagram). Le site fonctionne exactement pareil si vous refusez. ' +
        '<a href="/confidentialite/#mesure">En savoir plus</a></p>' +
        '<div class="cons-choix">' +
          '<button type="button" class="cons-btn" data-cons="non">Refuser</button>' +
          '<button type="button" class="cons-btn" data-cons="oui">Accepter</button>' +
        '</div>' +
      '</div>';
    bandeau.addEventListener("click", function (e) {
      if (!e.target || !e.target.closest) return;
      var b = e.target.closest("[data-cons]");
      if (b) repondre(b.getAttribute("data-cons") === "oui");
    });
    document.body.appendChild(bandeau);
  }

  /* Le lien du pied de page. Revenir sur son choix doit être possible à
     tout moment, sans quoi le consentement n'est pas révocable — et un
     consentement irrévocable n'en est pas un. */
  window.nishmanConsentement = {
    rouvrir: function () {
      try { window.localStorage.removeItem(CLE); } catch (e) {}
      if (PIXEL) afficher();
    },
    etat: function () {
      var c = lire();
      return c ? (c.pub ? "accepté" : "refusé") : "sans réponse";
    },

    /* Le point d'entrée des autres scripts du site. Une vue de fiche, un
       ajout au panier, un achat passent tous par ici.

       Un évènement émis avant le consentement est PERDU, pas mis en
       file. Garder de côté ce qu'a fait un visiteur qui n'a pas encore
       répondu, pour l'envoyer s'il finit par accepter, reviendrait à
       mesurer d'abord et demander ensuite — exactement ce que ce
       fichier existe pour éviter. */
    evenement: function (nom, donnees) {
      if (!PIXEL || !charge || !window.fbq) return false;
      try {
        window.fbq("track", nom, donnees || {});
        return true;
      } catch (e) {
        return false;
      }
    },

    /* L'achat ne doit partir qu'une fois. La page de retour interroge le
       serveur deux fois — une à l'arrivée, une après confirmation — et
       peint « c'est payé » dans les deux cas ; sans ce garde-fou, Meta
       compterait deux ventes pour une. La référence de commande sert de
       clé, donc un rechargement de la page ne recompte pas non plus. */
    achatUneFois: function (ref, donnees) {
      if (!ref) return false;
      var cle = "nishman-achat-" + ref;
      try {
        if (window.sessionStorage.getItem(cle)) return false;
        window.sessionStorage.setItem(cle, "1");
      } catch (e) {
        /* Sans stockage on préfère envoyer une fois de trop que pas du
           tout : une vente manquante fausse la mesure plus durablement
           qu'une vente comptée deux fois, qui se voit. */
      }
      return window.nishmanConsentement.evenement("Purchase", donnees);
    },
  };

  /* Le lien « Gérer mes cookies » du pied de page. Il est posé sur toutes
     les pages, y compris quand la mesure est éteinte : dans ce cas il dit
     simplement qu'il n'y a rien à régler, ce qui vaut mieux qu'un lien
     mort. */
  document.addEventListener("click", function (e) {
    if (!e.target || !e.target.closest) return;
    var l = e.target.closest("[data-cons-rouvrir]");
    if (!l) return;
    e.preventDefault();
    if (!PIXEL) {
      window.location.href = "/confidentialite/#mesure";
      return;
    }
    window.nishmanConsentement.rouvrir();
  });

  if (!PIXEL) return;

  var choix = lire();
  if (choix && choix.pub) chargerPixel();
  else if (!choix) afficher();
})();
