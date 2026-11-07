/* ==========================================================================
   TVA — LE RATTRAPAGE D'APRÈS-VENTE.

   Le 6 novembre 2026 à 17h24, le site interroge le registre européen pour
   le numéro français de Hair bodega. Le nœud français répond
   MS_MAX_CONCURRENT_REQ : trop de requêtes simultanées. Ce n'est pas un
   démenti, c'est une porte fermée. Faute de confirmation, le site applique
   la TVA belge. À 17h25, la commande est payée TVA comprise.

   Le numéro, vérifié à la main le lendemain, est parfaitement valide.

   Les trois secondes accordées au registre pendant la commande sont un bon
   réglage et elles ne changeront pas : personne ne doit perdre une vente
   parce que le registre européen est engorgé. Le défaut est ailleurs, et
   il est double.

   D'abord, PERSONNE N'EST AVERTI. Une société exonérable est facturée TVA
   comprise, et rien ne le dit — ni au client, ni à NBD. C'est NBD qui l'a
   découvert à la main, le lendemain, en relisant une facture.

   Ensuite, RIEN NE REPREND LE CONTRÔLE. Le compte reste « indisponible »
   jusqu'à ce qu'un humain ouvre /pro/tva/. Or au moment où le client a reçu
   sa réponse, plus personne n'attend : on peut interroger le registre
   tranquillement, trois essais et vingt-cinq secondes s'il le faut.

   D'où ce module. Il note chaque vente partie avec un numéro non tranché,
   reprend le contrôle juste après la réponse, et laisse à NBD une liste
   nommée de ce qu'il faut régulariser. Il ne corrige aucune facture
   lui-même : une note de crédit est un acte comptable, et elle appartient
   à NBD.

   Les deux fautes qu'il surveille coûtent dans les deux sens :
     - facturer TVA comprise une société exonérable → note de crédit, et un
       client qui perd confiance ;
     - facturer hors taxe sans numéro valide → la TVA reste due par NBD.
   Celle-ci ne traite que la première : la seconde est déjà empêchée en
   amont, puisque l'exonération exige une confirmation positive.
   ========================================================================== */

import { controlerEtEnregistrer } from "./_tva.js";

/* Les motifs sur lesquels il est inutile d'insister : le registre a bien
 * répondu, et il a dit non. Un format refusé ne deviendra pas correct en
 * réessayant, et un numéro inconnu du registre ne s'y inscrira pas tout
 * seul dans la minute.
 *
 * Tout le reste est traité comme transitoire, y compris les motifs que
 * nous ne connaissons pas encore. Le choix est délibéré et il est
 * asymétrique : se tromper de ce côté coûte une interrogation de plus ;
 * se tromper de l'autre laisse partir une facture fausse sans que
 * personne ne le sache. Pour mémoire, les motifs transitoires déjà
 * rencontrés sont MS_MAX_CONCURRENT_REQ — l'État membre refuse parce
 * qu'on l'appelle trop —, MS_UNAVAILABLE, SERVICE_UNAVAILABLE, TIMEOUT,
 * GLOBAL_MAX_CONCURRENT_REQ, et nos propres « reseau », « illisible »,
 * « vide », « reponse_inattendue » et « http_5xx ». */
const MOTIFS_DEFINITIFS = ["INVALID_INPUT", "format", "inconnu_du_registre"];

/** Un statut qui n'a tranché ni dans un sens ni dans l'autre. */
export function nonTranche(statut) {
  const s = String(statut || "");
  return s === "indisponible" || s === "jamais" || s === "";
}

/** Vaut-il la peine de redemander au registre ? */
export function transitoire(motif) {
  return MOTIFS_DEFINITIFS.indexOf(String(motif || "")) === -1;
}

/* « La table est-elle prête ? » — la question se pose PAR BASE, pas une
 * fois pour toutes.
 *
 * Les autres registres du site retiennent la réponse dans un simple
 * booléen de module. En production cela suffit, puisqu'il n'y a qu'une
 * base et qu'un module par isolat. Mais un booléen rend le module
 * intestable : le premier essai le met à vrai, et tous les suivants
 * croient prête une base toute neuve où rien n'existe. C'est précisément
 * ce qui a fait échouer deux vérifications à l'écriture de ce fichier.
 *
 * Un WeakSet coûte la même chose, dit la vérité, et laisse les bases
 * oubliées se faire ramasser par le collecteur. */
const basesPretes = new WeakSet();

export async function preparerRattrapage(db) {
  if (!db || basesPretes.has(db)) return;
  await db.exec(
    "CREATE TABLE IF NOT EXISTS tva_rattrapage (" +
      "ref TEXT PRIMARY KEY, " +
      "odoo_nom TEXT, " +
      "compte_id INTEGER NOT NULL DEFAULT 0, " +
      "client TEXT, " +
      "pays TEXT, " +
      "numero TEXT, " +
      "statut_vente TEXT, " +
      "motif_vente TEXT, " +
      "montant TEXT, " +
      "statut_apres TEXT, " +
      "preuve_apres TEXT, " +
      "nom_apres TEXT, " +
      "verifie_apres_le TEXT, " +
      "regle INTEGER NOT NULL DEFAULT 0, " +
      "cree_le TEXT NOT NULL)"
  );
  try {
    await db.exec(
      "CREATE INDEX IF NOT EXISTS tva_rattrapage_jour ON tva_rattrapage (cree_le)");
  } catch (e) { /* l'index existe déjà */ }
  basesPretes.add(db);
}

