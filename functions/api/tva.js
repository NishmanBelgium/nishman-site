/* ==========================================================================
   TVA — vérifier son numéro depuis son compte.

   Le client peut relancer le contrôle lui-même : c'est plus honnête que de
   le laisser deviner pourquoi on lui facture la TVA, et ça évite un appel
   téléphonique quand un numéro vient d'être attribué.
   ========================================================================== */

import { json, erreur, compteConnecte } from "../_commun.js";
import { controlerEtEnregistrer, ouvreDroitAExoneration } from "../_tva.js";

export async function onRequestPost({ request, env }) {
  if (!env.DB) return erreur("Service indisponible.", 503, "indisponible");

  const compte = await compteConnecte(request, env.DB);
  if (!compte) return erreur("Connectez-vous.", 401, "session");

  const r = await controlerEtEnregistrer(env.DB, compte, env);

  return json({
    ok: true,
    statut: r.statut,
    exonere: ouvreDroitAExoneration(compte.pays, r.statut),
    verifie_le: r.verifie_le || "",
    nom: r.nom || "",
    motif: r.motif || "",
    // La preuve n'intéresse que nous : on ne la renvoie pas au navigateur.
  });
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
