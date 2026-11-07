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
const STATUTS_EXONERANTS = [
  "valide",          // le registre européen a confirmé, preuve à l'appui
  "valide_ancien",   // confirmé récemment, registre momentanément muet
  "valide_manuel",   // vérifié autrement par NBD, numéro de consultation saisi
];

export function ouvreDroitAExoneration(pays, statut) {
  return (pays === "FR" || pays === "LU")
      && STATUTS_EXONERANTS.indexOf(String(statut || "")) !== -1;
}

export { STATUTS_EXONERANTS };

/**
 * Vérifie et enregistre. Ne lève jamais : une panne de VIES ne doit bloquer
 * ni une inscription ni une commande.
 *
 * @returns {statut, valide, verifie_le, preuve, nom, motif}
 */
export async function controlerEtEnregistrer(db, compte, env, options) {
  const numero = compte.tva || compte.siret || "";
  if (!numero) {
    return { statut: "jamais", valide: false, motif: "aucun_numero" };
  }

  const r = await verifier(numero, compte.pays, notreNumero(env), options);
  const etaitManuel = String(compte.tva_statut || "") === "valide_manuel";

  // Une validation posée à la main par NBD n'est pas une donnée que le
  // contrôle automatique peut effacer à la légère :
  //   - le registre confirme     → on adopte sa preuve, qui vaut mieux ;
  //   - le registre ne répond pas → on garde la validation manuelle ;
  //   - le registre DÉMENT       → il gagne. La saisie manuelle palliait un
  //     silence, pas un démenti ; continuer à facturer hors taxe un numéro
  //     radié ferait porter le redressement à NBD.
  if (etaitManuel && r.statut === "indisponible") {
    return {
      statut: "valide_manuel", valide: true,
      verifie_le: compte.tva_verifiee_le || "",
      preuve: compte.tva_preuve || "", nom: compte.tva_nom || "",
      motif: "registre muet, validation manuelle conservée",
    };
  }

  const valide = r.statut === "valide" ? 1 : 0;
  const motif = (etaitManuel && r.statut === "invalide")
    ? "le registre a démenti une validation manuelle"
    : (r.motif || null);

  try {
    await db.prepare(`
      UPDATE comptes
         SET tva_valide = ?, tva_statut = ?, tva_verifiee_le = ?,
             tva_preuve = ?, tva_nom = ?, tva_motif = ?
       WHERE id = ?
    `).bind(
      valide, r.statut, r.verifie_le || new Date().toISOString(),
      r.preuve || null, r.nom || null, motif,
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
    motif: motif || "",
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

  /* Ce que l'on rend quand on renonce à interroger le registre : l'état
   * déjà connu du compte, tel qu'il est enregistré. */
  const connu = () => ({
    valide: etaitValide, statut: compte.tva_statut || "", rafraichi: false,
    preuve: compte.tva_preuve || "",
    /* Le motif voyage avec le statut depuis le 7 novembre 2026. Sans lui,
     * l'appelant savait que le registre n'avait pas tranché mais pas
     * pourquoi — et donc pas s'il valait la peine de redemander. C'est
     * exactement ce qui manquait pour rattraper la commande de Hair
     * bodega, refusée par un MS_MAX_CONCURRENT_REQ. */
    motif: compte.tva_motif || "",
  });

  if (!aRevalider(compte.tva_verifiee_le, compte.tva_statut)) return connu();

  /* LE BUDGET, et pourquoi il prime sur l'exactitude.
   *
   * Les trois appelants de cette fonction — l'affichage du panier, la
   * demande de devis, le paiement — ont tous un client qui attend devant
   * son écran. Aucun ne peut se permettre les vingt-cinq secondes que le
   * registre européen peut prendre quand il est engorgé.
   *
   * On lui accorde donc trois secondes, pas davantage, et on repart avec
   * ce qu'on sait déjà si elles ne suffisent pas. Ce n'est pas un pis-
   * aller : le pire que l'on risque est de facturer la TVA belge à un
   * client qui aurait pu en être exonéré — une facture à corriger, ce
   * qui se fait. L'autre branche de l'alternative était une commande
   * perdue et un client devant un message d'erreur, ce qui ne se corrige
   * pas.
   *
   * La vérification repartira d'elle-même au prochain passage, et le
   * contrôle manuel depuis /pro/tva/ reste entier : il n'a pas de budget,
   * lui, parce que personne n'attend derrière. */
  const BUDGET_MS = 3000;

  const course = Promise.race([
    controlerEtEnregistrer(db, compte, env, { tentatives: 1, delaiMs: 2500 }),
    new Promise((resoudre) => setTimeout(() => resoudre(null), BUDGET_MS)),
  ]);

  const r = await course;
  if (!r) return connu();

  if (r.statut === "indisponible" && etaitValide) {
    return { valide: true, statut: "valide_ancien", rafraichi: false,
             preuve: compte.tva_preuve || "", motif: r.motif || "" };
  }
  return { valide: r.valide, statut: r.statut, rafraichi: true,
           preuve: r.preuve, motif: r.motif || "" };
}
