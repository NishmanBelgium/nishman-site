/* ==========================================================================
   BLACK FRIDAY PRO 2026 — le carton de 12 poudres P1 offert dès 300 € HT,
   côté navigateur : l'habillage du site professionnel, le choix du parfum,
   et ce que le panier et la page de commande en montrent.

   CE FICHIER NE DÉCIDE RIEN. Le serveur fait foi (functions/_offre_p1.js) :
   il recalcule le seuil, vérifie le parfum et écrit seul la ligne à 0 €.
   Ce qui est écrit ici ne sert qu'à l'affichage — mais les deux doivent
   dire la même chose, sinon la page promettrait un carton que la commande
   refuserait. TOUTE MODIFICATION ICI DOIT ÊTRE REPORTÉE CÔTÉ SERVEUR.

   Tout s'éteint seul le 30 novembre à 23h59'59 : plus de bannière, plus de
   choix, plus de ligne offerte — rien à retirer.
   ========================================================================== */

(function (w) {
  "use strict";

  var ACTIVE = true;
  // Bruxelles est à UTC+1 en novembre : minuit ici, 23 h la veille en UTC.
  var DEBUT = Date.UTC(2026, 10, 10, 23, 0, 0);   // 11 nov. 00h00
  var FIN   = Date.UTC(2026, 10, 30, 23, 0, 0);   // 30 nov. 23h59'59
  var SEUIL = 300;      // € HT, montant commandé avant remise
  var PIECES = 12;

  var POUDRES = [
    { ean: "8684736671004", parfum: "Sport",         teinte: "#F07F1E" },
    { ean: "8684736670991", parfum: "GumGum",        teinte: "#2F6E6A" },
    { ean: "8684736671011", parfum: "Flaming",       teinte: "#D8352A" },
    { ean: "8684736671028", parfum: "Fresh Look",    teinte: "#9B5BC4" },
    { ean: "8682035088851", parfum: "Light Control", teinte: "#F2B21B" },
  ];
  var IMAGES = "/assets/img/products/";

  var CLE_CHOIX = "nishman_cadeau_p1";
  var CLE_VU = "bfpro2026-vu";
  var REPOS = 24 * 60 * 60 * 1000;

  /* ── Les textes ─────────────────────────────────────────────────────── */

  var T = {
    fr: {
      ticker: "BLACK FRIDAY PRO  ·  12 POUDRES P1 OFFERTES DÈS 300 € HT  ·  ",
      pro: "Pro", grand: "poudres P1 offertes",
      cond: "dès 300 € HT de commande · le parfum au choix",
      dates: "Du 11 au 30 novembre 2026",
      cta: "Voir les poudres P1",
      fin: "Un carton de 12 poudres du même parfum par commande, ajouté gratuitement à votre commande et à votre facture.",
      fermer: "Fermer",
      choixTitre: "C'est gagné !",
      choixSous: "Votre commande atteint 300 € HT : un carton de 12 poudres P1 vous est offert. Choisissez son parfum.",
      plusTard: "Plus tard",
      toast: function (p) { return "12 × P1 " + p + " offertes — ajoutées à votre commande"; },
      manque: function (m) { return "Black Friday pro : plus que " + m + " HT pour recevoir 12 poudres P1 offertes"; },
      offert: function (p) { return "Offert : 12 × P1 " + p; },
      changer: "Changer de parfum",
      aChoisir: "12 poudres P1 offertes : choisissez le parfum",
      btnChoisir: "Choisir mes poudres offertes",
      cmdTitre: "Black Friday pro — 12 poudres P1 offertes",
      cmdChoix: "Choisissez le parfum de votre carton :",
      cmdManque: function (m) { return "Black Friday pro : plus que " + m + " HT pour recevoir 12 poudres P1 offertes."; },
      cmdCompleter: "Compléter mon panier",
      cmdLigne: "Offert — Black Friday pro",
      cmdOffert: "Offert",
      cmdErreurChoix: "Choisissez le parfum de vos 12 poudres offertes avant de valider.",
      cmdFini: function (p) { return "Vos 12 poudres P1 " + p + " offertes sont ajoutées à la commande."; },
      cmdStock: "Ce parfum n'est plus disponible en quantité suffisante : choisissez-en un autre.",
    },
    en: {
      ticker: "BLACK FRIDAY PRO  ·  12 FREE P1 POWDERS FROM €300 EXCL. VAT  ·  ",
      pro: "Pro", grand: "free P1 powders",
      cond: "from €300 excl. VAT per order · scent of your choice",
      dates: "From 11 to 30 November 2026",
      cta: "See the P1 powders",
      fin: "One carton of 12 powders of the same scent per order, added free of charge to your order and your invoice.",
      fermer: "Close",
      choixTitre: "You've unlocked it!",
      choixSous: "Your order has reached €300 excl. VAT: a carton of 12 P1 powders is on us. Pick its scent.",
      plusTard: "Later",
      toast: function (p) { return "12 × P1 " + p + " free — added to your order"; },
      manque: function (m) { return "Black Friday pro: " + m + " excl. VAT more for 12 free P1 powders"; },
      offert: function (p) { return "Free: 12 × P1 " + p; },
      changer: "Change scent",
      aChoisir: "12 free P1 powders: pick the scent",
      btnChoisir: "Pick my free powders",
      cmdTitre: "Black Friday pro — 12 free P1 powders",
      cmdChoix: "Pick the scent of your carton:",
      cmdManque: function (m) { return "Black Friday pro: " + m + " excl. VAT more to get 12 free P1 powders."; },
      cmdCompleter: "Add products",
      cmdLigne: "Free — Black Friday pro",
      cmdOffert: "Free",
      cmdErreurChoix: "Pick the scent of your 12 free powders before confirming.",
      cmdFini: function (p) { return "Your 12 free P1 " + p + " powders are added to the order."; },
      cmdStock: "This scent is no longer available in sufficient quantity: please pick another one.",
    },
    nl: {
      ticker: "BLACK FRIDAY PRO  ·  12 GRATIS P1-POEDERS VANAF € 300 EXCL. BTW  ·  ",
      pro: "Pro", grand: "gratis P1-poeders",
      cond: "vanaf € 300 excl. btw per bestelling · geur naar keuze",
      dates: "Van 11 tot 30 november 2026",
      cta: "Bekijk de P1-poeders",
      fin: "Eén doos van 12 poeders met dezelfde geur per bestelling, gratis toegevoegd aan uw bestelling en uw factuur.",
      fermer: "Sluiten",
      choixTitre: "Gewonnen!",
      choixSous: "Uw bestelling bereikt € 300 excl. btw: een doos van 12 P1-poeders krijgt u gratis. Kies de geur.",
      plusTard: "Later",
      toast: function (p) { return "12 × P1 " + p + " gratis — toegevoegd aan uw bestelling"; },
      manque: function (m) { return "Black Friday pro: nog " + m + " excl. btw voor 12 gratis P1-poeders"; },
      offert: function (p) { return "Gratis: 12 × P1 " + p; },
      changer: "Andere geur",
      aChoisir: "12 gratis P1-poeders: kies de geur",
      btnChoisir: "Kies mijn gratis poeders",
      cmdTitre: "Black Friday pro — 12 gratis P1-poeders",
      cmdChoix: "Kies de geur van uw doos:",
      cmdManque: function (m) { return "Black Friday pro: nog " + m + " excl. btw om 12 gratis P1-poeders te krijgen."; },
      cmdCompleter: "Winkelmand aanvullen",
      cmdLigne: "Gratis — Black Friday pro",
      cmdOffert: "Gratis",
      cmdErreurChoix: "Kies de geur van uw 12 gratis poeders voordat u bevestigt.",
      cmdFini: function (p) { return "Uw 12 gratis P1-poeders " + p + " zijn aan de bestelling toegevoegd."; },
      cmdStock: "Deze geur is niet meer in voldoende hoeveelheid beschikbaar: kies een andere.",
    },
    de: {
      ticker: "BLACK FRIDAY PRO  ·  12 P1-PUDER GRATIS AB 300 € NETTO  ·  ",
      pro: "Pro", grand: "P1-Puder gratis",
      cond: "ab 300 € netto Bestellwert · Duft nach Wahl",
      dates: "Vom 11. bis 30. November 2026",
      cta: "Die P1-Puder ansehen",
      fin: "Ein Karton mit 12 Pudern desselben Dufts pro Bestellung, kostenlos zu Ihrer Bestellung und Rechnung hinzugefügt.",
      fermer: "Schließen",
      choixTitre: "Geschafft!",
      choixSous: "Ihre Bestellung erreicht 300 € netto: Ein Karton mit 12 P1-Pudern geht auf uns. Wählen Sie den Duft.",
      plusTard: "Später",
      toast: function (p) { return "12 × P1 " + p + " gratis — Ihrer Bestellung hinzugefügt"; },
      manque: function (m) { return "Black Friday Pro: noch " + m + " netto bis zu 12 Gratis-P1-Pudern"; },
      offert: function (p) { return "Gratis: 12 × P1 " + p; },
      changer: "Duft ändern",
      aChoisir: "12 P1-Puder gratis: Duft wählen",
      btnChoisir: "Meine Gratis-Puder wählen",
      cmdTitre: "Black Friday Pro — 12 P1-Puder gratis",
      cmdChoix: "Wählen Sie den Duft Ihres Kartons:",
      cmdManque: function (m) { return "Black Friday Pro: noch " + m + " netto bis zu 12 Gratis-P1-Pudern."; },
      cmdCompleter: "Warenkorb ergänzen",
      cmdLigne: "Gratis — Black Friday Pro",
      cmdOffert: "Gratis",
      cmdErreurChoix: "Wählen Sie vor dem Bestätigen den Duft Ihrer 12 Gratis-Puder.",
      cmdFini: function (p) { return "Ihre 12 Gratis-P1-Puder " + p + " sind der Bestellung hinzugefügt."; },
      cmdStock: "Dieser Duft ist nicht mehr in ausreichender Menge verfügbar: Bitte wählen Sie einen anderen.",
    },
    tr: {
      ticker: "BLACK FRIDAY PRO  ·  300 € (KDV HARİÇ) ÜZERİ 12 P1 PUDRA HEDİYE  ·  ",
      pro: "Pro", grand: "P1 pudra hediye",
      cond: "300 € (KDV hariç) üzeri siparişte · koku seçimi sizde",
      dates: "11 – 30 Kasım 2026",
      cta: "P1 pudraları gör",
      fin: "Sipariş başına aynı kokudan 12 pudralık bir koli, siparişinize ve faturanıza ücretsiz eklenir.",
      fermer: "Kapat",
      choixTitre: "Kazandınız!",
      choixSous: "Siparişiniz 300 € (KDV hariç) tutarına ulaştı: 12 P1 pudralık bir koli bizden. Kokusunu seçin.",
      plusTard: "Sonra",
      toast: function (p) { return "12 × P1 " + p + " hediye — siparişinize eklendi"; },
      manque: function (m) { return "Black Friday Pro: 12 P1 pudra hediye için " + m + " (KDV hariç) kaldı"; },
      offert: function (p) { return "Hediye: 12 × P1 " + p; },
      changer: "Kokuyu değiştir",
      aChoisir: "12 P1 pudra hediye: kokuyu seçin",
      btnChoisir: "Hediye pudralarımı seç",
      cmdTitre: "Black Friday Pro — 12 P1 pudra hediye",
      cmdChoix: "Kolinizin kokusunu seçin:",
      cmdManque: function (m) { return "Black Friday Pro: 12 P1 pudra hediye için " + m + " (KDV hariç) kaldı."; },
      cmdCompleter: "Sepeti tamamla",
      cmdLigne: "Hediye — Black Friday Pro",
      cmdOffert: "Hediye",
      cmdErreurChoix: "Onaylamadan önce 12 hediye pudranızın kokusunu seçin.",
      cmdFini: function (p) { return "12 hediye P1 " + p + " pudranız siparişe eklendi."; },
      cmdStock: "Bu koku artık yeterli miktarda yok: lütfen başka bir koku seçin.",
    },
  };

  function langue() {
    var l = "";
    try { l = w.localStorage.getItem("nishman-lang") || ""; } catch (e) { /* stockage refusé */ }
    if (!T[l]) l = String(document.documentElement.lang || "fr").slice(0, 2).toLowerCase();
    return T[l] ? l : "fr";
  }
  function t() { return T[langue()]; }

  /* ── Les outils ─────────────────────────────────────────────────────── */

  function ouverte(maintenant) {
    var x = Number(maintenant || Date.now());
    return ACTIVE && x >= DEBUT && x < FIN;
  }

  function euros(n) { return Number(n).toFixed(2).replace(".", ",") + " €"; }

  function echapper(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function poudre(ean) {
    for (var i = 0; i < POUDRES.length; i++) if (POUDRES[i].ean === String(ean || "")) return POUDRES[i];
    return null;
  }

  function choix() {
    try {
      var e = w.localStorage.getItem(CLE_CHOIX);
      return poudre(e) ? e : "";
    } catch (x) { return ""; }
  }

  function retenir(ean) {
    try {
      if (ean) w.localStorage.setItem(CLE_CHOIX, ean);
      else w.localStorage.removeItem(CLE_CHOIX);
    } catch (x) { /* navigation privée : le choix vivra le temps de la page */ }
    memoire = ean || "";
  }
  var memoire = "";
  function choixCourant() { return choix() || memoire; }

  function img(p, classe) {
    return '<img class="' + classe + '" src="' + IMAGES + p.ean + '.webp" alt="P1 ' + echapper(p.parfum)
      + '" loading="lazy" decoding="async" width="900" height="900" />';
  }

  function ticker(classe) {
    return '<div class="bfp-ticker ' + classe + '" aria-hidden="true"><span>'
      + new Array(6).join(echapper(t().ticker)) + "</span></div>";
  }

  function rangee() {
    return '<div class="bfp-rangee" aria-hidden="true">'
      + POUDRES.map(function (p) { return img(p, "bfp-pot"); }).join("") + "</div>";
  }

  /* ── Le choix du parfum (le « petit pop-up » des 300 € HT) ──────────── */

  var choixOuvert = false;

  function ouvrirChoix(apres) {
    if (!ouverte() || choixOuvert) return;
    fermerIntro();
    choixOuvert = true;
    var x = t();
    var actuel = choixCourant();
    var d = document.createElement("div");
    d.className = "bfp-pop bfp-pop-choix";
    d.setAttribute("role", "dialog");
    d.setAttribute("aria-modal", "true");
    d.setAttribute("aria-label", x.cmdTitre);
    d.innerHTML =
      '<div class="bfp-carte">' +
        ticker("bfp-ticker-haut") +
        '<button class="bfp-fermer" type="button" aria-label="' + echapper(x.fermer) + '">×</button>' +
        '<p class="bfp-surtitre">Black Friday <span>' + echapper(x.pro) + "</span></p>" +
        '<h2 class="bfp-gagne">' + echapper(x.choixTitre) + "</h2>" +
        '<p class="bfp-texte">' + echapper(x.choixSous) + "</p>" +
        '<div class="bfp-parfums">' +
          POUDRES.map(function (p) {
            return '<button type="button" class="bfp-parfum' + (p.ean === actuel ? " est-choisi" : "")
              + '" data-ean="' + p.ean + '" style="--teinte:' + p.teinte + '">'
              + img(p, "bfp-parfum-img")
              + '<span class="bfp-parfum-nom">' + echapper(p.parfum) + "</span></button>";
          }).join("") +
        "</div>" +
        '<button type="button" class="bfp-plus-tard">' + echapper(x.plusTard) + "</button>" +
      "</div>";

    function fermer() {
      choixOuvert = false;
      document.removeEventListener("keydown", clavier);
      if (d.parentNode) d.parentNode.removeChild(d);
      document.body.classList.remove("bfp-bloque");
    }
    function clavier(e) { if (e.key === "Escape" || e.key === "Esc") fermer(); }

    d.querySelector(".bfp-fermer").addEventListener("click", fermer);
    d.querySelector(".bfp-plus-tard").addEventListener("click", fermer);
    d.addEventListener("click", function (e) { if (e.target === d) fermer(); });
    document.addEventListener("keydown", clavier);
    Array.prototype.forEach.call(d.querySelectorAll(".bfp-parfum"), function (b) {
      b.addEventListener("click", function () {
        var ean = b.getAttribute("data-ean");
        retenir(ean);
        fermer();
        annoncer(x.toast(poudre(ean).parfum));
        if (typeof apres === "function") apres(ean);
        diffuser();
      });
    });

    document.body.appendChild(d);
    document.body.classList.add("bfp-bloque");
    var premier = d.querySelector(".bfp-parfum.est-choisi") || d.querySelector(".bfp-parfum");
    if (premier) try { premier.focus({ preventScroll: true }); } catch (e) { premier.focus(); }
  }

  function annoncer(texte) {
    var el = document.getElementById("bfp-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "bfp-toast";
      el.className = "bfp-toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = texte;
    el.classList.add("est-visible");
    clearTimeout(annoncer.minuteur);
    annoncer.minuteur = setTimeout(function () { el.classList.remove("est-visible"); }, 3200);
  }

  /* Ceux qui doivent savoir qu'un parfum a été choisi (le tiroir du
     catalogue, la page de commande) s'abonnent ici. */
  var abonnes = [];
  function diffuser() { abonnes.forEach(function (f) { try { f(choixCourant()); } catch (e) {} }); }

  /* ── Le seuil franchi, dans le catalogue ───────────────────────────── */

  var dernierTotal = null;

  /**
   * Appelée par le catalogue à chaque changement de panier, avec le total
   * HT affiché (avant remise, comme le serveur). Le choix s'ouvre de
   * lui-même au moment où le panier PASSE les 300 € — pas à chaque clic
   * au-delà, et pas si un parfum est déjà choisi.
   */
  function majTotal(total) {
    if (!ouverte() || total === null || total === undefined) { dernierTotal = total; return; }
    var avant = dernierTotal;
    dernierTotal = total;
    if (avant !== null && avant !== undefined && avant < SEUIL && total >= SEUIL && !choixCourant()) {
      setTimeout(function () { ouvrirChoix(); }, 350);
    }
  }

  /**
   * Le bloc du tiroir de sélection. Rend du HTML et branche ses boutons
   * une fois posé : le catalogue l'ajoute sous le total HT.
   */
  function poserDansTiroir(liste, total, rafraichir) {
    if (!liste || !ouverte() || !(total > 0)) return;
    var x = t();
    var html;
    var c = poudre(choixCourant());
    if (total < SEUIL) {
      var part = Math.max(4, Math.min(100, Math.round((total / SEUIL) * 100)));
      html = '<div class="bfp-tiroir bfp-tiroir-manque">'
        + '<span class="bfp-tiroir-txt">' + echapper(x.manque(euros(SEUIL - total))) + "</span>"
        + '<span class="bfp-jauge" aria-hidden="true"><span style="width:' + part + '%"></span></span>'
        + "</div>";
    } else if (c) {
      html = '<div class="bfp-tiroir bfp-tiroir-ok" style="--teinte:' + c.teinte + '">'
        + img(c, "bfp-tiroir-img")
        + '<span class="bfp-tiroir-txt"><strong>' + echapper(x.offert(c.parfum)) + "</strong>"
        + '<button type="button" class="bfp-lien" data-bfp-choisir>' + echapper(x.changer) + "</button></span>"
        + '<span class="bfp-tiroir-prix">0,00 €</span>'
        + "</div>";
    } else {
      html = '<div class="bfp-tiroir bfp-tiroir-choisir">'
        + '<span class="bfp-tiroir-txt"><strong>' + echapper(x.aChoisir) + "</strong></span>"
        + '<button type="button" class="bfp-bouton-mini" data-bfp-choisir>' + echapper(x.btnChoisir) + "</button>"
        + "</div>";
    }
    liste.insertAdjacentHTML("beforeend", html);
    var b = liste.querySelector("[data-bfp-choisir]");
    if (b) b.addEventListener("click", function () { ouvrirChoix(rafraichir); });
  }

  /* ── L'habillage du site professionnel ─────────────────────────────── */

  function vuRecemment() {
    try {
      var v = Number(w.localStorage.getItem(CLE_VU));
      return !!(v && Date.now() - v < REPOS);
    } catch (e) { return true; }   // stockage refusé : pas de pop-up à chaque page
  }
  function noterVu() {
    try { w.localStorage.setItem(CLE_VU, String(Date.now())); } catch (e) { /* tant pis */ }
  }

  function versLesP1() {
    var champ = document.getElementById("search-input");
    if (champ) {
      champ.value = "P1";
      champ.dispatchEvent(new Event("input", { bubbles: true }));
      var grille = document.getElementById("grid");
      if (grille) grille.scrollIntoView({ behavior: "smooth", block: "start" });
      return true;
    }
    return false;
  }

  function banniere() {
    var x = t();
    var s = document.createElement("section");
    s.className = "bfp-banniere";
    s.setAttribute("aria-label", "Black Friday " + x.pro);
    s.innerHTML =
      ticker("bfp-ticker-haut") +
      '<div class="bfp-banniere-corps">' +
        '<div class="bfp-banniere-texte">' +
          '<h2 class="bfp-titre">Black Friday <span>' + echapper(x.pro) + "</span></h2>" +
          '<p class="bfp-offre"><span class="bfp-douze">12</span><span class="bfp-offre-mots">' + echapper(x.grand) + "</span></p>" +
          '<p class="bfp-cond">' + echapper(x.cond) + "</p>" +
          '<p class="bfp-dates">' + echapper(x.dates) + "</p>" +
          '<a class="bfp-bouton" href="/produits/?q=P1">' + echapper(x.cta) + "</a>" +
        "</div>" +
        rangee() +
      "</div>" +
      '<p class="bfp-fin">' + echapper(x.fin) + "</p>" +
      ticker("bfp-ticker-bas");
    var lien = s.querySelector(".bfp-bouton");
    lien.addEventListener("click", function (e) { if (versLesP1()) e.preventDefault(); });
    return s;
  }

  function ruban() {
    var x = t();
    var s = document.createElement("div");
    s.className = "bfp-ruban";
    s.innerHTML = '<p><strong>Black Friday ' + echapper(x.pro) + "</strong> · 12 " + echapper(x.grand)
      + " · " + echapper(x.cond) + "</p>";
    return s;
  }

  var intro = null;
  function fermerIntro() { if (intro && intro.parentNode) intro.parentNode.removeChild(intro); intro = null; }

  function popupIntro() {
    var x = t();
    var d = document.createElement("div");
    d.className = "bfp-pop";
    d.setAttribute("role", "dialog");
    d.setAttribute("aria-modal", "true");
    d.setAttribute("aria-label", "Black Friday " + x.pro);
    d.innerHTML =
      '<div class="bfp-carte">' +
        ticker("bfp-ticker-haut") +
        '<button class="bfp-fermer" type="button" aria-label="' + echapper(x.fermer) + '">×</button>' +
        '<h2 class="bfp-titre">Black Friday <span>' + echapper(x.pro) + "</span></h2>" +
        rangee() +
        '<p class="bfp-offre"><span class="bfp-douze">12</span><span class="bfp-offre-mots">' + echapper(x.grand) + "</span></p>" +
        '<p class="bfp-cond">' + echapper(x.cond) + "</p>" +
        '<p class="bfp-dates">' + echapper(x.dates) + "</p>" +
        '<a class="bfp-bouton" href="/produits/?q=P1">' + echapper(x.cta) + "</a>" +
      "</div>";
    function fermer() { noterVu(); fermerIntro(); document.removeEventListener("keydown", clavier); }
    function clavier(e) { if (e.key === "Escape" || e.key === "Esc") fermer(); }
    d.querySelector(".bfp-fermer").addEventListener("click", fermer);
    d.querySelector(".bfp-bouton").addEventListener("click", function (e) {
      fermer();
      if (versLesP1()) e.preventDefault();
    });
    d.addEventListener("click", function (e) { if (e.target === d) fermer(); });
    document.addEventListener("keydown", clavier);
    return d;
  }

  /* Les hôtes : <div data-bf-pro="catalogue"> reçoit la grande bannière et
     le pop-up d'accueil ; <div data-bf-pro="ruban"> une simple bande. Une
     page sans hôte n'est pas habillée. */
  function habiller() {
    if (!ouverte()) return;
    document.documentElement.setAttribute("data-bf-pro", "1");
    Array.prototype.forEach.call(document.querySelectorAll("[data-bf-pro]"), function (hote) {
      if (hote === document.documentElement || hote.getAttribute("data-bf-pose")) return;
      hote.setAttribute("data-bf-pose", "1");
      var genre = hote.getAttribute("data-bf-pro");
      if (genre === "catalogue") {
        hote.appendChild(banniere());
        if (!vuRecemment()) {
          setTimeout(function () {
            // Jamais deux fenêtres l'une sur l'autre : si le catalogue a
            // déjà ouvert la sienne (accueil, fiche, tiroir), on se tait.
            if (choixOuvert || intro || document.querySelector(".bfp-pop")) return;
            if (document.body.style.overflow === "hidden") return;
            intro = popupIntro();
            document.body.appendChild(intro);
          }, 1200);
        }
      } else if (genre === "ruban") {
        hote.appendChild(ruban());
      }
    });
    // Arrivée par le bouton de la bannière depuis une autre page.
    try {
      if (/(^|[?&])q=P1(&|$)/.test(w.location.search)) setTimeout(versLesP1, 600);
    } catch (e) { /* sans importance */ }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", habiller);
  else habiller();

  w.NishmanP1 = {
    SEUIL: SEUIL,
    PIECES: PIECES,
    POUDRES: POUDRES,
    ouverte: ouverte,
    choix: choixCourant,
    retenir: function (ean) { retenir(poudre(ean) ? ean : ""); diffuser(); },
    oublier: function () { retenir(""); },
    poudre: poudre,
    ouvrirChoix: ouvrirChoix,
    majTotal: majTotal,
    poserDansTiroir: poserDansTiroir,
    surChoix: function (f) { if (typeof f === "function") abonnes.push(f); },
    textes: t,
    image: function (ean) { return IMAGES + ean + ".webp"; },
    euros: euros,
  };
})(window);
