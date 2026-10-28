/* ==========================================================================
   PAIEMENT PUBLIC — où en est ma commande, sans compte.

   Le pendant de /api/paiement pour la boutique grand public. Même rôle :
   le client revient de chez sa banque avant, souvent, que Mollie ne nous
   ait prévenus, et la page de retour a besoin de l'état réel.

   La différence tient en une ligne : il n'y a pas de session à vérifier.
   C'est la référence elle-même qui fait office de clé — dix caractères
   tirés au hasard, soit plus de mille milliards de combinaisons. On ne
   répond donc qu'aux commandes de la boutique (compte_id = 0), jamais aux
   commandes professionnelles, qui exigent une session.

   Et on ne renvoie que ce que le client a besoin de savoir : l'état de son
   paiement et le numéro de sa commande. Ni son adresse, ni la note
   interne, ni le détail des étapes de la chaîne comptable — ce sont les
   affaires de NBD.
   ========================================================================== */

import { json, erreur } from "../_commun.js";
import { configure as configureOdoo } from "../_odoo.js";
import { configureMollie, appelMollie } from "../_mollie.js";
import { lireParRef, lire, majStatut, prendreLaMain, rendreLaMain } from "../_paiements.js";
import { poursuivre, abandonner } from "../_apres_paiement.js";

const LISIBLE = {
  ouvert: "en attente",
  paye: "payé",
  annule: "annulé",
  expire: "expiré",
  echoue: "échoué",
};

export async function onRequestGet({ request, env }) {
  if (!env.DB) return erreur("Service indisponible.", 503, "indisponible");

  const ref = String(new URL(request.url).searchParams.get("ref") || "").trim();
  // La forme de la référence est vérifiée avant toute lecture : inutile
  // d'interroger la base pour une chaîne qui ne peut pas en être une.
  if (!/^WEB-\d{8}-[A-Z2-9]{10}$/.test(ref)) {
    return erreur("Paiement introuvable.", 404, "inconnu");
  }

  let p;
  try { p = await lireParRef(env.DB, ref, 0); }
  catch (e) { return erreur("Registre indisponible.", 503, "registre"); }
  if (!p) return erreur("Paiement introuvable.", 404, "inconnu");

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

  let etape = String(p.etape || "rien");

  // La reprise, exactement comme côté professionnel : consulter l'état de
  // sa commande la fait avancer. Une chaîne qui ne dépend pas d'un seul
  // déclencheur est une chaîne qui finit par aboutir.
  if (statut === "paye" && etape !== "fini" && configureOdoo(env)) {
    let main = false;
    try { main = await prendreLaMain(env.DB, p.mollie_id); } catch (e) {}
    if (main) {
      try {
        const frais = await lire(env.DB, p.mollie_id);
        await poursuivre(env, env.DB, { ...(frais || p), statut: "paye" });
      } catch (e) { /* l'état renvoyé restera celui du registre */ }
      finally { try { await rendreLaMain(env.DB, p.mollie_id); } catch (e2) {} }
      try {
        const apres = await lire(env.DB, p.mollie_id);
        if (apres) { p = apres; etape = String(p.etape || etape); }
      } catch (e) {}
    }
  }

  if ((statut === "annule" || statut === "expire" || statut === "echoue")
      && String(p.etape || "rien") !== "abandon" && configureOdoo(env)) {
    let main = false;
    try { main = await prendreLaMain(env.DB, p.mollie_id); } catch (e) {}
    if (main) {
      try { await abandonner(env, env.DB, p, statut); } catch (e) {}
      finally { try { await rendreLaMain(env.DB, p.mollie_id); } catch (e2) {} }
      try {
        const apres = await lire(env.DB, p.mollie_id);
        if (apres) { p = apres; etape = String(p.etape || etape); }
      } catch (e) {}
    }
  }

  return json({
    ok: true,
    ref: p.ref,
    commande: p.odoo_nom || "",
    montant: p.montant,
    devise: p.devise,
    statut,
    statut_lisible: LISIBLE[statut] || statut,
    // Pour le client, « c'est bon » veut dire : l'argent est encaissé et la
    // commande existe. Le lettrage et l'envoi de la preuve d'achat sont nos
    // affaires, et un retard de notre côté ne doit pas lui laisser un écran
    // qui tourne.
    traite: ["facturee", "lettree", "envoyee", "fini"].indexOf(etape) >= 0,
    perdu: statut === "annule" || statut === "expire" || statut === "echoue",
  });
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
