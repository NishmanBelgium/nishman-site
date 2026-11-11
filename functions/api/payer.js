/* ==========================================================================
   PAYER — la commande, puis le paiement.

   L'ordre compte, et il est volontaire : la commande est créée dans Odoo
   AVANT que le client n'arrive chez Mollie. Un paiement reçu sans commande
   en face est une situation qu'on ne sait pas rattraper proprement — il
   faut retrouver qui a payé quoi, à partir d'un montant et d'une heure. Un
   devis en brouillon sans paiement, à l'inverse, se supprime en un clic.

   Donc : on recalcule tout, on crée le devis, on enregistre le lien entre
   le paiement et ce devis, et seulement ensuite on envoie le client payer.

   Rien de ce que le navigateur annonce n'est cru. Les montants viennent du
   catalogue et de la table de prix, le pays et le régime de TVA viennent
   du compte.
   ========================================================================== */

import { json, erreur, compteConnecte, prolongerSiBesoin, texteValide, paysValide } from "../_commun.js";
import { calculer } from "../_calcul.js";
import { catalogue, tableDePrix } from "../_tarifs.js";
import { controlerSiBesoin } from "../_tva.js";
import { rattraperApresVente } from "../_tva_rattrapage.js";
import { configure as configureOdoo, appel as appelOdoo, aDejaCommande } from "../_odoo.js";
import { creerCommandeOdoo } from "../_commande_odoo.js";
import { origineDuCorps } from "../_utm.js";
import { configureMollie, modeMollie, appelMollie, paiementsAutorises } from "../_mollie.js";
import { enregistrer } from "../_paiements.js";
import { verifierStockPro } from "../_stock.js";
import { avertirSiPlusieursColis } from "../_etiquette.js";
import { selectionAvecCadeau, ruptureDuCadeau } from "../_offre_p1.js";

/** Référence lisible, fabriquée ici : le navigateur n'en choisit pas. */
function reference() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const alea = Math.random().toString(36).slice(2, 5).toUpperCase();
  return "CMD-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + alea;
}

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

/** Mollie veut un montant en chaîne, à deux décimales, point décimal. */
function montantMollie(n) {
  return (Math.round(Number(n) * 100) / 100).toFixed(2);
}

