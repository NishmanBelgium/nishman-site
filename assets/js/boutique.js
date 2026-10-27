/* ==========================================================================
   NISHMAN — boutique grand public
   Catalogue, fiche produit et panier. Prix affichés TTC, comme l'exige la
   vente aux particuliers.
   ========================================================================== */
(function () {
  "use strict";

  // Réglages commerciaux — tout se change ici.
  var PORT = 4.9;          // frais de livraison en euros TTC
  var FRANCO = 49;         // au-dessus de ce montant, la livraison est offerte
  var TVA = 0.21;          // TVA belge, applicable tant qu'on reste sous le
                           // seuil de 10 000 EUR de ventes UE à distance

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

  // ── chargement ──────────────────────────────────────────────────────────
  fetch("/assets/data/boutique.json?v=183")
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
    if (n > 0) toast("Ajouté au panier");
  }

  function lignes() {
    return Object.keys(panier).map(function (ean) {
      var p = PRODUITS.filter(function (x) { return x.ean === ean; })[0];
      return p ? { p: p, q: panier[ean], total: p.ttc * panier[ean] } : null;
    }).filter(Boolean);
  }

  function majPanier() {
    var L = lignes();
    var articles = L.reduce(function (s, l) { return s + l.q; }, 0);
    var sous = L.reduce(function (s, l) { return s + l.total; }, 0);
    var port = (sous === 0 || sous >= FRANCO) ? 0 : PORT;

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

    var total = sous + port;
    pied += '<div class="tot-l grand"><span>Total</span><span>' + euros(total) + "</span></div>" +
            '<div class="tot-l" style="color:#a4a4a9;font-size:12.5px">' +
              "<span>dont TVA 21 %</span><span>" + euros(total - total / (1 + TVA)) + "</span></div>" +
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
      toast("Le paiement sera branché à l'étape suivante");
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

  function ouvrirFiche(ean) {
    var p = PRODUITS.filter(function (x) { return x.ean === ean; })[0];
    if (!p) return;
    $("#fiche-img").innerHTML = '<img src="/assets/img/products/' + echappe(p.image) +
                                '" alt="' + echappe(p.nom) + '" />';
    $("#fiche-nom").textContent = p.nom_court || p.nom;
    $("#fiche-vol").textContent = p.volume;
    $("#fiche-prix").textContent = euros(p.ttc);
    $("#fiche-desc").textContent = texte(p, "desc");
    $("#fiche-add").dataset.add = p.ean;
    $("#fiche-add").disabled = !!p.bientot;
    $("#fiche-add").textContent = p.bientot ? "Bientôt disponible" : "Ajouter au panier";
    $("#fiche").classList.add("on");
    document.body.style.overflow = "hidden";
  }
  function fermerFiche() {
    $("#fiche").classList.remove("on");
    document.body.style.overflow = "";
  }
  $("#fiche-retour").addEventListener("click", fermerFiche);
  $("#fiche-add").addEventListener("click", function () {
    ajouter(this.dataset.add, 1);
    fermerFiche();
  });
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
