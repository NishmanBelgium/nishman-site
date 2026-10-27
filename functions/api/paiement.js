/* ==========================================================================
   PAIEMENT — où en est ma commande ?

   Le client revient de chez sa banque avant, souvent, que Mollie ne nous
   ait prévenus. La page de retour a donc besoin de pouvoir demander l'état
   réel, plutôt que d'annoncer un succès qu'elle ne connaît pas.

   On répond à partir de notre registre, et on rafraîchit auprès de Mollie
   au passage : c'est la même vérification que dans la notification, et
   elle évite au client d'attendre devant un écran qui ne bouge pas.

   Un compte ne lit que ses propres paiements. Le filtre porte sur la
   référence ET sur le compte, pas sur la seule référence.
   ========================================================================== */

import { json, erreur, compteConnecte } from "../_commun.js";
import { configureMollie, appelMollie } from "../_mollie.js";
import { lireParRef, majStatut } from "../_paiements.js";

const LISIBLE = {
  ouvert: "en attente",
  paye: "payé",
  annule: "annulé",
  expire: "expiré",
  echoue: "échoué",
};

export async function onRequestGet({ request, env }) {
  if (!env.DB) return erreur("Service indisponible.", 503, "indisponible");

  const compte = await compteConnecte(request, env.DB);
  if (!compte) return erreur("Connectez-vous.", 401, "session");

  const ref = String(new URL(request.url).searchParams.get("ref") || "").trim();
  if (!ref) return erreur("Référence manquante.", 400, "ref");

  let p;
  try { p = await lireParRef(env.DB, ref, compte.id); }
  catch (e) { return erreur("Registre indisponible.", 503, "registre"); }
  if (!p) return erreur("Paiement introuvable.", 404, "inconnu");

  // Un coup d'œil chez Mollie, pour ne pas dépendre du seul message qu'il
  // nous enverra peut-être dans trente secondes.
  let statut = p.statut;
  if (statut === "ouvert" && configureMollie(env)) {
    try {
      const m = await appelMollie(env, "/payments/" + encodeURIComponent(p.mollie_id));
      const etat = String((m && m.status) || "");
      if (etat === "paid") statut = "paye";
      else if (etat === "canceled") statut = "annule";
      else if (etat === "expired") statut = "expire";
      else if (etat === "failed") statut = "echoue";
      if (statut !== p.statut) { try { await majStatut(env.DB, p.mollie_id, statut, null); } catch (e2) {} }
    } catch (e) { /* on répondra ce que dit le registre */ }
  }

  return json({
    ok: true,
    ref: p.ref,
    devis: p.odoo_nom || "",
    montant: p.montant,
    devise: p.devise,
    statut,
    statut_lisible: LISIBLE[statut] || statut,
    // Le traitement (confirmation de la commande) a-t-il eu lieu ?
    traite: !!p.traite_le,
  });
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
