/* ==========================================================================
   COMMANDER — la création d'une commande, côté serveur.

   Jusqu'ici le navigateur postait la demande directement au script Google,
   en « no-cors » : il ne pouvait pas lire la réponse, et considérait donc
   l'absence d'erreur réseau comme un succès. Pour un devis qu'on relit avant
   de facturer, c'était tenable. Pour une commande payée, non : le client
   verrait « envoyé » alors que rien n'existe chez nous.

   Ici la commande part du serveur. On lit la vraie réponse, on la traduit en
   statut exploitable, et surtout on recalcule tous les montants : ce qui est
   enregistré est ce que ce fichier a calculé, jamais ce que le navigateur a
   annoncé.
   ========================================================================== */

import { json, erreur, compteConnecte, prolongerSiBesoin, texteValide, paysValide } from "../_commun.js";
import { calculer } from "../_calcul.js";
import { catalogue, tableDePrix } from "../_tarifs.js";
import { controlerSiBesoin } from "../_tva.js";
import { positionFiscale } from "../_fiscal.js";
import { verifierStockPro } from "../_stock.js";

const PAYS_NOM = { BE: "Belgique", FR: "France", LU: "Luxembourg" };

/** Référence lisible, fabriquée ici : le navigateur n'en choisit pas. */
function reference() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const alea = Math.random().toString(36).slice(2, 5).toUpperCase();
  return "CMD-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + alea;
}

/**
 * L'adresse de livraison, quand elle diffère de l'adresse de facturation.
 *
 * Volontairement sans valeur par défaut : une commande en livraison doit
 * soit porter une adresse complète, soit déclarer explicitement qu'elle
 * reprend celle de facturation. Sans ce choix affirmé, un champ oublié par
 * la page suffirait à expédier une palette à la mauvaise adresse sans que
 * personne ne s'en aperçoive.
 */
function adresseLivraison(brut) {
  if (!brut || typeof brut !== "object") throw new Error("livraison_absente");

  const champs = {
    nom: String(brut.nom || "").trim(),
    adresse: String(brut.adresse || "").trim(),
    code_postal: String(brut.code_postal || "").trim(),
    ville: String(brut.ville || "").trim(),
    pays: String(brut.pays || "").trim().toUpperCase(),
  };

  if (!texteValide(champs.nom, 2, 120)) throw new Error("livraison_nom");
  if (!texteValide(champs.adresse, 4, 200)) throw new Error("livraison_adresse");
  if (!texteValide(champs.code_postal, 3, 12)) throw new Error("livraison_cp");
  if (!texteValide(champs.ville, 2, 80)) throw new Error("livraison_ville");
  if (!paysValide(champs.pays)) throw new Error("livraison_pays");

  return champs;
}

/**
 * Ce que le script Google attend. On garde exactement les clés qu'il lit
 * déjà : le script reste inchangé, c'est le chemin qui change.
 */
function chargeUtile({ ref, compte, resultat, langue, livraison, tva, env }) {
  const pays = PAYS_NOM[compte.pays] || "Belgique";
  return {
    type: "order",
    ref,
    date: new Date().toISOString(),
    lang: langue,
    client: {
      first: compte.prenom || "",
      last: compte.nom || "",
      company: compte.salon || "",
      vat: compte.tva || compte.siret || "",
      email: compte.email || "",
      phone: compte.telephone || "",
      street: compte.adresse || "",
      zip: compte.code_postal || "",
      city: compte.ville || "",
      country: pays,
      // L'adresse de livraison ne voyage que si elle diffère : le script
      // la reporte en note, et vous la voyez sur le devis Odoo.
      shipTo: livraison
        ? [livraison.nom, livraison.adresse,
           livraison.code_postal + " " + livraison.ville,
           PAYS_NOM[livraison.pays] || livraison.pays].join(", ")
        : "",
    },
    total: resultat.marchandise.toFixed(2),
    subTotal: resultat.sous_total.toFixed(2),
    shipping: resultat.port.toFixed(2),
    pickup: resultat.retrait ? "1" : "",
    promo: resultat.promo || "",
    discountRate: resultat.promo ? "10" : "",
    discount: resultat.remise.toFixed(2),
    currency: "EUR",
    // Le régime arrêté par le site. Odoo doit facturer ce que le client a lu,
    // et non le redéduire de son côté avec d'autres règles.
    vatRegime: resultat.regime,
    // Le nom exact de la position fiscale à poser sur le devis Odoo.
    fiscalPosition: positionFiscale(resultat.regime, env),
    vatRate: String(Math.round((resultat.taux_tva || 0) * 100)),
    vatAmount: resultat.tva.toFixed(2),
    grandTotal: resultat.total.toFixed(2),
    viesStatus: (tva && tva.statut) || "",
    viesProof: (tva && tva.preuve) || "",
    lines: resultat.lignes.map((l) => ({
      ean: l.ean,
      name: l.nom,
      units: l.unites,
      boxes: l.cartons,
      boxQty: l.par_carton,
      pieces: l.pieces,
      unitPrice: l.prix_unitaire.toFixed(2),
      subtotal: l.total.toFixed(2),
    })),
  };
}

/**
 * La réponse du script, telle qu'elle est aujourd'hui : du texte, « ok »
 * suivi de ce qu'Odoo a dit. On en tire un statut plutôt que de supposer.
 *
 * Fragile par nature — c'est une lecture de chaîne. Elle sera remplacée par
 * une réponse JSON du script quand nous toucherons au paiement ; d'ici là,
 * lire ce texte vaut toujours mieux que de ne rien lire du tout.
 */
