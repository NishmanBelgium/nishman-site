/* ==========================================================================
   COMMANDER — le tunnel de commande.

   Règle unique de ce fichier : il n'additionne rien. Pas un prix, pas un
   port, pas une TVA. Chaque montant affiché vient de /api/panier, et le
   montant engagé vient de /api/commander. La page ne fait que montrer et
   transmettre.

   C'est volontairement moins « réactif » qu'un calcul local — chaque
   changement de mode coûte un aller-retour — mais c'est la seule façon
   d'avoir la certitude que ce que le client lit est ce qu'il paiera.
   ========================================================================== */

(function () {
  "use strict";

  const SEL_KEY = "nishman_selection_v1";
  const SEL_KEYS_FALLBACK = ["nishman-selection", "nishman_selection"];
  const LANG_KEY = "nishman-lang";
  const LANGS = ["fr", "en", "nl", "de", "tr"];

  const stocke = (() => { try { return localStorage.getItem(LANG_KEY); } catch (e) { return null; } })();
  const LANG = LANGS.includes(stocke) ? stocke : "fr";

  const DICOS = window.NISHMAN_CMD_LANGUES || {};
  const T = DICOS[LANG] || DICOS.fr || {};
  const FR = DICOS.fr || {};

  /** Un texte, avec repli sur le français puis sur la clé. */
  function t(cle) {
    if (T[cle] !== undefined) return T[cle];
    if (FR[cle] !== undefined) return FR[cle];
    return "";
  }

  function $(id) { return document.getElementById(id); }
  function montrer(id, oui) { const e = $(id); if (e) e.hidden = !oui; }

  function euros(v) {
    return Number(v).toFixed(2).replace(".", ",") + " €";
  }

  function echapper(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* --- Le panier, tel que le catalogue l'a laissé --------------------- */

  function lirePanier() {
    const cles = [SEL_KEY].concat(SEL_KEYS_FALLBACK);
    for (const k of cles) {
      try {
        const brut = localStorage.getItem(k);
        if (!brut) continue;
        const d = JSON.parse(brut);
        if (d && typeof d === "object" && Object.keys(d).length) return d;
      } catch (e) { /* clé illisible : on essaie la suivante */ }
    }
    return {};
  }

  function viderPanier() {
    [SEL_KEY].concat(SEL_KEYS_FALLBACK).forEach((k) => {
      try { localStorage.removeItem(k); } catch (e) {}
    });
  }

  /* --- État de la page ------------------------------------------------ */

  let panier = {};
  let dernier = null;       // le dernier calcul rendu par le serveur
  let promoAppliquee = "";
  let envoiEnCours = false;

  function mode() {
    const choisi = document.querySelector('input[name="cmd-mode"]:checked');
    return choisi && choisi.value === "retrait" ? "retrait" : "livraison";
  }

  function memeAdresse() {
    const c = $("cmd-meme-adresse");
    return !c || c.checked;
  }

  function adresseSaisie() {
    return {
      nom: ($("liv-nom") || {}).value || "",
      adresse: ($("liv-adresse") || {}).value || "",
      code_postal: ($("liv-cp") || {}).value || "",
      ville: ($("liv-ville") || {}).value || "",
      pays: ($("liv-pays") || {}).value || "BE",
    };
  }

  /* --- Les textes statiques ------------------------------------------- */

  function appliquerLangue() {
    document.documentElement.lang = LANG;
    document.querySelectorAll("[data-t]").forEach((el) => {
      const v = t(el.getAttribute("data-t"));
      if (typeof v === "string" && v) el.textContent = v;
    });
    document.querySelectorAll("[data-t-html]").forEach((el) => {
      const cle = el.getAttribute("data-t-html");
      const v = t(cle + "_html") || t(cle);
      if (typeof v === "string" && v) el.innerHTML = v;
    });
  }

  /* --- Le calcul, demandé au serveur ---------------------------------- */

  async function recalculer() {
    const corps = {
      selection: panier,
      mode: mode(),
      promo: promoAppliquee,
      langue: LANG,
    };

    let r, d;
    try {
      r = await fetch("/api/panier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      d = await r.json();
    } catch (e) {
      afficherErreur((t("erreurs") || {}).reseau);
      return null;
    }

    if (!d || d.ok !== true) {
      afficherErreur((t("erreurs") || {}).tarifs || "");
      return null;
    }

    dernier = d;
    return d;
  }

  /* --- L'affichage ---------------------------------------------------- */

  function rendreIdentite(d) {
    const c = d.compte || {};
    const morceaux = [
      c.societe || "",
      [c.prenom, c.nom].filter(Boolean).join(" "),
      c.email || "",
      [c.adresse, [c.code_postal, c.ville].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      c.tva || "",
    ].filter(Boolean);
    const el = $("cmd-ident");
    if (el) el.innerHTML = morceaux.map(echapper).join("<br />");

    const fact = $("cmd-adresse-facture");
    if (fact) {
      fact.innerHTML = [c.adresse, [c.code_postal, c.ville].filter(Boolean).join(" ")]
        .filter(Boolean).map(echapper).join("<br />");
    }
  }

  function rendreLignes(d) {
    const corps = $("cmd-lignes");
    if (!corps) return;
    corps.innerHTML = (d.lignes || []).map((l) => {
      const detail = l.cartons
        ? l.unites
          ? l.unites + " + " + l.cartons + " × " + l.par_carton
          : l.cartons + " × " + l.par_carton
        : String(l.unites);
      return "<tr>"
        + '<td>' + echapper(l.nom) + '<small class="cmd-detail">' + echapper(detail) + "</small></td>"
        + '<td class="num">' + l.pieces + "</td>"
        + '<td class="num">' + euros(l.prix_unitaire) + "</td>"
        + '<td class="num">' + euros(l.total) + "</td>"
        + "</tr>";
    }).join("");

    const n = (d.ignorees || []).length;
    const el = $("cmd-ecartees");
    if (el) {
      el.hidden = !n;
      if (n) el.textContent = t("ecartees")(n);
    }
  }

  function rendreTotaux(d) {
    const txt = (id, v) => { const e = $(id); if (e) e.textContent = v; };

    txt("tot-sous", euros(d.sous_total));

    montrer("row-remise", d.remise > 0);
    if (d.remise > 0) {
      txt("lab-remise", t("tot_remise") + (d.promo ? " (" + d.promo + ")" : ""));
      txt("tot-remise", "− " + euros(d.remise));
    }

    txt("tot-port", d.retrait ? euros(0) : (d.port > 0 ? euros(d.port) : t("port_offert")));
    txt("lab-port", d.retrait ? t("recep_retrait") : t("tot_port"));

    txt("lab-tva", t("tva_label") + (d.taux_tva ? " " + Math.round(d.taux_tva * 100) + " %" : ""));
    txt("tot-tva", euros(d.tva));
    txt("tot-total", euros(d.total));

    // Ce qui manque pour le franco de port : une information, pas un blocage.
    const manque = $("cmd-port-manque");
    if (manque) {
      const afficher = !d.retrait && d.port > 0 && d.port_manque > 0;
      manque.hidden = !afficher;
      if (afficher) {
        manque.textContent = t("port_manque")(
          Number(d.port_manque).toFixed(2).replace(".", ","), d.port_seuil);
      }
    }

    const regle = $("cmd-port-regle");
    if (regle && d.port_seuil) {
      const forfait = d.port > 0 ? d.port : (d.pays === "BE" ? 10 : 15);
      regle.textContent = t("port_regle")(d.port_seuil, forfait);
    }

    const reg = $("cmd-regime");
    if (reg) {
      if (d.regime === "intracom") { reg.hidden = false; reg.textContent = t("regime_intracom"); }
      else if (d.regime === "intracom_sans_tva") { reg.hidden = false; reg.textContent = t("regime_sans_tva"); }
      else reg.hidden = true;
    }
  }

  function rendre(d) {
    rendreIdentite(d);
    rendreLignes(d);
    rendreTotaux(d);
    montrer("cmd-livraison-zone", !d.retrait);
  }

  function afficherErreur(message) {
    const el = $("cmd-erreur");
    if (!el) return;
    if (!message) { el.hidden = true; return; }
    el.textContent = message;
    el.hidden = false;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /* --- L'envoi -------------------------------------------------------- */

  async function envoyer() {
    if (envoiEnCours) return;
    afficherErreur("");

    const err = t("erreurs") || {};

    if (!$("cmd-cgv") || !$("cmd-cgv").checked) { afficherErreur(err.cgv); return; }

    const enLivraison = mode() === "livraison";
    const identique = enLivraison && memeAdresse();

    const corps = {
      selection: panier,
      mode: mode(),
      promo: promoAppliquee,
      langue: LANG,
      cgv: true,
    };
    if (enLivraison) {
      if (identique) corps.livraison_identique = true;
      else corps.livraison = adresseSaisie();
    }

    envoiEnCours = true;
    const btn = $("cmd-envoyer");
    if (btn) { btn.disabled = true; btn.textContent = t("valid_envoi"); }

    let d = null;
    try {
      const r = await fetch("/api/commander", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      d = await r.json();
    } catch (e) {
      d = null;
    }

    envoiEnCours = false;
    if (btn) { btn.disabled = false; btn.textContent = t("valid_cta"); }

    if (!d) { afficherErreur(err.reseau); return; }

    if (d.ok !== true) {
      // Un code connu donne un message traduit ; sinon on reprend celui du
      // serveur, qui est déjà en français et lisible.
      const code = d.code || d.motif || "";
      afficherErreur(err[code] || d.message || d.erreur || err.refus);
      // Session perdue en route : le panier reste, on renvoie se connecter.
      if (code === "session") {
        const lien = $("cmd-vers-connexion");
        if (lien) lien.href = "/pro/connexion/?retour=" + encodeURIComponent("/commander/");
        montrer("cmd-tunnel", false);
        montrer("cmd-connexion", true);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }

    // Enregistrée : le panier n'a plus de raison d'être.
    viderPanier();
    const texte = $("cmd-fini-texte");
    if (texte) texte.textContent = t("fini_texte")(d.ref, d.email || "");
    montrer("cmd-fini-partiel", !!d.partiel);
    if (d.partiel) {
      const p = $("cmd-fini-partiel");
      if (p) p.textContent = t("fini_partiel");
    }
    montrer("cmd-tunnel", false);
    montrer("cmd-fini", true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* --- Le code promo -------------------------------------------------- */

  async function appliquerPromo() {
    const saisi = (($("cmd-promo") || {}).value || "").trim();
    promoAppliquee = saisi;
    const d = await recalculer();
    if (!d) return;
    rendre(d);

    const msg = $("cmd-promo-msg");
    if (!msg) return;
    if (!saisi) { msg.hidden = true; return; }
    msg.hidden = false;
    msg.textContent = d.promo ? t("promo_ok")(d.promo) : t("promo_non");
  }

  /* --- Mise en route -------------------------------------------------- */

  function brancher() {
    document.querySelectorAll('input[name="cmd-mode"]').forEach((r) => {
      r.addEventListener("change", async () => {
        const d = await recalculer();
        if (d) rendre(d);
      });
    });

    const meme = $("cmd-meme-adresse");
    if (meme) {
      meme.addEventListener("change", () => {
        montrer("cmd-autre-adresse", !meme.checked);
      });
    }

    const bp = $("cmd-promo-btn");
    if (bp) bp.addEventListener("click", appliquerPromo);

    const champPromo = $("cmd-promo");
    if (champPromo) {
      champPromo.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); appliquerPromo(); }
      });
    }

    const envoi = $("cmd-envoyer");
    if (envoi) envoi.addEventListener("click", envoyer);
  }

  async function demarrer() {
    appliquerLangue();
    panier = lirePanier();

    if (!Object.keys(panier).length) {
      montrer("cmd-attente", false);
      montrer("cmd-vide", true);
      return;
    }

    const d = await recalculer();
    montrer("cmd-attente", false);

    if (!d) { montrer("cmd-vide", true); return; }

    // Pas de session : on garde le panier et on envoie se connecter, avec le
    // retour vers cette page pour ne pas perdre le fil.
    if (!d.connecte) {
      const lien = $("cmd-vers-connexion");
      if (lien) lien.href = "/pro/connexion/?retour=" + encodeURIComponent("/commander/");
      const inscr = $("cmd-vers-inscription");
      if (inscr) inscr.href = "/pro/connexion/?mode=inscription&retour=" + encodeURIComponent("/commander/");
      montrer("cmd-connexion", true);
      return;
    }

    if (!d.lignes || !d.lignes.length) { montrer("cmd-vide", true); return; }

    rendre(d);
    montrer("cmd-tunnel", true);
    brancher();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", demarrer);
  } else {
    demarrer();
  }
})();
