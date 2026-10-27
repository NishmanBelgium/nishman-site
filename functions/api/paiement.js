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
import { configure as configureOdoo } from "../_odoo.js";
import { configureMollie, appelMollie } from "../_mollie.js";
import { lireParRef, lire, majStatut, prendreLaMain, rendreLaMain } from "../_paiements.js";
import { poursuivre } from "../_apres_paiement.js";

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

  // La reprise. Si la notification de Mollie s'est perdue, ou si la suite
  // s'est arrêtée en chemin, c'est ici qu'elle repart — au moment même où
  // le client regarde où en est sa commande. Une chaîne qui ne dépend pas
  // d'un seul déclencheur est une chaîne qui finit par aboutir.
  let etape = String(p.etape || "rien");
  if (statut === "paye" && etape !== "fini" && configureOdoo(env)) {
    let aLaMain = false;
    try { aLaMain = await prendreLaMain(env.DB, p.mollie_id); } catch (e) {}
    if (aLaMain) {
      try {
        const frais = await lire(env.DB, p.mollie_id);
        await poursuivre(env, env.DB, { ...(frais || p), statut: "paye" });
      } catch (e) { /* l'état renvoyé restera celui du registre */ }
      finally { try { await rendreLaMain(env.DB, p.mollie_id); } catch (e2) {} }

      // On relit APRÈS avoir avancé. Sans cela, la réponse décrit l'état
      // d'avant : l'étape atteinte serait juste, mais la facture et la note
      // dateraient de la tentative précédente — et on lirait « interrompue »
      // sur une chaîne qui vient d'aboutir.
      try {
        const apres = await lire(env.DB, p.mollie_id);
        if (apres) p = apres;
        etape = String(p.etape || etape);
      } catch (e) { /* on gardera ce qu'on a */ }
    }
  }

  return json({
    ok: true,
    ref: p.ref,
    devis: p.odoo_nom || "",
    montant: p.montant,
    devise: p.devise,
    statut,
    statut_lisible: LISIBLE[statut] || statut,
    etape,
    facture: p.facture_nom || "",
    // Ce que la chaîne a écrit en chemin : utile quand elle s'est arrêtée,
    // et c'est la commande du client lui-même qui est décrite.
    note: p.note || "",
    // La suite est-elle allée jusqu'au bout ?
    traite: etape === "fini",
  });
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
