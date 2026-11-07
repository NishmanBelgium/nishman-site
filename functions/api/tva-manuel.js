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

import { json, erreur, compteAdmin, texteValide } from "../_commun.js";
import { controlerEtEnregistrer, ouvreDroitAExoneration } from "../_tva.js";


// Le numéro de consultation VIES ressemble à « WAPIAAAAXnAO0Hv0 » : des
// lettres et des chiffres. On reste tolérant — le format n'est pas publié
// comme stable — mais on refuse ce qui n'en a visiblement pas l'air.
const CONSULTATION = /^[A-Za-z0-9_-]{6,64}$/;

/* --------------------------------------------------------------------------
   LE CONSTAT DE REGISTRE — la seconde forme de preuve, décidée le
   7 novembre 2026.

   Le numéro de consultation reste la meilleure pièce, et il reste
   préféré. Mais la France refuse durablement l'appel qui le délivre :
   l'exiger revenait à facturer indéfiniment la TVA belge à des sociétés
   dont le numéro est parfaitement conforme. C'est l'erreur que NBD a
   relevée sur la commande S00285, et elle se répétait à chaque commande
   de ces clients.

   La porte qui répond, elle, ne rend pas de numéro de consultation mais
   rend la RAISON SOCIALE et l'ADRESSE enregistrées au registre. Un
   constat horodaté qui porte ces éléments n'est pas une parole de
   client : c'est le registre officiel qui a répondu, et ce qu'il a
   répondu est consigné.

   Le site ne peut pas interroger le registre lui-même depuis Cloudflare
   — c'est tout le problème — et la page ne le peut pas non plus, le
   registre n'autorisant pas les appels venus d'un autre domaine. C'est
   donc le rapport quotidien, qui tourne sur la machine de NBD, qui fait
   l'interrogation et dépose ici ce qu'il a lu.

   D'où les garde-fous ci-dessous. Ils ne prouvent pas que l'appel a eu
   lieu — rien ne le peut depuis ce serveur — mais ils empêchent les
   fautes d'inattention qui, elles, arrivent vraiment :

     - le numéro constaté doit être CELUI DU COMPTE. Sans ce contrôle,
       la réponse du registre concernant une société pourrait être
       enregistrée sur le compte d'une autre, et l'exonération partirait
       au mauvais client.
     - le constat doit être FRAIS. Une confirmation d'il y a trois
       semaines ne dit rien de l'état du numéro aujourd'hui, et
       l'autoliquidation se justifie au moment de la vente.
     - la raison sociale est OBLIGATOIRE. C'est elle qui distingue un
       constat d'une simple affirmation : le registre ne la rend que
       lorsqu'il reconnaît le numéro.
   -------------------------------------------------------------------------- */
export const CONSTAT_FRAICHEUR_H = 36;

export function lireConstat(brut, numeroDuCompte) {
  const c = (brut && typeof brut === "object") ? brut : null;
  if (!c) return { refus: "Constat absent." };

  const propre = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  const chiffres = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  const interroge = chiffres(c.interroge);
  const attendu = chiffres(numeroDuCompte);
  if (!interroge) return { refus: "Le constat ne dit pas quel numéro a été interrogé." };
  if (interroge !== attendu) {
    return { refus: "Le constat porte sur " + interroge + " alors que ce compte "
                  + "déclare " + attendu + ". Rien n'a été enregistré." };
  }

  const nom = propre(c.nom);
  if (!nom) {
    return { refus: "Le registre n'a rendu aucune raison sociale : sans elle, "
                  + "ce n'est pas un constat." };
  }

  const quand = c.verifie_le ? new Date(c.verifie_le) : null;
  if (!quand || isNaN(quand)) return { refus: "Date du constat illisible." };
  const ageH = (Date.now() - quand.getTime()) / 3600000;
  if (ageH > CONSTAT_FRAICHEUR_H) {
    return { refus: "Ce constat date de plus de " + CONSTAT_FRAICHEUR_H
                  + " heures. Refaites l'interrogation." };
  }
  if (ageH < -2) return { refus: "Date du constat dans le futur." };

  return {
    numero: interroge,
    nom: nom.slice(0, 160),
    adresse: propre(c.adresse).slice(0, 240),
    verifie_le: quand.toISOString(),
  };
}

