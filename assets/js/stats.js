/* ==========================================================================
   CHIFFRES DU SITE — la page.

   Les graphiques sont dessinés ici, en SVG, sans bibliothèque. Ce n'est
   pas de l'ascèse : la politique de contenu du site n'autorise aucun
   script venu d'ailleurs, et une courbe à deux séries ne justifie pas
   d'ouvrir cette porte.

   Deux graphiques séparés plutôt qu'un seul à deux échelles. Mettre des
   visites et des commandes sur le même cadre obligerait à deux axes
   verticaux, et un double axe permet de faire dire n'importe quoi à deux
   courbes : il suffit de choisir les échelles. Deux cadres superposés
   partagent le même axe du temps et ne mentent pas.
   ========================================================================== */
(function () {
  "use strict";

  /* Les deux couleurs de série, vérifiées pour la vision des couleurs :
     écart de 29 en deutéranopie et protanopie, 36 en vision normale, là
     où le seuil acceptable est 8. L'or du site manque de contraste sur
     fond blanc : c'est pourquoi chaque série porte son nom en légende et
     que les chiffres sont repris en tableau dessous. */
  var OR = "#ED9B24";
  var BLEU = "#1F6FB2";
  var ENCRE = "#0e0e0f";
  var ENCRE_DOUCE = "#6e6e73";
  var TRAIT = "rgba(10,10,10,0.10)";

  var $ = function (s) { return document.querySelector(s); };
  var etat = { jours: 30, vue: "tout", donnees: null };

  function ech(t) {
    return String(t == null ? "" : t)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function nombre(n) {
    return Number(n || 0).toLocaleString("fr-BE");
  }
  function euros(n) {
    // Avec séparateur de milliers : « 1 354,03 € » se lit d'un coup d'œil,
    // « 1354,03 € » demande de compter les chiffres.
    return Number(n || 0).toLocaleString("fr-BE", {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }) + " €";
  }
  function jourCourt(iso) {
    var d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("fr-BE", { day: "numeric", month: "short" });
  }

  /* --- Les cartes de chiffres ------------------------------------------ */

  function evolution(maintenant, avant) {
    if (avant === null || avant === undefined || !isFinite(avant) || avant === 0) {
      return maintenant ? { texte: "nouveau", sens: "hausse" } : null;
    }
    var pct = ((maintenant - avant) / avant) * 100;
    if (Math.abs(pct) < 0.5) return { texte: "stable", sens: "plat" };
    var signe = pct > 0 ? "+" : "−";
    return {
      texte: signe + Math.abs(pct).toFixed(0) + " %",
      sens: pct > 0 ? "hausse" : "baisse",
    };
  }

  function carte(titre, valeur, avant, aide) {
    var e = evolution(typeof valeur === "number" ? valeur : 0, avant);
    return '<article class="st-carte">'
      + '<p class="st-carte-titre">' + ech(titre) + "</p>"
      + '<p class="st-carte-valeur">' + ech(aide ? aide : valeur) + "</p>"
      + (e ? '<p class="st-carte-evo st-' + e.sens + '">' + ech(e.texte)
             + ' <span>vs période précédente</span></p>' : '<p class="st-carte-evo st-plat">—</p>')
      + "</article>";
  }

  /* La vue choisie décide de ce que portent « audience », « commerce » et
     « précédent ». Tout le reste de la page lit ces trois-là et n'a pas à
     savoir de quel côté on regarde. */
  function cote(d) {
    if (etat.vue === "boutique") return d.boutique;
    if (etat.vue === "pro") return d.pro;
    return { audience: d.audience, commerce: d.commerce, precedent: d.precedent };
  }

  function part(n, total) {
    return total ? Math.round((n / total) * 100) : 0;
  }

  function dessinerCartes(d) {
    var k = cote(d), a = k.audience, c = k.commerce, p = k.precedent;
    var taux = c.taux_transformation;
    var tauxTexte = taux === null ? "—" : String(taux).replace(".", ",") + " %";
    var out =
        carte("Visites", a.sessions, p.audience.sessions, nombre(a.sessions))
      + carte("Pages vues", a.vues, p.audience.vues, nombre(a.vues));

    if (etat.vue === "tout") {
      /* Dans la vue d'ensemble, les deux moitiés valent mieux que le
         panier moyen : c'est le chiffre qui dit où porter l'effort. */
      var seg = {}, segAvant = {};
      (a.par_segment || []).forEach(function (s) { seg[s.segment] = Number(s.vues || 0); });
      (p.audience.par_segment || []).forEach(function (s) {
        segAvant[s.segment] = Number(s.vues || 0);
      });
      out += carte("Vues boutique", seg.boutique || 0, segAvant.boutique,
                   nombre(seg.boutique || 0) + " · " + part(seg.boutique || 0, a.vues) + " %")
           + carte("Vues catalogue pro", seg.pro || 0, segAvant.pro,
                   nombre(seg.pro || 0) + " · " + part(seg.pro || 0, a.vues) + " %")
           + carte("Commandes boutique", c.commandes, p.commerce.commandes, nombre(c.commandes))
           + carte("Chiffre boutique", c.chiffre, p.commerce.chiffre, euros(c.chiffre));
    } else if (etat.vue === "pro") {
      out += carte("Comptes créés", d.clients.nouveaux, d.clients.nouveaux_avant,
                   nombre(d.clients.nouveaux))
           + carte("Commandes payées en ligne", c.commandes, p.commerce.commandes,
                   nombre(c.commandes))
           + carte("Chiffre en ligne", c.chiffre, p.commerce.chiffre, euros(c.chiffre))
           + carte("Panier moyen", c.panier_moyen, p.commerce.panier_moyen, euros(c.panier_moyen));
    } else {
      out += carte("Commandes", c.commandes, p.commerce.commandes, nombre(c.commandes))
           + carte("Chiffre d'affaires", c.chiffre, p.commerce.chiffre, euros(c.chiffre))
           + carte("Panier moyen", c.panier_moyen, p.commerce.panier_moyen, euros(c.panier_moyen))
           + carte("Taux de transformation", taux === null ? 0 : taux,
                   p.commerce.taux_transformation, tauxTexte);
    }
    $("#st-cartes").innerHTML = out;
  }

  /* --- Le dessin ------------------------------------------------------- */

  var L = 760, H = 240, MG = 44, MD = 14, MH = 16, MB = 30;

  function cadre(series, max, etiquettes) {
    // La grille et les axes restent en retrait : ils servent à lire, pas
    // à être lus.
    var larg = L - MG - MD, haut = H - MH - MB;
    var out = "";
    var paliers = 4, i;
    for (i = 0; i <= paliers; i++) {
      var v = (max / paliers) * i;
      var y = MH + haut - (haut * (i / paliers));
      out += '<line x1="' + MG + '" y1="' + y.toFixed(1) + '" x2="' + (MG + larg)
           + '" y2="' + y.toFixed(1) + '" stroke="' + TRAIT + '" stroke-width="1" />'
           + '<text x="' + (MG - 8) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end" '
           + 'font-size="11" fill="' + ENCRE_DOUCE + '">' + nombre(Math.round(v)) + "</text>";
    }
    // Quelques dates seulement : une par point donnerait un mur illisible.
    var n = etiquettes.length;
    var pas = Math.max(1, Math.ceil(n / 7));
    for (i = 0; i < n; i += pas) {
      var x = MG + (n === 1 ? larg / 2 : (larg * i) / (n - 1));
      out += '<text x="' + x.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" '
           + 'font-size="11" fill="' + ENCRE_DOUCE + '">' + ech(jourCourt(etiquettes[i])) + "</text>";
    }
    return out;
  }

  function courbes(series, max, n) {
    var larg = L - MG - MD, haut = H - MH - MB, out = "";
    series.forEach(function (s) {
      var pts = s.valeurs.map(function (v, i) {
        var x = MG + (n === 1 ? larg / 2 : (larg * i) / (n - 1));
        var y = MH + haut - (max ? (haut * v) / max : 0);
        return [x, y];
      });
      out += '<polyline fill="none" stroke="' + s.couleur + '" stroke-width="2" '
           + 'stroke-linejoin="round" stroke-linecap="round" points="'
           + pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ")
           + '" />';
      // Un anneau de la couleur du fond isole le point quand deux séries
      // se croisent.
      pts.forEach(function (p, i) {
        if (n > 40 && i % 2) return;
        out += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1)
             + '" r="4" fill="' + s.couleur + '" stroke="#ffffff" stroke-width="2" />';
      });
    });
    return out;
  }

  function zonesSurvol(etiquettes, series, n) {
    var larg = L - MG - MD, out = "";
    var pasX = n > 1 ? larg / (n - 1) : larg;
    for (var i = 0; i < n; i++) {
      var x = MG + (n === 1 ? larg / 2 : pasX * i);
      var titre = jourCourt(etiquettes[i]) + " — "
        + series.map(function (s) { return s.nom + " : " + nombre(s.valeurs[i]); }).join(" · ");
      out += '<rect x="' + (x - pasX / 2).toFixed(1) + '" y="' + MH + '" width="' + pasX.toFixed(1)
           + '" height="' + (H - MH - MB) + '" fill="transparent" class="st-zone">'
           + "<title>" + ech(titre) + "</title></rect>";
    }
    return out;
  }

  function graphiqueCourbe(cible, etiquettes, series) {
    var n = etiquettes.length;
    var max = 0;
    series.forEach(function (s) {
      s.valeurs.forEach(function (v) { if (v > max) max = v; });
    });
    if (!max) max = 1;
    // On arrondit le haut de l'échelle pour que les paliers tombent juste.
    var pas = Math.pow(10, Math.max(0, String(Math.round(max)).length - 2));
    max = Math.ceil(max / (pas * 4)) * pas * 4 || 4;

    $(cible).innerHTML =
      '<svg viewBox="0 0 ' + L + " " + H + '" role="img" '
      + 'aria-label="Évolution sur la période" preserveAspectRatio="xMidYMid meet">'
      + cadre(series, max, etiquettes)
      + courbes(series, max, n)
      + zonesSurvol(etiquettes, series, n)
      + "</svg>";
  }

  function graphiqueBarres(cible, etiquettes, valeurs, couleur, unite) {
    var n = etiquettes.length;
    var max = Math.max.apply(null, valeurs.concat([1]));
    var pas = Math.pow(10, Math.max(0, String(Math.round(max)).length - 2));
    max = Math.ceil(max / (pas * 4)) * pas * 4 || 4;

    var larg = L - MG - MD, haut = H - MH - MB;
    // Deux pixels de fond entre deux barres voisines : elles se touchent
    // sinon et l'œil lit une seule masse.
    var largeur = Math.max(2, (larg / n) - 2);
    var out = cadre(null, max, etiquettes);

    valeurs.forEach(function (v, i) {
      var x = MG + (larg * i) / n + 1;
      var h = max ? (haut * v) / max : 0;
      var y = MH + haut - h;
      if (h > 0) {
        out += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + largeur.toFixed(1)
             + '" height="' + h.toFixed(1) + '" rx="3" fill="' + couleur + '" class="st-barre">'
             + "<title>" + ech(jourCourt(etiquettes[i]) + " — " + nombre(v) + " " + unite)
             + "</title></rect>";
      } else {
        out += '<rect x="' + x.toFixed(1) + '" y="' + (MH + haut - 1) + '" width="' + largeur.toFixed(1)
             + '" height="1" fill="' + TRAIT + '"><title>'
             + ech(jourCourt(etiquettes[i]) + " — aucune") + "</title></rect>";
      }
    });

    $(cible).innerHTML =
      '<svg viewBox="0 0 ' + L + " " + H + '" role="img" '
      + 'aria-label="Commandes par jour" preserveAspectRatio="xMidYMid meet">' + out + "</svg>";
  }

  /* --- Les tableaux ----------------------------------------------------- */

  function tableau(cible, lignes, cleNom, titreCol) {
    if (!lignes || !lignes.length) {
      $(cible).innerHTML = '<p class="st-vide">Rien à montrer sur la période.</p>';
      return;
    }
    var total = lignes.reduce(function (s, l) { return s + Number(l.vues || 0); }, 0) || 1;
    var corps = lignes.map(function (l) {
      var v = Number(l.vues || 0);
      var part = Math.round((v / total) * 100);
      return "<tr><td>" + ech(l[cleNom] || "—") + "</td>"
        + '<td class="st-num">' + nombre(v) + "</td>"
        + '<td class="st-part"><span style="width:' + part + '%"></span>'
        + '<em>' + part + " %</em></td></tr>";
    }).join("");
    $(cible).innerHTML = '<table class="st-table"><thead><tr><th>' + ech(titreCol)
      + '</th><th class="st-num">Vues</th><th>Part</th></tr></thead><tbody>'
      + corps + "</tbody></table>";
  }

  /* --- Les campagnes --------------------------------------------------- */

  /* On classe sur les SESSIONS, pas sur les vues : une campagne qui amène
     dix visiteurs qui lisent une page vaut mieux qu'une qui en amène un
     qui en lit dix. Et on montre où ils atterrissent, parce qu'un lien
     qui dépose les barbiers sur la boutique grand public est un lien mal
     posé — c'est le genre d'erreur qu'on ne voit pas sans ce tableau. */
  function campagnes(d) {
    var zone = $("#st-campagnes");
    var lignes = (d.campagnes && d.campagnes.par_campagne) || [];
    /* Les étiquettes ne sont pas découpées par vue : un même lien peut
       déposer sur la boutique comme sur le catalogue pro. On ne l'affiche
       donc que dans la vue d'ensemble, comme les autres blocs globaux —
       le montrer dans la vue « boutique » laisserait croire à un chiffre
       boutique alors que c'est le chiffre du site. */
    if (etat.vue !== "tout" || !lignes.length) { zone.hidden = true; return; }
    zone.hidden = false;

    var arrivees = {};
    ((d.campagnes && d.campagnes.atterrissage) || []).forEach(function (a) {
      var c = a.campagne;
      if (!arrivees[c] || Number(a.sessions) > Number(arrivees[c].sessions)) arrivees[c] = a;
    });

    var total = lignes.reduce(function (s, l) { return s + Number(l.sessions || 0); }, 0) || 1;
    var corps = lignes.map(function (l) {
      var se = Number(l.sessions || 0);
      var part = Math.round((se / total) * 100);
      var a = arrivees[l.campagne];
      var pages = se ? Math.round((Number(l.vues || 0) / se) * 10) / 10 : 0;
      return "<tr><td><strong>" + ech(l.campagne) + "</strong></td>"
        + '<td class="st-num">' + nombre(se) + "</td>"
        + '<td class="st-num">' + (pages || "—") + "</td>"
        + "<td>" + ech((a && a.chemin) || "—") + "</td>"
        + '<td class="st-part"><span style="width:' + part + '%"></span>'
        + "<em>" + part + " %</em></td></tr>";
    }).join("");

    $("#st-campagnes-corps").innerHTML =
      '<table class="st-table"><thead><tr><th>Étiquette</th>'
      + '<th class="st-num">Visites</th><th class="st-num">Pages / visite</th>'
      + "<th>Arrivée principale</th><th>Part</th></tr></thead><tbody>"
      + corps + "</tbody></table>";
  }

  /* --- La répartition, les portes, les clients ------------------------- */

  var NOMS_SEGMENT = {
    accueil: "Page d'accueil", boutique: "Boutique", pro: "Catalogue professionnel",
    commun: "Pages communes",
  };
  var COULEURS_SEGMENT = {
    accueil: "#6e6e73", boutique: OR, pro: BLEU, commun: "#b9b5ac",
  };

  function repartition(d) {
    var zone = $("#st-repartition");
    var lignes = (d.audience.par_segment || []).filter(function (s) { return Number(s.vues) > 0; });
    if (etat.vue !== "tout" || !lignes.length) { zone.hidden = true; return; }
    zone.hidden = false;
    var total = lignes.reduce(function (s, l) { return s + Number(l.vues); }, 0) || 1;

    /* Une seule barre partagée plutôt que quatre barres côte à côte : la
       question est « quelle part », pas « combien », et une part se lit
       mieux sur un tout que sur une échelle. */
    var barre = lignes.map(function (l) {
      var p = (Number(l.vues) / total) * 100;
      return '<span class="st-segment" style="width:' + p.toFixed(2) + "%;background:"
        + (COULEURS_SEGMENT[l.segment] || "#999") + '" title="'
        + ech((NOMS_SEGMENT[l.segment] || l.segment) + " : " + nombre(l.vues) + " vues")
        + '"></span>';
    }).join("");

    var legende = lignes.map(function (l) {
      return '<span class="st-cle"><i style="background:'
        + (COULEURS_SEGMENT[l.segment] || "#999") + '"></i>'
        + ech(NOMS_SEGMENT[l.segment] || l.segment) + " — "
        + nombre(l.vues) + " vues · " + part(Number(l.vues), total) + " %</span>";
    }).join("");

    $("#st-repartition-barre").innerHTML =
      '<div class="st-barre-partagee">' + barre + "</div>"
      + '<div class="st-legende st-legende-bas">' + legende + "</div>";
  }

  function portes(d) {
    var zone = $("#st-portes");
    if (etat.vue !== "tout") { zone.hidden = true; return; }
    zone.hidden = false;
    var p = d.portes || {};
    var pro = Number(p["porte-pro"] || 0), bout = Number(p["porte-boutique"] || 0);
    var total = pro + bout;

    if (!total) {
      $("#st-portes-corps").innerHTML =
        '<p class="st-vide">Rien encore. Ces deux compteurs ont été posés le '
        + '29 octobre 2026 : les chiffres commenceront à la première visite '
        + "qui suit, pas avant.</p>";
      return;
    }

    $("#st-portes-corps").innerHTML =
      '<div class="st-barre-partagee">'
      + '<span class="st-segment" style="width:' + ((pro / total) * 100).toFixed(2)
      + '%;background:' + BLEU + '"></span>'
      + '<span class="st-segment" style="width:' + ((bout / total) * 100).toFixed(2)
      + '%;background:' + OR + '"></span></div>'
      + '<div class="st-legende st-legende-bas">'
      + '<span class="st-cle"><i style="background:' + BLEU + '"></i>Tarifs professionnels — '
      + nombre(pro) + " clics · " + part(pro, total) + " %</span>"
      + '<span class="st-cle"><i style="background:' + OR + '"></i>Boutique — '
      + nombre(bout) + " clics · " + part(bout, total) + " %</span></div>"
      + '<p class="st-lead">Sur ' + nombre(d.audience.sessions) + " visites, "
      + nombre(total) + " ont poussé l'une des deux portes.</p>";
  }

  function clients(d) {
    var zone = $("#st-clients");
    if (etat.vue === "boutique" || !d.clients) { zone.hidden = true; return; }
    zone.hidden = false;
    var c = d.clients;
    var pays = (c.par_pays || []).map(function (l) {
      return "<tr><td>" + ech(l.pays || "—") + '</td><td class="st-num">'
        + nombre(l.n) + "</td></tr>";
    }).join("");

    $("#st-clients-corps").innerHTML =
      '<p class="st-lead"><b>' + nombre(c.nouveaux) + "</b> compte(s) créé(s) sur la période, "
      + "<b>" + nombre(c.total) + "</b> au total depuis l'ouverture. "
      + "Un salon ouvre un compte avant de commander : cette courbe précède "
      + "les commandes, elle ne les suit pas.</p>"
      + (pays
          ? '<table class="st-table"><thead><tr><th>Pays</th>'
            + '<th class="st-num">Comptes</th></tr></thead><tbody>' + pays + "</tbody></table>"
          : '<p class="st-vide">Aucun compte pour l\'instant.</p>');
  }

  function souffrance(liste) {
    var zone = $("#st-souffrance");
    if (!liste || !liste.length) { zone.hidden = true; return; }
    zone.hidden = false;
    $("#st-souffrance-liste").innerHTML = liste.map(function (c) {
      var ou = c.cote === "pro" ? "professionnel" : "boutique";
      return '<div class="st-bloquee"><p class="st-bloquee-ref">' + ech(c.ref)
        + ' <span>côté ' + ech(ou) + ", arrêtée à l'étape « " + ech(c.etape) + " »</span></p>"
        + '<p class="st-bloquee-note">' + ech(c.note || "—") + "</p></div>";
    }).join("");
  }

  /* --- Le chargement ---------------------------------------------------- */

  function dessiner(d) {
    etat.donnees = d;
    var k = cote(d);

    $("#st-periode").textContent =
      "Du " + jourCourt(d.periode.depuis) + " au " + jourCourt(d.periode.jusqua)
      + " · comparé aux " + d.periode.jours + " jours précédents";

    dessinerCartes(d);

    // L'axe du temps est le même pour les deux graphiques : on le
    // construit une fois, à partir de la période, et pas à partir des
    // jours qui ont des données — un trou doit se voir.
    var jours = [], i;
    var debut = new Date(d.periode.depuis + "T00:00:00");
    for (i = 0; i < d.periode.jours; i++) {
      jours.push(new Date(debut.getTime() + i * 86400000).toISOString().slice(0, 10));
    }
    var parJour = {}, parJourCmd = {};
    (k.audience.par_jour || []).forEach(function (l) { parJour[l.jour] = l; });
    (k.commerce.par_jour || []).forEach(function (l) { parJourCmd[l.jour] = l; });

    var sessions = jours.map(function (j) { return Number((parJour[j] || {}).sessions || 0); });
    var vues = jours.map(function (j) { return Number((parJour[j] || {}).vues || 0); });
    var commandes = jours.map(function (j) { return Number((parJourCmd[j] || {}).commandes || 0); });

    var aucuneVisite = !k.audience.vues;
    $("#st-vide-visites").hidden = !aucuneVisite;
    $("#st-graph-visites").hidden = aucuneVisite;
    $("#st-legende-visites").innerHTML = aucuneVisite ? "" :
        '<span class="st-cle"><i style="background:' + BLEU + '"></i>Visites</span>'
      + '<span class="st-cle"><i style="background:' + OR + '"></i>Pages vues</span>';
    if (!aucuneVisite) {
      graphiqueCourbe("#st-graph-visites", jours, [
        { nom: "Visites", couleur: BLEU, valeurs: sessions },
        { nom: "Pages vues", couleur: OR, valeurs: vues },
      ]);
    }

    var aucuneCmd = !k.commerce.commandes;
    $("#st-vide-commandes").hidden = !aucuneCmd;
    $("#st-graph-commandes").hidden = aucuneCmd;
    if (!aucuneCmd) graphiqueBarres("#st-graph-commandes", jours, commandes, BLEU, "commande(s)");

    /* Le libellé dit ce qui est compté. « Commandes » tout court, dans la
       vue professionnelle, laisserait croire que les devis et les ventes
       au salon y sont — ils sont dans Odoo, pas ici. */
    var titreCmd = document.querySelector("#st-graph-commandes")
      .closest(".st-bloc").querySelector("h2");
    titreCmd.textContent = etat.vue === "pro"
      ? "Commandes professionnelles payées en ligne, par jour"
      : etat.vue === "boutique" ? "Commandes de la boutique, par jour"
      : "Commandes de la boutique, par jour";

    repartition(d);
    portes(d);
    clients(d);

    /* d, pas k : les étiquettes vivent à la racine de la réponse, pas dans
       la tranche de la vue courante. */
    campagnes(d);
    tableau("#st-pages", k.audience.par_chemin, "chemin", "Page");
    tableau("#st-sources", k.audience.par_source, "source", "Source");
    tableau("#st-pays", k.audience.par_pays, "pays", "Pays");
    tableau("#st-appareils", k.audience.par_appareil, "appareil", "Appareil");
    souffrance(d.en_souffrance);
  }

  function charger() {
    $("#st-attente").hidden = false;
    fetch("/api/stats?jours=" + etat.jours, { cache: "no-store" })
      .then(function (r) {
        if (r.status === 404 || r.status === 401 || r.status === 403) {
          $("#st-attente").hidden = true;
          $("#st-refus").hidden = false;
          return null;
        }
        return r.json();
      })
      .then(function (d) {
        if (!d) return;
        $("#st-attente").hidden = true;
        $("#st-corps").hidden = false;
        dessiner(d);
      })
      .catch(function () {
        $("#st-attente").innerHTML = "<p>Les chiffres n'ont pas pu être lus. Réessayez dans un instant.</p>";
      });
  }

  $("#st-filtres").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-jours]");
    if (!b) return;
    etat.jours = Number(b.dataset.jours);
    Array.prototype.forEach.call(this.querySelectorAll("button"), function (x) {
      x.setAttribute("aria-pressed", x === b ? "true" : "false");
    });
    charger();
  });

  /* Changer de vue ne recharge rien : tout est déjà là. Une requête de
     plus pour redessiner des chiffres qu'on tient déjà serait du temps
     d'attente offert à personne. */
  $("#st-vues").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-vue]");
    if (!b) return;
    etat.vue = b.dataset.vue;
    Array.prototype.forEach.call(this.querySelectorAll("button"), function (x) {
      x.setAttribute("aria-pressed", x === b ? "true" : "false");
    });
    if (etat.donnees) dessiner(etat.donnees);
  });

  charger();
})();