export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  const attendre = (p) => { try { ctx.waitUntil(p); } catch (e) { /* tant pis */ } };
  let corps;
  try { corps = await request.json(); }
  catch (e) { return erreur("Requête illisible.", 400, "illisible"); }

  if (!env.DB) return erreur("Service indisponible.", 503, "indisponible");
  if (!configureOdoo(env)) return erreur("Service de commande indisponible.", 503, "odoo");
  if (!configureMollie(env)) return erreur("Le paiement en ligne n'est pas disponible.", 503, "mollie");
  // Clé de production sans feu vert explicite : on n'encaisse rien. Le
  // client repart sur le devis par virement, qui lui fonctionne.
  if (!paiementsAutorises(env)) return erreur("Le paiement en ligne n'est pas disponible.", 503, "mollie");

  const compte = await compteConnecte(request, env.DB);
  if (!compte) return erreur("Connectez-vous pour commander.", 401, "session");
  await prolongerSiBesoin(env.DB, compte);

  if (corps.cgv !== true) return erreur("Acceptez les conditions de vente.", 400, "cgv");

  const selection = (corps && corps.selection) || {};
  if (typeof selection !== "object" || Array.isArray(selection) || !Object.keys(selection).length) {
    return erreur("Votre panier est vide.", 400, "vide");
  }

  const mode = corps.mode === "retrait" ? "retrait" : "livraison";

  let livraison = null;
  if (mode === "livraison" && corps.livraison_identique !== true) {
    try { livraison = adresseLivraison(corps.livraison); }
    catch (e) {
      const code = String(e.message || e);
      return erreur(
        code === "livraison_absente" ? "Indiquez une adresse de livraison."
                                     : "Adresse de livraison incomplète.",
        400, code);
    }
  }

  let produits, prix;
  try { [produits, prix] = await Promise.all([catalogue(request), tableDePrix(env)]); }
  catch (e) { return erreur("Tarifs momentanément indisponibles.", 503, "tarifs"); }

  let tva = { valide: !!compte.tva_valide, statut: compte.tva_statut || "", preuve: compte.tva_preuve || "" };
  try { tva = await controlerSiBesoin(env.DB, compte, env); }
  catch (e) { /* le registre muet ne doit pas faire perdre la commande */ }

  let stockNonVerifie = null;

  // Le carton offert du Black Friday pro, s'il est gagné : son seuil ne
  // dépend que du montant commandé avant remise, on peut donc le connaître
  // dès maintenant, sans attendre la question du code de bienvenue.
  const offreP1 = calculer({
    selection, produits, prix, pays: compte.pays, tvaValide: tva.valide,
    mode, promo: "", dejaCommande: true, cadeau: corps.cadeau,
  }).offre_p1;

  // Le stock, avant d'engager quoi que ce soit.
  //
  // Le catalogue limite déjà les quantités à l'écran, mais dans le
  // navigateur seulement : un onglet resté ouvert une heure, deux salons
  // sur le dernier carton, et la commande passait quand même. C'est ici
  // que ça se décide, avec le stock d'Odoo au moment présent. Le carton
  // offert y est compté : il sort du même rayon.
  try {
    const stock = await verifierStockPro(env, selectionAvecCadeau(selection, offreP1), produits,
      { attendre: attendre });
    if (ruptureDuCadeau(stock, offreP1)) {
      return json({
        ok: false, motif: "cadeau_stock",
        message: "Le parfum choisi pour vos poudres offertes n'est plus disponible en quantité suffisante. "
               + "Choisissez-en un autre : le reste de votre panier est intact.",
      }, 409);
    }
    if (stock.rupture) {
      return json({
        ok: false, motif: "stock",
        message: "Certaines références ne sont plus disponibles en quantité suffisante. "
               + "Ajustez votre panier, les quantités affichées ont été mises à jour.",
        manquants: stock.manquants,
      }, 409);
    }
  } catch (e) {
    // Lecture impossible : on laisse passer plutôt que d'arrêter la prise
    // de commande. Une panne d'Odoo bloquera de toute façon l'étape
    // suivante, et un défaut de lecture seul ne fait que ramener au
    // comportement d'avant ce lot.
    stockNonVerifie = String((e && e.message) || e).slice(0, 160);
  }

  // Le code de bienvenue ne vaut que pour la première commande, et c'est
  // ici qu'on encaisse : la vérification doit être refaite au moment du
  // paiement, pas seulement à l'affichage du panier. Odoo muet vaut
  // « déjà client » — une remise encaissée à tort ne se reprend pas.
  let dejaCommande = false;
  if (String(corps.promo || "").trim()) {
    try {
      dejaCommande = await aDejaCommande(env, compte.odoo_partner_id);
    } catch (e) {
      dejaCommande = true;
    }
  }

  const resultat = calculer({
    selection, produits, prix,
    pays: compte.pays, tvaValide: tva.valide,
    mode, promo: corps.promo,
    dejaCommande,
    cadeau: corps.cadeau,
  });
  if (!resultat.lignes.length) return erreur("Aucun produit reconnu.", 400, "vide");
  if (!(resultat.total > 0)) return erreur("Le montant à payer est nul.", 400, "montant");

  const ref = reference();

  // 1) La commande, en brouillon, avant le paiement.
  let commande;
  try {
    commande = await creerCommandeOdoo(env, {
      compte, resultat, livraison, ref, tva, origine: origineDuCorps(corps),
    });
  } catch (e) {
    return json({
      ok: false, motif: e && e.code ? e.code : "odoo", ref,
      message: "Votre commande n'a pas pu être enregistrée. Rien ne vous a été débité.",
    }, 502);
  }

  /* L'AVERTISSEMENT « PLUSIEURS COLIS », en arrière-plan.
   *
   * Il demande deux allers-retours à Odoo, et le client attend devant
   * son écran pour aller payer : on ne le lui fait pas payer en
   * secondes. waitUntil laisse le travail se terminer après la réponse.
   * Et s'il échoue, la commande existe quand même — c'est un confort de
   * préparation, pas une condition de vente. */
  attendre(avertirSiPlusieursColis(env, commande.id));

  /* LE RATTRAPAGE DE TVA, en arrière-plan lui aussi.
   *
   * Si le registre européen n'a pas tranché le numéro de ce client, la
   * TVA belge vient d'être appliquée par prudence — c'est le bon réflexe
   * au moment de la vente, et les trois secondes accordées plus haut ne
   * changeront pas : personne ne doit perdre une commande parce qu'un
   * service administratif est engorgé.
   *
   * Mais le client a maintenant sa réponse, et plus personne n'attend.
   * On peut donc reprendre le contrôle avec le temps qu'il faut, et
   * laisser à NBD une liste nommée des factures à régulariser. C'est ce
   * qui a manqué le 6 novembre 2026 : Hair bodega, numéro français
   * valide, refusé par un MS_MAX_CONCURRENT_REQ, facturé TVA comprise,
   * et personne averti. */
  attendre(rattraperApresVente(env.DB, env, compte, {
    ref,
    odoo_nom: commande.nom || "",
    client: compte.salon || compte.email,
    montant: String(resultat.total),
    statut_vente: tva.statut,
    motif_vente: tva.motif,
  }));

  // Un écart entre notre calcul et celui d'Odoo arrête tout. On ne fait pas
  // payer un montant qui ne correspond pas à la commande enregistrée.
  if (commande.ecart !== null && commande.ecart !== 0) {
    try { await appelOdoo(env, "sale.order", "unlink", [[commande.id]], {}); } catch (e) { /* signalé plus bas */ }
    return json({
      ok: false, motif: "ecart", ref,
      message: "Votre commande n'a pas pu être validée. Rien ne vous a été débité.",
    }, 502);
  }

  // 2) Le paiement.
  const origine = new URL(request.url).origin;
  const valeur = montantMollie(resultat.total);
  let paiement;
  try {
    paiement = await appelMollie(env, "/payments", {
      method: "POST",
      body: {
        amount: { currency: "EUR", value: valeur },
        description: "NISHMAN " + (commande.nom || ref),
        redirectUrl: origine + "/commander/?retour=" + encodeURIComponent(ref),
        webhookUrl: origine + "/api/mollie-notification",
        metadata: { ref, odoo_order_id: commande.id, compte_id: compte.id },
      },
    });
  } catch (e) {
    // Le devis existe mais personne ne paiera : on le retire plutôt que de
    // laisser un brouillon orphelin dans Odoo.
    try { await appelOdoo(env, "sale.order", "unlink", [[commande.id]], {}); } catch (e2) { /* rien de plus à faire */ }
    return json({
      ok: false, motif: "mollie", ref,
      message: "Le paiement n'a pas pu être ouvert. Rien ne vous a été débité.",
    }, 502);
  }

  const lien = paiement && paiement._links && paiement._links.checkout && paiement._links.checkout.href;
  if (!paiement || !paiement.id || !lien) {
    try { await appelOdoo(env, "sale.order", "unlink", [[commande.id]], {}); } catch (e) { /* rien de plus */ }
    return json({
      ok: false, motif: "mollie_incomplet", ref,
      message: "Le paiement n'a pas pu être ouvert. Rien ne vous a été débité.",
    }, 502);
  }

  // 3) Le lien entre les deux, écrit AVANT d'envoyer le client payer : la
  //    notification peut arriver pendant qu'il est encore chez sa banque.
  try {
    await enregistrer(env.DB, {
      mollie_id: paiement.id,
      ref,
      compte_id: compte.id,
      odoo_order_id: commande.id,
      odoo_nom: commande.nom || "",
      montant: valeur,
      devise: "EUR",
    });
  } catch (e) {
    return json({
      ok: false, motif: "registre", ref,
      message: "Votre commande n'a pas pu être enregistrée. Rien ne vous a été débité.",
    }, 502);
  }

  return json({
    ok: true,
    ref,
    devis: commande.nom || "",
    paiement_url: lien,
    mode_mollie: modeMollie(env),
    total: resultat.total,
  });
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