async function gardien({ request, env }) {
  if (!env.DB) return { refus: erreur("Service indisponible.", 503, "indisponible") };
  const compte = await compteAdmin(request, env);
  if (!compte) return { refus: erreur("Page réservée.", 404, "reservee") };
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
    "SELECT id, email, salon, pays, tva, siret, tva_valide, tva_statut, " +
    "tva_verifiee_le, tva_preuve, tva_nom, tva_motif " +
    "FROM comptes WHERE email_cle = ?"
  ).bind(email).first();
  if (!cible) return erreur("Compte introuvable.", 404, "introuvable");

  const horodatage = new Date().toISOString();

  /* --- RELANCER LE CONTRÔLE, sans budget de temps.
   *
   * Il manquait. Quand le registre européen refusait un numéro pour
   * saturation, le compte restait « indisponible » et la seule issue
   * offerte par cette page était la validation manuelle — qui exige un
   * numéro de consultation que NBD doit aller chercher ailleurs. Pour
   * quatre comptes français parfaitement valides, le 7 novembre 2026,
   * c'était beaucoup de travail pour rien : il suffisait de redemander.
   *
   * Personne n'attend derrière cet appel, contrairement au tunnel de
   * commande : controlerEtEnregistrer garde donc ses trois tentatives et
   * son budget complet, et passe au besoin par la seconde porte du
   * registre.                                                          --- */
  if (corps.reverifier === true) {
    const r = await controlerEtEnregistrer(env.DB, cible, env);
    return json({
      ok: true, action: "reverifiee", email: cible.email, societe: cible.salon,
      statut: r.statut, exonere: ouvreDroitAExoneration(cible.pays, r.statut),
      preuve: r.preuve || "", nom_registre: r.nom || "", motif: r.motif || "",
      chemin: r.chemin || "",
      verifie_le: r.verifie_le || horodatage,
    });
  }

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

  /* --- POSE PAR CONSTAT DE REGISTRE.
   *
   * Même statut que la validation manuelle — « valide_manuel » — et c'est
   * voulu. Ce statut porte déjà tout ce qu'il faut : il exonère, il
   * survit à un registre muet, il cède devant un démenti de la porte
   * principale, il se retire d'un clic, et il n'est revérifié qu'au bout
   * de trois mois. Inventer un statut de plus aurait obligé à réécrire
   * ces quatre règles, et c'est précisément là qu'on se trompe.
   *
   * Ce qui change est la pièce justificative : pas de numéro de
   * consultation, mais la réponse du registre consignée mot pour mot.
   * tva_preuve reste donc vide, et la note dit ce qui a été constaté.
   * La page de gestion distingue les deux à l'œil.                   --- */
  if (corps.constat) {
    if (cible.pays !== "FR" && cible.pays !== "LU") {
      return erreur(
        "Ce compte est belge : la vente est intérieure et porte la TVA belge.",
        400, "pays");
    }
    const numeroDuCompte = cible.tva || cible.siret || "";
    if (!numeroDuCompte) {
      return erreur("Ce compte ne déclare aucun numéro de TVA.", 400, "numero");
    }
    const c = lireConstat(corps.constat, numeroDuCompte);
    if (c.refus) return erreur(c.refus, 400, "constat");

    const note = String((corps && corps.note) || "").trim();
    if (note && !texteValide(note, 0, 400)) {
      return erreur("Note trop longue.", 400, "note");
    }

    const trace = "Constaté au registre européen le "
      + c.verifie_le.slice(0, 10) + " : " + c.nom
      + (c.adresse ? " — " + c.adresse : "")
      + ". Sans numéro de consultation, l'État membre refusant l'appel qui "
      + "le délivre." + (note ? " " + note : "");

    await env.DB.prepare(`
      UPDATE comptes
         SET tva_valide = 1, tva_statut = 'valide_manuel',
             tva_verifiee_le = ?, tva_preuve = '', tva_nom = ?, tva_motif = ?,
             tva_manuel_par = ?, tva_manuel_le = ?, tva_manuel_note = ?
       WHERE id = ?
    `).bind(
      c.verifie_le, c.nom,
      "constaté au registre, sans numéro de consultation",
      g.compte.email, horodatage, trace.slice(0, 400),
      cible.id,
    ).run();

    return json({
      ok: true, action: "constatee", email: cible.email, societe: cible.salon,
      statut: "valide_manuel", exonere: true, preuve: "",
      nom_registre: c.nom, verifie_le: c.verifie_le,
      pose_par: g.compte.email, pose_le: horodatage,
    });
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
