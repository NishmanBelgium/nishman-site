/* ==========================================================================
   TVA MANUELLE — l'issue de secours quand le registre européen est muet.

   Le problème, posé par NBD : « imaginons que VIES soit saturé, comment
   une personne qui a un numéro de TVA français valide peut quand même
   être facturée hors taxe ? »

   La mauvaise réponse serait de croire le client sur parole : la facture
   en autoliquidation doit pouvoir être justifiée, et c'est NBD qui porte
   le redressement si elle ne l'est pas.

   La bonne réponse : NBD vérifie par un autre chemin — le site de la
   Commission européenne, ou son bureau de TVA — et enregistre ici le
   NUMÉRO DE CONSULTATION obtenu. La preuve reste une vraie preuve ; seul
   le chemin pour l'obtenir change.

   Réservé au compte de NBD. En lecture, la page liste les comptes à
   traiter ; en écriture, elle pose ou retire une validation manuelle.
   ========================================================================== */

import { json, erreur, compteConnecte, texteValide } from "../_commun.js";

const ADMIN_DEFAUT = "contact@nishman.be";

// Le numéro de consultation VIES ressemble à « WAPIAAAAXnAO0Hv0 » : des
// lettres et des chiffres. On reste tolérant — le format n'est pas publié
// comme stable — mais on refuse ce qui n'en a visiblement pas l'air.
const CONSULTATION = /^[A-Za-z0-9_-]{6,64}$/;

function estAdmin(env, compte) {
  const admins = String(env.EMAIL_ADMIN || ADMIN_DEFAUT)
    .split(",").map((a) => a.trim().toLowerCase()).filter(Boolean);
  const moi = String((compte && compte.email) || "").trim().toLowerCase();
  return !!moi && admins.indexOf(moi) !== -1;
}

async function gardien({ request, env }) {
  if (!env.DB) return { refus: erreur("Service indisponible.", 503, "indisponible") };
  const compte = await compteConnecte(request, env.DB);
  if (!estAdmin(env, compte)) return { refus: erreur("Page réservée.", 404, "reservee") };
  return { compte: compte };
}

/* --------------------------------------------------------------------------
   LECTURE — les comptes français et luxembourgeois qui ne sont pas exonérés.

   Les comptes belges n'y figurent pas : une vente intérieure porte la TVA
   belge de toute façon, une validation manuelle n'y changerait rien.
   -------------------------------------------------------------------------- */
export async function onRequestGet(contexte) {
  const g = await gardien(contexte);
  if (g.refus) return g.refus;

  // Les colonnes de l'étape 214 peuvent ne pas encore exister : la migration
  // se lance à la main sur la base D1. Plutôt qu'une erreur 500 illisible, on
  // le dit, avec le nom du fichier à exécuter.
  let r;
  try {
    r = await contexte.env.DB.prepare(`
      SELECT id, email, salon, pays, tva, siret,
             tva_valide, tva_statut, tva_verifiee_le, tva_preuve,
             tva_nom, tva_motif, tva_manuel_par, tva_manuel_le, tva_manuel_note
        FROM comptes
       WHERE etat = 'actif'
         AND pays IN ('FR', 'LU')
       ORDER BY (tva_statut = 'valide') ASC, salon COLLATE NOCASE ASC
    `).all();
  } catch (e) {
    const texte = String((e && e.message) || "");
    if (/no such column/i.test(texte)) {
      return erreur(
        "La base n'a pas encore reçu la migration de l'étape 214. "
        + "Exécutez base/migration-214.sql dans la console D1, puis rechargez.",
        503, "migration");
    }
    throw e;
  }

  const lignes = (r && r.results) || [];
  return json({
    ok: true,
    comptes: lignes.map((c) => ({
      email: c.email,
      societe: c.salon,
      pays: c.pays,
      numero: c.tva || c.siret || "",
      statut: c.tva_statut || "jamais",
      exonere: !!c.tva_valide,
      verifie_le: c.tva_verifiee_le || "",
      preuve: c.tva_preuve || "",
      nom_registre: c.tva_nom || "",
      motif: c.tva_motif || "",
      manuel_par: c.tva_manuel_par || "",
      manuel_le: c.tva_manuel_le || "",
      manuel_note: c.tva_manuel_note || "",
    })),
  });
}

/* --------------------------------------------------------------------------
   ÉCRITURE — poser ou retirer une validation manuelle.
   -------------------------------------------------------------------------- */
export async function onRequestPost(contexte) {
  const g = await gardien(contexte);
  if (g.refus) return g.refus;
  const { request, env } = contexte;

  let corps;
  try { corps = await request.json(); }
  catch (e) { return erreur("Demande illisible.", 400, "illisible"); }

  const email = String((corps && corps.email) || "").trim().toLowerCase();
  if (!email) return erreur("Compte non précisé.", 400, "compte");

  const cible = await env.DB.prepare(
    "SELECT id, email, salon, pays, tva_statut FROM comptes WHERE email_cle = ?"
  ).bind(email).first();
  if (!cible) return erreur("Compte introuvable.", 404, "introuvable");

  const horodatage = new Date().toISOString();

  /* --- Retrait : on revient à l'état « jamais vérifié », pas à « invalide ».
         Retirer une validation n'est pas un démenti du registre.          --- */
  if (corps.retirer === true) {
    await env.DB.prepare(`
      UPDATE comptes
         SET tva_valide = 0, tva_statut = 'jamais', tva_verifiee_le = NULL,
             tva_preuve = NULL, tva_motif = ?,
             tva_manuel_par = NULL, tva_manuel_le = NULL, tva_manuel_note = NULL
       WHERE id = ?
    `).bind("validation manuelle retirée le " + horodatage.slice(0, 10), cible.id).run();

    return json({ ok: true, action: "retiree", email: cible.email,
                  statut: "jamais", exonere: false });
  }

  /* --- Pose : le pays doit ouvrir droit à l'autoliquidation.            --- */
  if (cible.pays !== "FR" && cible.pays !== "LU") {
    return erreur(
      "Ce compte est belge : la vente est intérieure et porte la TVA belge. "
      + "Une validation manuelle n'y changerait rien.", 400, "pays");
  }

  const consultation = String((corps && corps.consultation) || "").trim();
  if (!CONSULTATION.test(consultation)) {
    return erreur(
      "Numéro de consultation attendu : celui que le site de la Commission "
      + "européenne affiche après la vérification, ou celui que votre bureau "
      + "de TVA vous communique.", 400, "consultation");
  }

  const note = String((corps && corps.note) || "").trim();
  if (note && !texteValide(note, 0, 400)) {
    return erreur("Note trop longue.", 400, "note");
  }

  await env.DB.prepare(`
    UPDATE comptes
       SET tva_valide = 1, tva_statut = 'valide_manuel',
           tva_verifiee_le = ?, tva_preuve = ?, tva_motif = ?,
           tva_manuel_par = ?, tva_manuel_le = ?, tva_manuel_note = ?
     WHERE id = ?
  `).bind(
    horodatage, consultation,
    "vérifié hors site, registre indisponible",
    g.compte.email, horodatage, note || null,
    cible.id,
  ).run();

  return json({
    ok: true, action: "posee", email: cible.email, societe: cible.salon,
    statut: "valide_manuel", exonere: true,
    preuve: consultation, pose_par: g.compte.email, pose_le: horodatage,
  });
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