/**
 * Noter une vente partie sans que le numéro ait été tranché, puis reprendre
 * le contrôle avec le temps qu'il faut.
 *
 * À appeler dans waitUntil, APRÈS que le client a eu sa réponse : c'est tout
 * l'intérêt. Le budget de trois secondes de la commande n'a plus cours ici,
 * et l'on peut accorder au registre les trois essais qu'il mérite.
 *
 * Ne lève jamais. Une vente ne doit pas échouer parce qu'un registre
 * administratif boude, et une écriture de suivi encore moins.
 *
 * @param info {ref, odoo_nom, client, montant, statut_vente, motif_vente}
 */
export async function rattraperApresVente(db, env, compte, info) {
  try {
    if (!db || !compte || !info || !info.ref) return;

    const pays = String(compte.pays || "");
    if (pays !== "FR" && pays !== "LU") return;      // vente intérieure : rien à rattraper

    const numero = compte.tva || compte.siret || "";
    if (!numero) return;                              // sans numéro, la TVA belge est due

    if (!nonTranche(info.statut_vente)) return;       // le registre avait répondu
    if (!transitoire(info.motif_vente)) return;       // et son refus était définitif

    await preparerRattrapage(db);

    const coupe = (v, n) => String(v == null ? "" : v).slice(0, n);
    await db.prepare(
      "INSERT OR REPLACE INTO tva_rattrapage " +
        "(ref, odoo_nom, compte_id, client, pays, numero, statut_vente, " +
        " motif_vente, montant, cree_le) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      coupe(info.ref, 40), coupe(info.odoo_nom, 40),
      Number(compte.id) || 0,
      coupe(info.client || compte.salon || compte.email, 160),
      coupe(pays, 2), coupe(numero, 24),
      coupe(info.statut_vente, 20), coupe(info.motif_vente, 60),
      coupe(info.montant, 20),
      new Date().toISOString(),
    ).run();

    /* LE SECOND CONTRÔLE, sans budget.
     *
     * controlerEtEnregistrer avec ses réglages par défaut : trois essais,
     * huit secondes chacun, pauses comprises. Vingt-cinq secondes au pire,
     * et nul ne les attend — c'est exactement le temps que la commande ne
     * pouvait pas s'accorder. */
    const r = await controlerEtEnregistrer(db, compte, env);

    await db.prepare(
      "UPDATE tva_rattrapage SET statut_apres = ?, preuve_apres = ?, " +
        "nom_apres = ?, verifie_apres_le = ? WHERE ref = ?"
    ).bind(
      coupe(r && r.statut, 20), coupe(r && r.preuve, 64),
      coupe(r && r.nom, 160), new Date().toISOString(),
      coupe(info.ref, 40),
    ).run();
  } catch (e) {
    /* Le rattrapage est un filet, pas une étape de la vente. S'il casse,
       la commande reste bonne et la liste se rattrapera à la suivante. */
  }
}

/**
 * Ce qu'il reste à régulariser : les ventes où le second contrôle a fini
 * par confirmer le numéro, et où la facture porte donc une TVA qui n'avait
 * pas lieu d'être.
 *
 * C'est la seule liste de ce module qui demande un geste — une note de
 * crédit — et elle le demande nommément.
 */
export async function aRegulariser(db, limite = 100) {
  if (!db) return [];
  try {
    await preparerRattrapage(db);
    const r = await db.prepare(
      "SELECT ref, odoo_nom, client, pays, numero, montant, " +
        "statut_vente, motif_vente, statut_apres, preuve_apres, " +
        "verifie_apres_le, cree_le " +
        "FROM tva_rattrapage " +
        "WHERE regle = 0 AND statut_apres IN " +
        "('valide', 'valide_manuel', 'valide_sans_preuve') " +
        "ORDER BY cree_le DESC LIMIT " + Math.min(500, Math.max(1, Number(limite) || 100))
    ).all();
    return (r && r.results) || [];
  } catch (e) {
    return [];
  }
}

/**
 * Les ventes dont le numéro n'est toujours pas tranché. Elles ne demandent
 * pas de note de crédit — peut-être que le numéro est mauvais — mais elles
 * demandent un coup d'œil humain sur /pro/tva/, parce que le registre reste
 * muet et que personne ne peut trancher à sa place.
 */
export async function encoreMuettes(db, limite = 100) {
  if (!db) return [];
  try {
    await preparerRattrapage(db);
    const r = await db.prepare(
      "SELECT ref, odoo_nom, client, pays, numero, montant, " +
        "motif_vente, statut_apres, verifie_apres_le, cree_le " +
        "FROM tva_rattrapage " +
        "WHERE regle = 0 AND (statut_apres IS NULL " +
        "      OR statut_apres IN ('indisponible', 'jamais', '')) " +
        "ORDER BY cree_le DESC LIMIT " + Math.min(500, Math.max(1, Number(limite) || 100))
    ).all();
    return (r && r.results) || [];
  } catch (e) {
    return [];
  }
}

/** NBD a émis la note de crédit : la ligne sort de la liste. */
export async function marquerReglee(db, ref) {
  if (!db || !ref) return false;
  try {
    await preparerRattrapage(db);
    await db.prepare("UPDATE tva_rattrapage SET regle = 1 WHERE ref = ?")
      .bind(String(ref).slice(0, 40)).run();
    return true;
  } catch (e) {
    return false;
  }
}
