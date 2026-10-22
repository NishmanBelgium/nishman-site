/* ==========================================================================
   PANIER — ce que coûte réellement une sélection.

   Le navigateur envoie des références et des quantités. Il ne décide ni des
   prix, ni de la remise, ni du port, ni de la TVA : c'est ici que tout est
   recalculé, à partir du catalogue, de la table de prix et du compte.

   C'est la pièce sur laquelle viendront se brancher la page de commande et
   le paiement : le montant débité sera celui que ce point d'entrée a rendu,
   jamais celui qu'un navigateur aura annoncé.
   ========================================================================== */

import { json, erreur, compteConnecte } from "../_commun.js";
import { calculer } from "../_calcul.js";
import { catalogue, tableDePrix } from "../_tarifs.js";

const PAYS_CONNUS = { BE: 1, FR: 1, LU: 1 };

export async function onRequestPost({ request, env }) {
  let corps;
  try { corps = await request.json(); }
  catch (e) { return erreur("Requête illisible.", 400, "illisible"); }

  const selection = (corps && corps.selection) || {};
  if (typeof selection !== "object" || Array.isArray(selection)) {
    return erreur("Requête illisible.", 400, "illisible");
  }

  // Le compte donne le pays et la validité du numéro de TVA : deux choses
  // qu'un visiteur ne peut pas s'attribuer lui-même. Sans session, on
  // calcule quand même — pour afficher un panier — mais on le dit.
  const compte = env.DB ? await compteConnecte(request, env.DB) : null;

  const pays = compte ? compte.pays : (PAYS_CONNUS[corps.pays] ? corps.pays : null);
  const tvaValide = compte ? !!compte.tva_valide : false;

  let produits, prix;
  try {
    [produits, prix] = await Promise.all([catalogue(request), tableDePrix(env)]);
  } catch (e) {
    return json({ ok: false, raison: "indisponible", souci: String(e.message || e) });
  }

  const resultat = calculer({
    selection, produits, prix,
    pays: pays || "BE",
    tvaValide,
    mode: corps.mode === "retrait" ? "retrait" : "livraison",
    promo: corps.promo,
  });

  return json({
    ok: true,
    connecte: !!compte,
    // L'identité telle qu'elle figurera sur le devis. Ce sont les données du
    // compte lui-même, renvoyées à sa propre session : la page de commande
    // les affiche pour que le client vérifie avant de valider.
    compte: compte ? {
      societe: compte.salon || "",
      prenom: compte.prenom || "",
      nom: compte.nom || "",
      email: compte.email || "",
      telephone: compte.telephone || "",
      adresse: compte.adresse || "",
      code_postal: compte.code_postal || "",
      ville: compte.ville || "",
      tva: compte.tva || compte.siret || "",
    } : null,
    // Sans session, le pays est une hypothèse : le montant affiché est
    // indicatif et la page doit le dire. Avec session, il fait foi.
    pays_certain: !!compte,
    pays: pays || "BE",
    ...resultat,
  });
}


export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
