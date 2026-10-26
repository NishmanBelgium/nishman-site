/* ==========================================================================
   TVA — appliquer une vérification VIES à un compte.

   Un seul endroit décide quand on vérifie, ce qu'on enregistre et ce qui
   ouvre droit à l'autoliquidation. L'inscription, le bouton « vérifier » et
   la commande passent tous par ici : sans cela, trois règles légèrement
   différentes finiraient par cohabiter.
   ========================================================================== */

import { verifier, aRevalider } from "./_vies.js";

/**
 * Notre propre numéro, envoyé à VIES comme requérant pour obtenir le numéro
 * de consultation qui fait preuve. Il n'a rien de secret — il figure sur
 * chaque facture — mais il reste réglable par variable au cas où.
 */
function notreNumero(env) {
  return (env && env.TVA_NBD) || "BE0817750283";
}

/**
 * Un numéro belge ne donne jamais lieu à autoliquidation : la vente est
 * intérieure, la TVA belge s'applique. On vérifie quand même — savoir qu'un
 * numéro client est radié est une information utile — mais le résultat ne
 * change pas le régime.
 */
export function ouvreDroitAExoneration(pays, statut) {
  return (pays === "FR" || pays === "LU") && statut === "valide";
}

/**
 * Vérifie et enregistre. Ne lève jamais : une panne de VIES ne doit bloquer
 * ni une inscription ni une commande.
 *
 * @returns {statut, valide, verifie_le, preuve, nom, motif}
 */
export async function controlerEtEnregistrer(db, compte, env) {
  const numero = compte.tva || compte.siret || "";
  if (!numero) {
    return { statut: "jamais", valide: false, motif: "aucun_numero" };
  }

  const r = await verifier(numero, compte.pays, notreNumero(env));
  const valide = r.statut === "valide" ? 1 : 0;

  try {
    await db.prepare(`
      UPDATE comptes
         SET tva_valide = ?, tva_statut = ?, tva_verifiee_le = ?,
             tva_preuve = ?, tva_nom = ?, tva_motif = ?
       WHERE id = ?
    `).bind(
      valide, r.statut, r.verifie_le || new Date().toISOString(),
      r.preuve || null, r.nom || null, r.motif || null,
      compte.id,
    ).run();
  } catch (e) {
    // L'écriture a échoué : on rend quand même le résultat, le calcul en
    // cours doit pouvoir s'appuyer dessus. Il sera réécrit au prochain tour.
  }

  return {
    statut: r.statut,
    valide: !!valide,
    verifie_le: r.verifie_le,
    preuve: r.preuve || "",
    nom: r.nom || "",
    motif: r.motif || "",
  };
}

/**
 * Le contrôle à faire avant d'engager une commande.
 *
 * L'autoliquidation se justifie au moment de la vente : un numéro radié
 * depuis le dernier contrôle n'ouvre plus aucun droit. On revérifie donc
 * quand le contrôle date, mais on ne refait pas l'appel à chaque page.
 *
 * Et si VIES ne répond pas alors que le compte était validé récemment, on
 * conserve la validation : la preuve de la semaine passée reste opposable,
 * et punir le client d'une panne européenne serait injuste.
 */
export async function controlerSiBesoin(db, compte, env) {
  const etaitValide = !!compte.tva_valide;

  if (!aRevalider(compte.tva_verifiee_le)) {
    return { valide: etaitValide, statut: compte.tva_statut || "", rafraichi: false,
             preuve: compte.tva_preuve || "" };
  }

  const r = await controlerEtEnregistrer(db, compte, env);

  if (r.statut === "indisponible" && etaitValide) {
    return { valide: true, statut: "valide_ancien", rafraichi: false,
             preuve: compte.tva_preuve || "" };
  }
  return { valide: r.valide, statut: r.statut, rafraichi: true, preuve: r.preuve };
}
