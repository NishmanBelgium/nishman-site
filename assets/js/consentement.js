/* ==========================================================================
   CONSENTEMENT AUX MESURES PUBLICITAIRES.

   Ce que dit la loi, et qui s'applique ici. Le pixel Meta et la balise
   Google déposent chacun un identifiant sur l'appareil du visiteur et
   renvoient sa navigation à un tiers. En Belgique et en France, cela
   exige un consentement préalable, libre et éclairé : rien ne se charge
   avant le « oui », et refuser doit être aussi simple qu'accepter —
   d'où deux boutons de même poids, et non un bouton vert contre un lien
   gris.

   Ce que ça implique dans le code. Ni le pixel ni la balise ne sont dans
   la page. Ils sont injectés par ce fichier, après le clic, et jamais
   autrement. Un visiteur qui refuse, ou qui ne répond pas, ne voit
   partir aucune requête vers Meta ni vers Google — ce n'est pas une
   promesse d'intention, c'est la seule chose que ce code sache faire.

   UN SEUL CHOIX POUR LES DEUX, et c'est délibéré. La finalité est la
   même — savoir quelles publicités amènent des clients — et découper le
   bandeau en deux questions ne donnerait pas plus de contrôle, juste
   plus de fatigue. Le bandeau nomme donc les deux destinataires, et le
   « oui » vaut pour les deux.

   L'interrupteur. Chaque mesure s'allume en renseignant une ligne et
   s'éteint en l'effaçant ; quand les deux sont vides, il n'y a rien à
   consentir : aucun bandeau ne s'affiche, aucun stockage n'est touché,
   et le site se comporte exactement comme avant.
   ========================================================================== */
