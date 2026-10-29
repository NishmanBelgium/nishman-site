/* ==========================================================================
   NISHMAN — boutique grand public
   Catalogue, fiche produit et panier. Prix affichés TTC, comme l'exige la
   vente aux particuliers.
   ========================================================================== */
(function () {
  "use strict";

  // Réglages commerciaux. Ils ne sont PLUS écrits ici : le serveur les
  // donne, et c'est lui qui les appliquera au moment d'encaisser. Deux
  // copies d'une même règle finissent toujours par diverger — ce fichier
  // affichait encore 4,90 € et un franco à 49 € quand le serveur était
  // passé à 4,95 € et 29,90 €. Une seule source, et le problème disparaît.
  //
  // Les valeurs ci-dessous ne servent qu'à l'instant où la page vient de
  // s'ouvrir et où la réponse du serveur n'est pas encore arrivée.
  var PORT = 4.95;
  var FRANCO = 29.90;
  var TVA = 0.21;
  var RELAIS = { disponible: false, cle: "" };

  var PRODUITS = [];
  var panier = {};         // ean -> quantité
  var langue = "fr";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function euros(n) {
    return n.toFixed(2).replace(".", ",") + " €";
  }

  function echappe(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function texte(p, champ) {
    return p[champ + "_" + langue] || p[champ + "_fr"] || "";
  }

  // ── les règles, demandées au serveur ────────────────────────────────────
  // Un panier vide suffit : on ne veut que les réglages et la clé publique
  // du sélecteur de points relais.
  fetch("/api/panier-public", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selection: {} })
  })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d || d.ok !== true) return;
      if (d.regles) {
        PORT = d.regles.port;
        FRANCO = d.regles.franco;
        var ruban = $("#ruban-franco");
        if (ruban) ruban.textContent = euros(FRANCO);
      }
      if (typeof d.taux_tva === "number") TVA = d.taux_tva;
      if (d.relais) RELAIS = d.relais;
      majPanier();
    })
    .catch(function () { /* on garde les valeurs de secours */ });

  // ── chargement ──────────────────────────────────────────────────────────
  fetch("/assets/data/boutique.json?v=286")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      PRODUITS = d;
      lirePanier();
      dessinerFiltres();
      dessinerGrille("Tout");
      majPanier();
    })
    .catch(function () {
      $("#grille").innerHTML =
        '<p style="grid-column:1/-1;color:#a4a4a9">Catalogue momentanément indisponible.</p>';
    });

  // ── filtres ─────────────────────────────────────────────────────────────
  function familles() {
    var vues = [], out = ["Tout"];
    PRODUITS.forEach(function (p) {
      if (vues.indexOf(p.famille) === -1) { vues.push(p.famille); out.push(p.famille); }
    });
    return out;
  }

  function dessinerFiltres() {
    $("#filtres").innerHTML = familles().map(function (f, i) {
      return '<button class="chip" aria-pressed="' + (i === 0) + '" data-fam="' +
             echappe(f) + '">' + echappe(f) + "</button>";
    }).join("");
    $("#filtres").addEventListener("click", function (e) {
      var b = e.target.closest(".chip");
      if (!b) return;
      $$(".chip").forEach(function (c) { c.setAttribute("aria-pressed", c === b); });
      dessinerGrille(b.dataset.fam);
    });
  }

  function dessinerGrille(fam) {
    var liste = fam === "Tout" ? PRODUITS
              : PRODUITS.filter(function (p) { return p.famille === fam; });
    $("#grille").innerHTML = liste.map(function (p) {
      return '' +
        '<article class="carte' + (p.bientot ? " indispo" : "") + '" data-ean="' + p.ean + '">' +
          // Un vrai lien, et non plus une fenêtre ouverte par JavaScript :
          // c'est par lui que Google atteint les fiches, et c'est lui qu'on
          // copie pour partager un produit.
          '<a class="carte-lien" href="/boutique/' + echappe(p.slug || p.ean) + '/">' +
          '<div class="carte-img">' +
            (p.bientot ? '<span class="bientot">Bientôt</span>' : "") +
            '<img src="/assets/img/products/' + echappe(p.image) +
            '" alt="' + echappe(p.nom) + '" loading="lazy" width="900" height="900" /></div>' +
          '<div class="carte-fam">' + echappe(p.famille) + "</div>" +
          '<h3 class="carte-nom">' + echappe(p.nom_court || p.nom) + "</h3>" +
          '<div class="carte-vol">' + echappe(p.volume) + "</div>" +
          "</a>" +
          '<div class="carte-bas">' +
            '<span class="prix">' + euros(p.ttc) + "</span>" +
            (p.bientot
              ? '<button class="carte-add" disabled aria-label="Bientôt disponible">+</button>'
              : '<button class="carte-add" data-add="' + p.ean + '" ' +
                'aria-label="Ajouter au panier">+</button>') +
          "</div>" +
        "</article>";
    }).join("");
  }

  // ── interactions sur la grille ──────────────────────────────────────────
  document.addEventListener("click", function (e) {
    var add = e.target.closest("[data-add]");
    if (add) {
      e.stopPropagation();
      ajouter(add.dataset.add, 1);
      return;
    }
    // La carte est désormais un lien : le navigateur fait le travail.
  });

  // ── panier ──────────────────────────────────────────────────────────────
  function lirePanier() {
    try {
      var b = sessionStorage.getItem("nishman-panier");
      if (b) panier = JSON.parse(b) || {};
    } catch (err) { panier = {}; }
  }
  function ecrirePanier() {
    // Le panier survit à un rechargement, sans jamais quitter l'appareil.
    try { sessionStorage.setItem("nishman-panier", JSON.stringify(panier)); } catch (err) {}
  }

  function ajouter(ean, n) {
    var fiche = PRODUITS.filter(function (x) { return x.ean === ean; })[0];
    if (n > 0 && fiche && fiche.bientot) { toast("Bientôt disponible"); return; }
    panier[ean] = Math.max(0, (panier[ean] || 0) + n);
    if (!panier[ean]) delete panier[ean];
    ecrirePanier();
    majPanier();
    // Un ajout ouvre le tiroir. Le petit message seul obligeait à rouvrir
    // le panier pour vérifier que l'article y était ; voir la ligne
    // apparaître est la seule confirmation qui ne laisse aucun doute.
    if (n > 0) ouvrirPanier(true);
  }

  function lignes() {
    return Object.keys(panier).map(function (ean) {
      var p = PRODUITS.filter(function (x) { return x.ean === ean; })[0];
      return p ? { p: p, q: panier[ean], total: p.ttc * panier[ean] } : null;
    }).filter(Boolean);
  }

  // Le dernier calcul rendu par le serveur. Tant qu'il n'est pas arrivé,
  // l'affichage reste sur une estimation locale — mais c'est toujours la
  // réponse du serveur qui finit par s'afficher, et c'est elle qui sera
  // débitée.
  var CALCUL = null;
  var enCours = 0;

  function demanderCalcul() {
    var mien = ++enCours;
    fetch("/api/panier-public", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selection: panier })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (mien !== enCours) return;        // une demande plus récente a gagné
        if (!d || d.ok !== true) return;
        CALCUL = d;
        if (d.relais) RELAIS = d.relais;
        dessinerPanier();
      })
      .catch(function () { /* l'estimation locale reste à l'écran */ });
  }

  function majPanier() {
    // Le dernier calcul du serveur porte sur le panier d'AVANT. Le garder
    // à l'écran le temps que la nouvelle réponse arrive, c'est afficher un
    // sous-total périmé pendant une demi-seconde — c'est exactement ce qui
    // donnait l'impression que l'article n'était pas arrivé.
    //
    // On l'oublie donc tout de suite. L'estimation locale prend le relais,
    // et depuis que le serveur calcule lui aussi à partir du prix TTC
    // affiché, les deux tombent sur le même centime : le chiffre ne saute
    // plus quand la réponse arrive, il se confirme.
    CALCUL = null;
    dessinerPanier();
    demanderCalcul();
  }

  function dessinerPanier() {
    var L = lignes();
    var articles = L.reduce(function (s, l) { return s + l.q; }, 0);
    var sous = CALCUL ? CALCUL.sous_total : L.reduce(function (s, l) { return s + l.total; }, 0);
    var port = CALCUL ? CALCUL.port : ((sous === 0 || sous >= FRANCO) ? 0 : PORT);

    $("#compteur").textContent = articles;
    $("#compteur").style.display = articles ? "grid" : "none";

    if (!L.length) {
      $("#panier-corps").innerHTML =
        '<p class="vide">Votre panier est vide.</p>';
    } else {
      $("#panier-corps").innerHTML = L.map(function (l) {
        return '' +
          '<div class="ligne">' +
            '<div class="ligne-img"><img src="/assets/img/products/' + echappe(l.p.image) +
              '" alt="" loading="lazy" /></div>' +
            '<div class="ligne-txt">' +
              '<div class="ligne-nom">' + echappe(l.p.nom_court || l.p.nom) + "</div>" +
              '<div class="ligne-pu">' + euros(l.p.ttc) + " l'unité</div>" +
              '<div class="compte">' +
                '<button data-moins="' + l.p.ean + '" aria-label="Retirer un">−</button>' +
                "<span>" + l.q + "</span>" +
                '<button data-plus="' + l.p.ean + '" aria-label="Ajouter un">+</button>' +
              "</div>" +
            "</div>" +
            '<div class="ligne-tot">' + euros(l.total) + "</div>" +
          "</div>";
      }).join("");
    }

    var pied = '' +
      '<div class="tot-l"><span>Sous-total</span><span>' + euros(sous) + "</span></div>" +
      '<div class="tot-l"><span>Livraison</span><span' + (port === 0 && sous > 0 ? ' class="offert"' : "") +
        ">" + (sous === 0 ? "—" : (port === 0 ? "Offerte" : euros(port))) + "</span></div>";

    if (sous > 0 && sous < FRANCO) {
      var reste = FRANCO - sous;
      pied += '<div class="jauge"><i style="width:' +
              Math.min(100, (sous / FRANCO) * 100).toFixed(1) + '%"></i></div>' +
              '<div class="jauge-txt">Plus que <b>' + euros(reste) +
              "</b> pour la livraison offerte.</div>";
    }

    var total = CALCUL ? CALCUL.total : (sous + port);
    pied += '<div class="tot-l grand"><span>Total</span><span>' + euros(total) + "</span></div>" +
            '<div class="tot-l" style="color:#a4a4a9;font-size:12.5px">' +
              "<span>dont TVA " + Math.round(TVA * 100) + " %</span><span>" +
              euros(CALCUL ? CALCUL.tva : (total - total / (1 + TVA))) + "</span></div>" +
            '<button class="payer"' + (sous ? "" : " disabled") + ' id="payer">' +
              "Commander avec obligation de paiement</button>" +
            '<p class="rassure">Paiement sécurisé Bancontact et carte bancaire.<br>' +
              "Expédition sous 2 jours ouvrables · Retour sous 14 jours</p>";

    $("#panier-pied").innerHTML = pied;
  }

  document.addEventListener("click", function (e) {
    var m = e.target.closest("[data-moins]"), p = e.target.closest("[data-plus]");
    if (m) ajouter(m.dataset.moins, -1);
    if (p) ajouter(p.dataset.plus, 1);
    if (e.target.id === "payer") {
      // Le panier voyage dans le stockage du navigateur ; la page de
      // commande le relit et redemande les montants au serveur.
      window.location.href = "/boutique/commander/";
    }
  });

  // ── ouverture et fermeture des panneaux ─────────────────────────────────
  function ouvrirPanier(ouvert) {
    $("#panier").classList.toggle("on", ouvert);
    $("#voile").classList.toggle("on", ouvert);
  }
  $("#btn-panier").addEventListener("click", function () { ouvrirPanier(true); });
  $("#fermer-panier").addEventListener("click", function () { ouvrirPanier(false); });
  $("#voile").addEventListener("click", function () { ouvrirPanier(false); });

  // La fiche produit a sa propre page depuis l'étape 218 : plus de fenêtre.

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { fermerFiche(); ouvrirPanier(false); }
  });

  // ── toast ───────────────────────────────────────────────────────────────
  var minuteur = null;
  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.add("on");
    clearTimeout(minuteur);
    minuteur = setTimeout(function () { t.classList.remove("on"); }, 2000);
  }
})();