function lireReponse(texte) {
  const t = String(texte || "");
  if (!t) return { ok: false, motif: "muet" };
  if (/^error:/i.test(t)) return { ok: false, motif: "refus", detail: t.slice(0, 300) };
  if (t.indexOf("ERREUR ODOO") >= 0) return { ok: false, motif: "odoo", detail: t.slice(0, 300) };

  // Le numéro de devis, quand le script l'a renvoyé (« ok devis S00161 … »).
  const m = t.match(/\bS\d{5,}\b/);
  const partiel = t.indexOf("PDF NON ENVOY") >= 0 || t.indexOf("NON RECONNU") >= 0;
  return { ok: true, devis: m ? m[0] : "", partiel, detail: t.slice(0, 300) };
}

export async function onRequestPost({ request, env }) {
  let corps;
  try { corps = await request.json(); }
  catch (e) { return erreur("Requête illisible.", 400, "illisible"); }

  // 1) Un compte, actif, et lui seul : c'est la seule chose qui distingue
  //    une commande d'une demande de prix.
  if (!env.DB) return erreur("Service indisponible.", 503, "indisponible");
  const compte = await compteConnecte(request, env.DB);
  if (!compte) return erreur("Connectez-vous pour commander.", 401, "session");
  await prolongerSiBesoin(env.DB, compte);

  // 2) Les conditions de vente : acceptées explicitement, ou rien.
  if (corps.cgv !== true) return erreur("Acceptez les conditions de vente.", 400, "cgv");

  const selection = (corps && corps.selection) || {};
  if (typeof selection !== "object" || Array.isArray(selection) || !Object.keys(selection).length) {
    return erreur("Votre panier est vide.", 400, "vide");
  }

  const mode = corps.mode === "retrait" ? "retrait" : "livraison";

  let livraison = null;
  if (mode === "livraison") {
    if (corps.livraison_identique === true) {
      // Le client a coché « même adresse » : on livre à l'adresse du compte,
      // et c'est un choix, pas un repli.
      livraison = null;
    } else {
      try { livraison = adresseLivraison(corps.livraison); }
      catch (e) {
        const code = String(e.message || e);
        return erreur(
          code === "livraison_absente"
            ? "Indiquez une adresse de livraison."
            : "Adresse de livraison incomplète.",
          400, code);
      }
    }
  }

  // 3) Les montants : recalculés ici, à partir du catalogue et de la table
  //    de prix. Le pays et la validité du numéro de TVA viennent du compte,
  //    pas du formulaire : personne ne s'attribue l'autoliquidation.
  let produits, prix;
  try {
    [produits, prix] = await Promise.all([catalogue(request), tableDePrix(env)]);
  } catch (e) {
    return erreur("Tarifs momentanément indisponibles.", 503, "tarifs");
  }

  // Le régime de TVA est arrêté ici, au moment qui engage. Le contrôle n'est
  // relancé que s'il date : l'autoliquidation doit se justifier à la date de
  // la vente, pas à celle de l'inscription.
  let tva = { valide: !!compte.tva_valide, statut: compte.tva_statut || "", preuve: compte.tva_preuve || "" };
  try { tva = await controlerSiBesoin(env.DB, compte, env); }
  catch (e) { /* le registre muet ne doit pas faire perdre la commande */ }

  // Le stock, avant d'engager quoi que ce soit.
  //
  // Le catalogue limite déjà les quantités à l'écran, mais dans le
  // navigateur seulement : un onglet resté ouvert une heure, deux salons
  // sur le dernier carton, et la commande passait quand même. C'est ici
  // que ça se décide, avec le stock d'Odoo au moment présent.
  try {
    const stock = await verifierStockPro(env, selection, produits);
    if (stock.rupture) {
      return json({
        ok: false, motif: "stock",
        message: "Certaines références ne sont plus disponibles en quantité suffisante. "
               + "Ajustez votre panier, les quantités affichées ont été mises à jour.",
        manquants: stock.manquants,
      }, 409);
    }
  } catch (e) {
    return erreur("Nous ne pouvons pas vérifier les stocks en ce moment. Réessayez dans un instant.",
                  503, "stock");
  }

  const resultat = calculer({
    selection, produits, prix,
    pays: compte.pays, tvaValide: tva.valide,
    mode, promo: corps.promo,
  });

  if (!resultat.lignes.length) return erreur("Aucun produit reconnu.", 400, "vide");

  // 4) Envoi, lu pour de vrai.
  const url = env.PORTIER_URL || env.ORDER_LOG_URL;
  if (!url) return erreur("Service de commande non configuré.", 503, "registre");

  const ref = reference();
  const langue = ["fr", "en", "nl", "de", "tr"].includes(corps.langue) ? corps.langue : "fr";
  const charge = chargeUtile({ ref, compte, resultat, langue, livraison, tva, env });

  let reponse;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(charge),
    });
    reponse = lireReponse(await r.text());
  } catch (e) {
    reponse = { ok: false, motif: "injoignable", detail: String(e.message || e) };
  }

  if (!reponse.ok) {
    // Rien n'a été encaissé à ce stade : on le dit franchement plutôt que
    // d'afficher une confirmation qui n'en est pas une.
    return json({
      ok: false, motif: reponse.motif, ref,
      message: "Votre commande n'a pas pu être enregistrée. Rien ne vous a été débité.",
    }, 502);
  }

  return json({
    ok: true,
    ref,
    devis: reponse.devis || "",
    partiel: !!reponse.partiel,
    email: compte.email,
    ...resultat,
  });
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