(function () {
  "use strict";

  /* L'identifiant du pixel Meta. Il n'est pas secret : tout site qui en
     porte un l'expose dans son code source, c'est ainsi que le navigateur
     le trouve. Le laisser vide désactive la mesure Meta. */
  var PIXEL = "1694763912240328";

  /* La balise Google Ads, et les deux conversions qu'elle rapporte.
     Même remarque : ces identifiants sont publics par construction.

     Les deux étiquettes correspondent aux actions créées dans le compte
     Google Ads. Elles ne sont pas interchangeables : « Achat » porte un
     montant, « Compte pro TVA validée » n'en porte pas et ne part que
     lorsque VIES a confirmé le numéro — c'est ce signal-là, et non
     l'inscription nue, qui sert à optimiser les enchères. */
  var GOOGLE = "AW-18558846793";
  var G_ACHAT = "AW-18558846793/xjOtCNm577IdEMmOxpFF";
  var G_COMPTE_PRO = "AW-18558846793/XGwNCIbLk7MdEMmOxpFF";

  /* Y a-t-il seulement quelque chose à consentir ? */
  function mesureConfiguree() { return !!(PIXEL || GOOGLE); }

  /* La version du consentement. À incrémenter si les finalités changent :
     un visiteur qui a dit oui à la mesure publicitaire n'a pas dit oui à
     autre chose, et devra être réinterrogé.

     Version 2 : ajout de la balise Google Ads à côté du pixel Meta. Un
     destinataire de plus est une finalité nouvelle, donc tout le monde
     est réinterrogé — y compris ceux qui avaient déjà dit oui à Meta. */
  var VERSION = 2;
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
    if (!PIXEL) return;

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

  /* La balise Google, montée à la main pour la même raison que celle de
     Meta : on veut voir ce qui part, et quand.

     Le mode consentement de Google est renseigné explicitement, bien que
     le script ne soit chargé qu'après le « oui ». C'est redondant, et
     c'est voulu : Google lit ces signaux pour décider de ce qu'il a le
     droit de mesurer, et les lui laisser deviner d'après notre silence
     serait s'en remettre à un défaut que nous ne contrôlons pas.

     « allow_enhanced_conversions » n'est pas activé : le suivi avancé
     renvoie à Google l'adresse e-mail du client, hachée mais bien
     présente, et nous n'avons pas demandé cela aux visiteurs. */
  function chargerGoogle() {
    if (!GOOGLE) return;

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

    window.gtag("consent", "default", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
    });
    window.gtag("consent", "update", {
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted",
    });

    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(GOOGLE);
    var p = document.getElementsByTagName("script")[0];
    p.parentNode.insertBefore(s, p);

    window.gtag("js", new Date());
    window.gtag("config", GOOGLE, { allow_enhanced_conversions: false });
  }

  function chargerMesures() {
    if (charge || !mesureConfiguree()) return;
    charge = true;
    chargerPixel();
    chargerGoogle();
  }

  /* Une conversion Google. Même porte que pour Meta : rien avant le oui,
     et rien mis en file d'attente derrière. */
  function conversionGoogle(etiquette, donnees) {
    if (!GOOGLE || !charge || !window.gtag || !etiquette) return false;
    try {
      var d = donnees || {};
      d.send_to = etiquette;
      window.gtag("event", "conversion", d);
      return true;
    } catch (e) {
      return false;
    }
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
    if (accepte) chargerMesures();
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
        '(Facebook, Instagram) et à Google. Le site fonctionne exactement pareil si ' +
        'vous refusez. <a href="/confidentialite/#mesure">En savoir plus</a></p>' +
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
      if (mesureConfiguree()) afficher();
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

    /* Le compte professionnel à TVA validée.

       Meta sait compter une inscription ; il ne sait pas faire la
       différence entre un curieux et un salon. Nous, si : le numéro de
       TVA est contrôlé en direct auprès de VIES à l'inscription, et un
       particulier n'en a pas. C'est donc ce signal-là, et non le clic ni
       l'inscription nue, que les campagnes cherchent à maximiser.

       Deux évènements partent, et ce n'est pas une redondance :
       « CompleteRegistration » est au catalogue de Meta et donne du
       volume à l'algorithme ; « CompteProTvaValide » n'y est pas et ne
       part que si VIES a confirmé, ce qui en fait l'objectif
       d'optimisation. Le second seul serait trop rare pour apprendre, le
       premier seul attirerait n'importe qui.

       L'envoi est gardé par la clé du compte : la page d'accueil du
       compte est rechargée souvent, et une inscription comptée trois
       fois fausserait le coût d'acquisition dans le sens le plus
       flatteur — donc le plus dangereux. */
    compteProUneFois: function (cle, statut, donnees) {
      if (!cle) return false;
      var memoire = "nishman-compte-pro-" + cle;
      try {
        if (window.sessionStorage.getItem(memoire)) return false;
        window.sessionStorage.setItem(memoire, "1");
      } catch (e) {
        /* Sans stockage, on préfère une inscription comptée deux fois à
           une inscription perdue : l'excès se repère, le manque non. */
      }
      var d = donnees || {};
      d.status = statut || "inconnu";
      d.content_name = "compte-pro";
      var parti = window.nishmanConsentement.evenement("CompleteRegistration", d);
      if (statut === "valide") {
        window.nishmanConsentement.evenementSurMesure("CompteProTvaValide", d);
        /* Google ne reçoit que le compte à TVA validée, et pas
           l'inscription nue. La raison est la même que pour Meta, mais
           la conséquence est plus directe : cette action est déclarée
           « principale » dans le compte Google Ads, donc elle pilote
           les enchères. Lui donner des curieux reviendrait à payer
           Google pour en trouver d'autres. */
        conversionGoogle(G_COMPTE_PRO);
      }
      return parti;
    },

    /* Un évènement qui n'est pas au catalogue de Meta. « track » refuse
       les noms qu'il ne connaît pas ; « trackCustom » les accepte. */
    evenementSurMesure: function (nom, donnees) {
      if (!PIXEL || !charge || !window.fbq) return false;
      try {
        window.fbq("trackCustom", nom, donnees || {});
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
      var d = donnees || {};
      /* La référence de commande part aussi à Google, comme
         « transaction_id » : c'est elle qui lui permet d'écarter un
         doublon si la page de retour repasse par ici malgré le garde-fou
         ci-dessus. Le montant est celui du serveur, jamais un total
         recalculé dans le navigateur. */
      conversionGoogle(G_ACHAT, {
        value: Number(d.value) || 0,
        currency: d.currency || "EUR",
        transaction_id: String(ref),
      });
      return window.nishmanConsentement.evenement("Purchase", d);
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
    if (!mesureConfiguree()) {
      window.location.href = "/confidentialite/#mesure";
      return;
    }
    window.nishmanConsentement.rouvrir();
  });

  if (!mesureConfiguree()) return;

  var choix = lire();
  if (choix && choix.pub) chargerMesures();
  else if (!choix) afficher();
})();
