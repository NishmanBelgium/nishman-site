/* ==========================================================================
   BOUTIQUE — le tunnel de commande d'un particulier.

   Règle de ce fichier, la même que côté professionnel : il n'additionne
   rien. Pas un prix, pas un port, pas une TVA. Chaque montant affiché
   vient de /api/panier-public, et le montant débité vient de
   /api/payer-public. La page ne fait que montrer et transmettre.

   Le point relais passe par le sélecteur hébergé de SendCloud, qui s'ouvre
   dans un cadre par-dessus la page. Il nous rend un identifiant ; cet
   identifiant est renvoyé au serveur, qui redemande la fiche du point à
   SendCloud avec sa propre clé. Ce que ce fichier reçoit sert à l'affichage,
   jamais à décider où va le colis.
   ========================================================================== */

(function () {
  "use strict";

  var CLE_PANIER = "nishman-panier";

  var panier = {};
  var CALCUL = null;
  var RELAIS_CLE = "";
  var RELAIS_DISPO = false;
  var relais = null;        // le point choisi, tel que le sélecteur l'a rendu
  var envoiEnCours = false;

  function $(id) { return document.getElementById(id); }
  function montrer(id, oui) { var e = $(id); if (e) e.hidden = !oui; }
  function euros(n) { return Number(n).toFixed(2).replace(".", ",") + " €"; }
  function echappe(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function val(id) { var e = $(id); return e ? String(e.value || "").trim() : ""; }

  function lirePanier() {
    try {
      var b = sessionStorage.getItem(CLE_PANIER);
      return b ? (JSON.parse(b) || {}) : {};
    } catch (e) { return {}; }
  }
  function viderPanier() {
    try { sessionStorage.removeItem(CLE_PANIER); } catch (e) {}
  }

  function pays() { var e = $("bc-pays"); return e ? e.value : "BE"; }

  /* --- Les montants, demandés au serveur ------------------------------ */

  var enCours = 0;
  function recalculer() {
    var mien = ++enCours;
    return fetch("/api/panier-public", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selection: panier, pays: pays() })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (mien !== enCours) return null;
        if (!d || d.ok !== true) return null;
        CALCUL = d;
        if (d.relais) {
          RELAIS_DISPO = d.relais.disponible === true;
          RELAIS_CLE = d.relais.cle || "";
        }
        return d;
      })
      .catch(function () { return null; });
  }

  function dessiner() {
    if (!CALCUL) return;

    $("bc-lignes").innerHTML = (CALCUL.lignes || []).map(function (l) {
      return '' +
        '<div class="bc-ligne">' +
          '<div class="bc-ligne-img"><img src="/assets/img/products/' + echappe(l.image) +
            '" alt="" loading="lazy" /></div>' +
          '<div class="bc-ligne-txt">' +
            '<p class="bc-ligne-nom">' + echappe(l.nom_court || l.nom) + '</p>' +
            '<p class="bc-ligne-q">' + l.quantite + ' × ' + euros(l.prix_unitaire) + '</p>' +
          '</div>' +
          '<div class="bc-ligne-tot">' + euros(l.total) + '</div>' +
        '</div>';
    }).join("");

    $("bc-sous").textContent = euros(CALCUL.sous_total);
    $("bc-port").textContent = CALCUL.port_offert ? "Offerte" : euros(CALCUL.port);
    $("bc-port").className = CALCUL.port_offert ? "bc-offert" : "";
    $("bc-total").textContent = euros(CALCUL.total);
    $("bc-tva-lab").textContent = "dont TVA " + Math.round(CALCUL.taux_tva * 100) + " %";
    $("bc-tva").textContent = euros(CALCUL.tva);

    // La jauge : combien il manque pour la livraison offerte. C'est une
    // information, pas une pression — elle disparaît dès que le seuil est
    // franchi.
    var reste = CALCUL.port_manque;
    montrer("bc-jauge-zone", reste > 0);
    if (reste > 0) {
      var part = Math.min(100, (CALCUL.sous_total / CALCUL.port_franco) * 100);
      $("bc-jauge-barre").style.width = part.toFixed(1) + "%";
      $("bc-jauge-txt").innerHTML = "Plus que <b>" + euros(reste) + "</b> pour la livraison offerte.";
    }

    // Le sélecteur de points relais ne peut pas fonctionner sans la clé
    // publique. Si elle manque, on le dit plutôt que d'ouvrir une fenêtre
    // vide au client.
    if (!RELAIS_DISPO) {
      var s = $("bc-relais-souci");
      s.textContent = "La livraison en point relais est momentanément indisponible. "
                    + "Réessayez dans quelques minutes ou contactez-nous.";
      s.hidden = false;
      $("bc-choisir-relais").disabled = true;
    }
  }

  /* --- Le point relais ------------------------------------------------- */

  function ouvrirSelecteur() {
    if (!RELAIS_DISPO || !RELAIS_CLE) return;
    if (!window.sendcloud || !window.sendcloud.servicePoints) {
      afficherSouci("Le sélecteur de points relais n'a pas pu se charger. "
                  + "Vérifiez votre connexion et réessayez.");
      return;
    }
    afficherSouci("");

    // On centre la recherche sur l'adresse déjà saisie quand on l'a : le
    // client n'a pas à retaper son code postal.
    var config = {
      apiKey: RELAIS_CLE,
      country: pays(),
      language: "fr-fr"
    };
    if (val("bc-cp")) config.postalCode = val("bc-cp");
    if (val("bc-ville")) config.city = val("bc-ville");
    if (val("bc-adresse")) config.address1 = val("bc-adresse");

    window.sendcloud.servicePoints.open(config, function (point) {
      relais = point;
      afficherRelais();
    }, function (erreurs) {
      // « Closed » veut dire que le client a refermé sans choisir : ce
      // n'est pas une panne, et il ne faut surtout pas lui afficher une
      // erreur pour ça.
      var liste = [].concat(erreurs || []);
      if (liste.indexOf("Closed") >= 0) return;
      afficherSouci("Le choix du point relais n'a pas abouti. Réessayez.");
    });
  }

  function afficherSouci(m) {
    var s = $("bc-relais-souci");
    s.textContent = m || "";
    s.hidden = !m;
  }

  var JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

  function afficherRelais() {
    if (!relais) { montrer("bc-relais-choisi", false); return; }
    $("bc-relais-nom").textContent = relais.name || "Point relais";
    $("bc-relais-adr").textContent =
      [[relais.street, relais.house_number].filter(Boolean).join(" "),
       [relais.postal_code, relais.city].filter(Boolean).join(" ")]
        .filter(Boolean).join(" · ");

    // Les horaires du jour, quand SendCloud les donne : c'est la première
    // chose qu'on regarde avant de choisir un point relais.
    var h = $("bc-relais-h");
    var t = relais.formatted_opening_times;
    if (t) {
      var jour = (new Date().getDay() + 6) % 7;      // 0 = lundi chez SendCloud
      var plages = t[String(jour)] || [];
      h.textContent = plages.length
        ? JOURS[jour] + " : " + plages.join(", ")
        : JOURS[jour] + " : fermé";
      h.hidden = false;
    } else { h.hidden = true; }

    montrer("bc-relais-choisi", true);
    $("bc-choisir-relais").hidden = true;
    afficherSouci("");
    // Le reproche affiché plus haut n'a plus lieu d'être : laisser
    // « choisissez votre point relais » sous un point relais choisi donne
    // l'impression que la page n'a pas compris.
    var e = $("bc-erreur");
    if (e && /point relais/i.test(e.textContent)) { e.textContent = ""; e.hidden = true; }
  }

  /* --- Le paiement ----------------------------------------------------- */

  var MESSAGES = {
    email: "Vérifiez votre adresse e-mail.",
    prenom: "Indiquez votre prénom.",
    nom: "Indiquez votre nom.",
    adresse: "Indiquez votre rue et votre numéro.",
    code_postal: "Indiquez votre code postal.",
    ville: "Indiquez votre ville.",
    pays: "Nous livrons en Belgique, en France et au Luxembourg.",
    cgv: "Acceptez les conditions de vente pour continuer.",
    relais: "Choisissez votre point relais.",
    relais_inconnu: "Ce point relais n'est plus disponible. Choisissez-en un autre.",
    relais_pays: "Le point relais choisi n'est pas dans votre pays de livraison.",
    vide: "Votre panier est vide.",
    mollie: "Le paiement en ligne est momentanément indisponible.",
    sendcloud: "La livraison est momentanément indisponible.",
    reseau: "Connexion interrompue. Votre panier est conservé : réessayez."
  };

  function erreurPage(m) {
    var e = $("bc-erreur");
    e.textContent = m || "";
    e.hidden = !m;
    if (m) e.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function payer() {
    if (envoiEnCours) return;
    erreurPage("");

    if (!$("bc-cgv").checked) { erreurPage(MESSAGES.cgv); return; }
    if (!relais || !relais.id) { erreurPage(MESSAGES.relais); return; }

    var corps = {
      selection: panier,
      cgv: true,
      client: {
        email: val("bc-email"),
        prenom: val("bc-prenom"),
        nom: val("bc-nom"),
        telephone: val("bc-tel"),
        adresse: val("bc-adresse"),
        code_postal: val("bc-cp"),
        ville: val("bc-ville"),
        pays: pays()
      },
      relais: { id: relais.id }
    };

    envoiEnCours = true;
    var b = $("bc-payer");
    b.disabled = true;
    b.textContent = "Ouverture du paiement…";

    fetch("/api/payer-public", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps)
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || d.ok !== true || !d.paiement_url) {
          envoiEnCours = false;
          b.disabled = false;
          b.textContent = "Payer ma commande";
          var code = (d && (d.code || d.motif)) || "";
          erreurPage(MESSAGES[code] || (d && d.message) || (d && d.erreur) || MESSAGES.reseau);
          return;
        }
        // Le bouton reste verrouillé : on quitte la page. Le rouvrir
        // laisserait un instant où un second clic créerait un second
        // paiement.
        //
        // Le panier n'est PAS vidé ici. Le client part chez sa banque et
        // peut renoncer : s'il revient les mains vides, il doit retrouver
        // sa sélection. C'est la page de retour qui le videra, et seulement
        // sur un paiement reçu.
        window.location.href = d.paiement_url;
      })
      .catch(function () {
        envoiEnCours = false;
        b.disabled = false;
        b.textContent = "Payer ma commande";
        erreurPage(MESSAGES.reseau);
      });
  }

  /* --- Le retour de chez la banque ------------------------------------- */

  var RELANCES = [1200, 1800, 2500, 3000, 4000, 5000, 6000, 8000, 10000];
  function dormir(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function peindre(o) {
    var ic = $("bc-retour-icone");
    ic.innerHTML = o.icone;
    ic.className = "bc-pastille" + (o.classe ? " " + o.classe : "");
    $("bc-retour-titre").textContent = o.titre || "";
    $("bc-retour-texte").textContent = o.texte || "";
    var d = $("bc-retour-detail");
    d.textContent = o.detail || "";
    d.hidden = !o.detail;
    montrer("bc-retour-reprendre", !!o.reprendre);
    montrer("bc-retour", true);
  }

  async function suivre(ref) {
    montrer("bc-attente", false);
    peindre({
      icone: "&#8230;", classe: "attente",
      titre: "Nous vérifions votre paiement",
      texte: "Quelques secondes : nous interrogeons votre banque. Ne fermez pas cette page."
    });

    for (var essai = 0; essai <= RELANCES.length; essai++) {
      if (essai > 0) await dormir(RELANCES[essai - 1]);

      var d = null, http = 0;
      try {
        var r = await fetch("/api/paiement-public?ref=" + encodeURIComponent(ref)
                            + "&t=" + Date.now(), { cache: "no-store" });
        http = r.status;
        d = await r.json();
      } catch (e) { d = null; }

      if (http === 404) {
        peindre({
          icone: "!", classe: "souci",
          titre: "Commande introuvable",
          texte: "Nous ne retrouvons pas cette commande. Si vous avez été débité, "
               + "écrivez-nous avec la référence " + ref + " et nous la retrouvons."
        });
        return;
      }
      if (!d || d.ok !== true) continue;

      if (d.traite === true) {
        viderPanier();
        peindre({
          icone: "&#10003;",
          titre: "Merci, c'est payé",
          texte: "Commande " + (d.commande || d.ref)
               + ". Votre preuve d'achat part par e-mail.",
          detail: "Nous préparons votre colis. Vous recevrez le numéro de suivi dès "
                + "qu'il partira vers votre point relais."
        });
        return;
      }

      if (d.perdu === true) {
        peindre({
          icone: "!", classe: "souci",
          titre: "Paiement non abouti",
          texte: "Rien ne vous a été débité. Votre panier est conservé : vous pouvez "
               + "reprendre votre commande.",
          reprendre: Object.keys(panier).length > 0
        });
        return;
      }

      if (d.statut === "paye") {
        viderPanier();
        peindre({
          icone: "&#10003;",
          titre: "Merci, c'est payé",
          texte: "Votre paiement est enregistré. Nous finalisons votre commande…"
        });
      }
    }

    var fin = null;
    try {
      var rf = await fetch("/api/paiement-public?ref=" + encodeURIComponent(ref)
                           + "&t=" + Date.now(), { cache: "no-store" });
      fin = await rf.json();
    } catch (e) {}

    if (fin && fin.statut === "paye") {
      viderPanier();
      peindre({
        icone: "&#10003;",
        titre: "Merci, c'est payé",
        texte: "Votre paiement est bien reçu. La confirmation vous parvient par e-mail "
             + "dans quelques minutes."
      });
    } else {
      peindre({
        icone: "&#8230;", classe: "attente",
        titre: "Confirmation en attente",
        texte: "Nous n'avons pas encore reçu la confirmation de votre banque. Elle peut "
             + "prendre quelques minutes. Ne payez pas une seconde fois : nous vous "
             + "écrivons dès qu'elle arrive."
      });
    }
  }

  /* --- Mise en route ---------------------------------------------------- */

  function brancher() {
    $("bc-choisir-relais").addEventListener("click", ouvrirSelecteur);
    $("bc-relais-changer").addEventListener("click", function () {
      relais = null;
      montrer("bc-relais-choisi", false);
      $("bc-choisir-relais").hidden = false;
      ouvrirSelecteur();
    });
    $("bc-payer").addEventListener("click", payer);

    // Changer de pays change le point relais possible : on repart à zéro
    // plutôt que de laisser un point belge sur une adresse française.
    $("bc-pays").addEventListener("change", function () {
      if (relais) {
        relais = null;
        montrer("bc-relais-choisi", false);
        $("bc-choisir-relais").hidden = false;
        afficherSouci("Vous avez changé de pays : choisissez à nouveau votre point relais.");
      }
      recalculer().then(function (d) { if (d) dessiner(); });
    });
  }

  async function demarrer() {
    panier = lirePanier();

    var ref = String(new URLSearchParams(window.location.search).get("retour") || "").trim();
    if (ref) {
      await suivre(ref);
      var rep = $("bc-retour-reprendre");
      if (rep) rep.addEventListener("click", function () {
        window.location.href = "/boutique/commander/";
      });
      return;
    }

    if (!Object.keys(panier).length) {
      montrer("bc-attente", false);
      montrer("bc-vide", true);
      return;
    }

    var d = await recalculer();
    montrer("bc-attente", false);

    if (!d || !d.lignes || !d.lignes.length) { montrer("bc-vide", true); return; }

    dessiner();
    montrer("bc-tunnel", true);
    brancher();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", demarrer);
  } else {
    demarrer();
  }
})();
