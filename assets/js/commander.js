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
  // Quand le paiement en ligne est disponible, le devis par virement passe
  // au second plan : il reste offert, mais ce n'est plus l'issue par défaut.
  let modeDevisSecondaire = false;

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

  /** Ce que les deux issues — devis et paiement — envoient au serveur. */
  function corpsCommande() {
    const enLivraison = mode() === "livraison";
    const corps = {
      selection: panier,
      mode: mode(),
      promo: promoAppliquee,
      langue: LANG,
      cgv: true,
    };
    if (enLivraison) {
      if (memeAdresse()) corps.livraison_identique = true;
      else corps.livraison = adresseSaisie();
    }
    return corps;
  }

  /** Les deux boutons se tiennent par la main : l'un travaille, l'autre attend. */
  function verrouiller(oui, lequel, libelle) {
    envoiEnCours = oui;
    [["cmd-envoyer", "valid_cta"], ["cmd-payer", "pay_cta"]].forEach(([id, cle]) => {
      const b = $(id);
      if (!b) return;
      b.disabled = oui;
      if (id === lequel) b.textContent = oui ? libelle : t(cle);
      else if (!oui) b.textContent = modeDevisSecondaire && id === "cmd-envoyer"
        ? t("valid_cta_alt") : t(cle);
    });
  }

  /**
   * Payer maintenant.
   *
   * Le panier n'est PAS vidé ici. Le client part chez sa banque et peut
   * renoncer : s'il revient les mains vides, il doit retrouver sa sélection
   * plutôt qu'un panier effacé par une commande qu'il n'a pas passée. C'est
   * la page de retour qui le videra, et seulement sur un paiement reçu.
   */
  async function payer() {
    if (envoiEnCours) return;
    afficherErreur("");

    const err = t("erreurs") || {};
    if (!$("cmd-cgv") || !$("cmd-cgv").checked) { afficherErreur(err.cgv); return; }

    verrouiller(true, "cmd-payer", t("pay_envoi"));

    let d = null;
    try {
      const r = await fetch("/api/payer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpsCommande()),
      });
      d = await r.json();
    } catch (e) { d = null; }

    if (!d) { verrouiller(false); afficherErreur(err.reseau); return; }

    if (d.ok !== true || !d.paiement_url) {
      verrouiller(false);
      const code = d.code || d.motif || "";
      afficherErreur(err[code] || d.message || d.erreur || err.refus);
      if (code === "session") renvoyerVersConnexion();
      return;
    }

    // Le bouton reste verrouillé : on quitte la page. Le déverrouiller
    // laisserait un instant où un second clic créerait un second paiement.
    window.location.href = d.paiement_url;
  }

  function renvoyerVersConnexion(retour) {
    const cible = retour || "/commander/";
    const lien = $("cmd-vers-connexion");
    if (lien) lien.href = "/pro/connexion/?retour=" + encodeURIComponent(cible);
    const inscr = $("cmd-vers-inscription");
    if (inscr) inscr.href = "/pro/connexion/?mode=inscription&retour=" + encodeURIComponent(cible);
    montrer("cmd-tunnel", false);
    montrer("cmd-retour", false);
    montrer("cmd-connexion", true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function envoyer() {
    if (envoiEnCours) return;
    afficherErreur("");

    const err = t("erreurs") || {};

    if (!$("cmd-cgv") || !$("cmd-cgv").checked) { afficherErreur(err.cgv); return; }

    const corps = corpsCommande();

    verrouiller(true, "cmd-envoyer", t("valid_envoi"));

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

    verrouiller(false);

    if (!d) { afficherErreur(err.reseau); return; }

    if (d.ok !== true) {
      // Un code connu donne un message traduit ; sinon on reprend celui du
      // serveur, qui est déjà en français et lisible.
      const code = d.code || d.motif || "";
      afficherErreur(err[code] || d.message || d.erreur || err.refus);
      // Session perdue en route : le panier reste, on renvoie se connecter.
      if (code === "session") renvoyerVersConnexion();
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

  /* --- Le retour de chez la banque ------------------------------------ */

  /* Le rythme des relances, en millisecondes. Serré au début — la chaîne
     aboutit souvent en deux ou trois secondes — puis de plus en plus
     espacé : au-delà d'une minute, ce n'est plus une question d'attente,
     c'est qu'il se passe autre chose, et insister n'y changera rien.

     Chaque appel n'est pas qu'une lecture : le serveur y reprend la suite
     si elle s'est arrêtée. Regarder où en est sa commande la fait donc
     avancer, ce qui est exactement ce qu'on veut d'une page de retour. */
  const RELANCES = [1200, 1800, 2500, 3000, 4000, 5000, 6000, 8000, 10000];

  function dormir(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function peindreRetour({ icone, classe, titre, texte, detail, reprendre, actions }) {
    const ic = $("cmd-retour-icone");
    if (ic) {
      ic.innerHTML = icone;
      ic.className = "done-check cmd-retour-icone" + (classe ? " " + classe : "");
    }
    const ti = $("cmd-retour-titre");
    if (ti) ti.textContent = titre || "";
    const tx = $("cmd-retour-texte");
    if (tx) tx.textContent = texte || "";

    const de = $("cmd-retour-detail");
    if (de) { de.textContent = detail || ""; de.hidden = !detail; }

    montrer("cmd-retour-reprendre", !!reprendre);
    montrer("cmd-retour-actions", !!actions);
    montrer("cmd-retour", true);
  }

  /**
   * Suit un paiement jusqu'à ce qu'on sache quoi en dire.
   *
   * Règle de conduite : on n'annonce JAMAIS un encaissement que le serveur
   * n'a pas confirmé. La page de redirection de Mollie n'est pas une preuve
   * de paiement — le client peut y arriver après avoir renoncé — et le
   * navigateur n'a aucun moyen de savoir. Tant que le serveur dit « en
   * attente », la page dit « en attente ».
   *
   * Et dans ce cas-là, elle ne propose pas de recommencer. Un paiement en
   * cours d'acheminement qu'on repaie, c'est un client débité deux fois pour
   * une seule commande : le pire résultat possible. On préfère un client qui
   * attend un instant à un client remboursé la semaine suivante.
   */
  async function suivreRetour(ref) {
    montrer("cmd-attente", false);

    peindreRetour({
      icone: "&#8230;", classe: "attente",
      titre: t("ret_attente_titre"),
      texte: t("ret_attente_texte"),
    });

    for (let essai = 0; essai <= RELANCES.length; essai++) {
      if (essai > 0) await dormir(RELANCES[essai - 1]);

      let d = null, statutHttp = 0;
      try {
        const r = await fetch("/api/paiement?ref=" + encodeURIComponent(ref)
                              + "&t=" + Date.now(), { cache: "no-store" });
        statutHttp = r.status;
        d = await r.json();
      } catch (e) { d = null; }

      // Session expirée pendant le détour par la banque. Le paiement, lui,
      // a peut-être abouti : on ne touche pas au panier et on fait
      // reconnecter en gardant la référence, pour reprendre ce suivi-ci.
      if (statutHttp === 401) {
        renvoyerVersConnexion("/commander/?retour=" + encodeURIComponent(ref));
        return;
      }

      if (statutHttp === 404) {
        peindreRetour({
          icone: "!", classe: "souci",
          titre: t("ret_inconnu_titre"),
          texte: t("ret_inconnu_texte"),
          actions: true,
        });
        return;
      }

      if (!d || d.ok !== true) continue;   // panne passagère : on relance

      // Payé et traité : c'est fini, et on peut le dire sans réserve.
      if (d.traite === true) {
        viderPanier();
        peindreRetour({
          icone: "&#10003;",
          titre: t("ret_ok_titre"),
          texte: t("ret_ok_texte")(d.devis || d.ref, d.facture || ""),
          detail: t("ret_ok_expedition"),
          actions: true,
        });
        return;
      }

      // Perdu : annulé, expiré ou refusé. Le panier est intact, le devis a
      // été retiré côté Odoo, et la commande peut être reprise telle quelle.
      if (d.perdu === true) {
        peindreRetour({
          icone: "!", classe: "souci",
          titre: t("ret_perdu_titre"),
          texte: t("ret_perdu_texte"),
          reprendre: Object.keys(panier).length > 0,
          actions: true,
        });
        return;
      }

      // Payé, la suite n'est pas terminée. On vide le panier — l'argent est
      // encaissé, la commande existe — et on continue à suivre.
      if (d.statut === "paye") {
        viderPanier();
        peindreRetour({
          icone: "&#10003;",
          titre: t("ret_ok_titre"),
          texte: t("ret_encours_texte"),
        });
      }
    }

    // Les relances sont épuisées. Deux issues, et aucune n'est un échec.
    let dernierEtat = null;
    try {
      const r = await fetch("/api/paiement?ref=" + encodeURIComponent(ref)
                            + "&t=" + Date.now(), { cache: "no-store" });
      dernierEtat = await r.json();
    } catch (e) { /* on tranchera sans */ }

    if (dernierEtat && dernierEtat.statut === "paye") {
      viderPanier();
      peindreRetour({
        icone: "&#10003;",
        titre: t("ret_ok_titre"),
        texte: t("ret_lent_texte"),
        actions: true,
      });
    } else {
      peindreRetour({
        icone: "&#8230;", classe: "attente",
        titre: t("ret_incertain_titre"),
        texte: t("ret_incertain_texte"),
        actions: true,
      });
    }
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
    // Trois réponses possibles, et la deuxième n'est pas un refus du code :
    // c'est une commande trop petite pour y avoir droit. Le dire évite au
    // client de croire que son code est mauvais.
    if (d.promo) msg.textContent = t("promo_ok")(d.promo);
    else if (d.promo_refusee) msg.textContent = t("promo_trop_petit")(d.promo_refusee, d.promo_minimum);
    else msg.textContent = t("promo_non");
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

    const pay = $("cmd-payer");
    if (pay) pay.addEventListener("click", payer);
  }

  /**
   * Met en place les deux issues selon ce que le serveur dit savoir faire.
   *
   * Le bouton de paiement n'existe que si /api/panier annonce la chaîne en
   * service. Une page qui propose de payer et échoue au clic est pire
   * qu'une page qui ne le propose pas : le client a déjà décidé d'acheter
   * quand il découvre la panne.
   */
  function installerPaiement(d) {
    modeDevisSecondaire = d && d.paiement_en_ligne === true;
    montrer("cmd-pay", modeDevisSecondaire);
    if (!modeDevisSecondaire) return;

    // Le devis cesse d'être un bouton : il devient un lien discret, sous
    // la note. Deux pastilles de même taille séparées par un « OU »
    // donnaient à croire qu'il fallait choisir entre deux manières
    // d'acheter, alors que l'une est le chemin normal et l'autre une
    // facilité pour les salons qui paient par virement.
    const ou = document.querySelector(".cmd-pay-ou");
    if (ou) ou.hidden = true;

    const devis = $("cmd-envoyer");
    if (devis) {
      devis.className = "cmd-devis-lien";
      devis.textContent = t("valid_cta_alt");
    }
    const note = $("cmd-valid-note");
    if (note) note.textContent = t("valid_note_alt");
  }

  async function demarrer() {
    appliquerLangue();
    panier = lirePanier();

    // Retour de chez la banque. Ce cas passe avant tout le reste : le
    // panier n'y est pas le sujet, et le tunnel n'a rien à faire là.
    const refRetour = String(new URLSearchParams(window.location.search).get("retour") || "").trim();
    if (refRetour) {
      montrer("cmd-attente", false);
      await suivreRetour(refRetour);
      const reprendre = $("cmd-retour-reprendre");
      if (reprendre) {
        reprendre.addEventListener("click", () => { window.location.href = "/commander/"; });
      }
      return;
    }

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
    installerPaiement(d);
    montrer("cmd-tunnel", true);
    brancher();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", demarrer);
  } else {
    demarrer();
  }
})();
