/* ==========================================================================
   ÉTAT D'UN COMPTE — répondre à « il n'a pas reçu le mail » en dix secondes.

   Le 10 novembre 2026, un coiffeur demande un nouveau mot de passe et ne
   reçoit rien. Le même jour, le test depuis contact@nishman.be fonctionne.
   Impossible de trancher entre les quatre explications possibles — pas de
   compte, compte suspendu, demandes freinées, envoi tombé — parce que le
   formulaire répond la même chose rassurante dans tous les cas, et c'est
   voulu : lui dire « cette adresse n'existe pas » ferait de cette page un
   moyen de savoir qui est client chez NBD.

   Le silence vers le visiteur est donc une bonne chose. Le silence vers
   NBD n'en est pas une. Cette page lève le second sans toucher au premier :
   elle est réservée au compte de NBD, elle demande l'adresse explicitement,
   et elle dit ce qui s'est réellement passé pour cette adresse-là.

   Elle ne rend JAMAIS le mot de passe, ni son empreinte, ni un jeton de
   réinitialisation en clair — savoir pourquoi un envoi n'est pas parti ne
   demande à aucun moment de pouvoir entrer dans le compte de quelqu'un.

   Usage : /api/compte-etat?email=... , connecté avec le compte de NBD.
   ========================================================================== */

import { json, erreur, compteAdmin, cleEmail, emailValide } from "../_commun.js";
import { preparerIncidents } from "../_incidents.js";

/* Doit rester aligné sur _commun.js : c'est la fenêtre de freinage. */
const MAX_TENTATIVES = 8;
const FENETRE_MINUTES = 15;

function ilYA(iso) {
  if (!iso) return null;
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const m = Math.round(ms / 60000);
  if (m < 60) return "il y a " + m + " min";
  const h = Math.round(m / 60);
  if (h < 48) return "il y a " + h + " h";
  return "il y a " + Math.round(h / 24) + " j";
}

export async function onRequestGet({ request, env }) {
  const admin = await compteAdmin(request, env);
  if (!admin) return erreur("Réservé à NBD.", 403, "reserve");

  const db = env.DB;
  if (!db) return erreur("La base de données n'est pas branchée.", 500, "base_absente");

  const params = new URL(request.url).searchParams;

  /* LA RECHERCHE PAR NOM.
   *
   * Ajoutée le 10 novembre 2026, une heure après la page elle-même, parce
   * qu'elle ne servait à rien sans. Un coiffeur ne recevait pas son lien ;
   * son adresse chez NBD ne correspondait à aucun compte, et il a bien
   * fallu constater l'évidence : on connaît toujours le NOM du client, et
   * presque jamais l'adresse exacte qu'il a saisie en créant son compte.
   * Chercher par adresse exacte, c'était demander la réponse pour pouvoir
   * poser la question.
   *
   * Elle rend les comptes qui ressemblent, jamais un mot de passe. */
  const q = String(params.get("q") || "").trim();
  if (q) {
    if (q.length < 3) return erreur("Cherchez avec au moins trois lettres.", 400, "trop_court");
    const motif = "%" + q.toLowerCase() + "%";
    const r = await db.prepare(
      "SELECT id, email, salon, prenom, nom, ville, etat, cree_le FROM comptes " +
      "WHERE lower(email) LIKE ? OR lower(salon) LIKE ? OR lower(prenom) LIKE ? " +
      "   OR lower(nom) LIKE ? OR lower(ville) LIKE ? " +
      "ORDER BY cree_le DESC LIMIT 25"
    ).bind(motif, motif, motif, motif, motif).all();
    const lignes = (r && r.results) || [];
    return json({
      ok: true, recherche: q, trouves: lignes.length,
      comptes: lignes.map((x) => ({
        email: x.email, salon: x.salon, prenom: x.prenom, nom: x.nom,
        ville: x.ville, etat: x.etat, cree: ilYA(x.cree_le),
      })),
      a_faire: lignes.length
        ? "Reprenez l'adresse exacte ci-dessus et relancez avec ?email= pour le détail."
        : "Aucun compte ne correspond. S'il est client, c'est qu'il n'a jamais créé "
          + "de compte sur le site : invitez-le à le faire.",
    });
  }

  const email = String(params.get("email") || "").trim();
  if (!emailValide(email)) {
    return erreur("Indiquez une adresse dans ?email= , ou un nom dans ?q=", 400, "email_invalide");
  }
  const cle = cleEmail(email);

  const compte = await db.prepare(
    "SELECT id, email, salon, etat, cree_le FROM comptes WHERE email_cle = ?"
  ).bind(cle).first();

  /* Les tentatives de la fenêtre de freinage, pour dire s'il est bloqué
     en ce moment — et depuis combien de temps il tape dans le vide. */
  const depuis = new Date(Date.now() - FENETRE_MINUTES * 60000).toISOString();
  const recentes = await db.prepare(
    "SELECT COUNT(*) AS n FROM tentatives WHERE email_cle = ? AND quand > ?"
  ).bind("oubli:" + cle, depuis).first().catch(() => ({ n: 0 }));
  const n = Number((recentes && recentes.n) || 0);

  const total = await db.prepare(
    "SELECT COUNT(*) AS n, MAX(quand) AS dernier FROM tentatives WHERE email_cle = ?"
  ).bind("oubli:" + cle).first().catch(() => null);

  /* Un lien en cours de validité ? S'il y en a un, le mail est bien parti :
     le problème est alors dans sa boîte, pas chez nous. */
  let lien = null;
  if (compte) {
    lien = await db.prepare(
      "SELECT cree_le, expire_le FROM reinitialisations WHERE compte_id = ?"
    ).bind(compte.id).first().catch(() => null);
  }

  /* Ce que le journal a retenu pour cette adresse. */
  let incidents = [];
  try {
    await preparerIncidents(db);
    const r = await db.prepare(
      "SELECT quand, cause, detail FROM incidents " +
      "WHERE etape = 'reinitialisation' AND (detail LIKE ? OR compte_id = ?) " +
      "ORDER BY quand DESC LIMIT 10"
    ).bind("%" + cle + "%", compte ? compte.id : -1).all();
    incidents = (r && r.results) || [];
  } catch (e) { /* le journal peut être vide */ }

  /* LE VERDICT, en une phrase, parce que c'est tout ce qu'on veut lire. */
  let verdict, aFaire;
  if (!compte) {
    verdict = "Aucun compte sur le site avec cette adresse.";
    aFaire = "C'est la cause la plus fréquente : un client de longue date qui n'a "
      + "jamais créé de compte. Il n'y a rien à réinitialiser, donc rien ne part. "
      + "Invitez-le à créer son compte — deux minutes, même s'il est déjà client.";
  } else if (compte.etat !== "actif") {
    verdict = "Le compte existe mais il est « " + compte.etat + " ».";
    aFaire = "Tant qu'il n'est pas actif, aucun lien n'est envoyé. Réactivez-le, "
      + "puis demandez-lui de refaire la demande.";
  } else if (n >= MAX_TENTATIVES) {
    verdict = "Le compte est actif, mais les demandes sont freinées : "
      + n + " essais en moins de " + FENETRE_MINUTES + " minutes.";
    aFaire = "Il a réessayé parce qu'il ne recevait rien, et le freinage l'a "
      + "coupé. Dites-lui d'attendre un quart d'heure et de ne demander qu'une "
      + "seule fois.";
  } else if (lien) {
    verdict = "Le lien a bien été créé et envoyé, " + (ilYA(lien.cree_le) || "récemment") + ".";
    aFaire = "Le mail est parti de chez nous. Faites-lui regarder ses courriers "
      + "indésirables, et vérifiez l'orthographe exacte de son adresse. Le lien "
      + "expire — s'il est périmé, il doit refaire la demande.";
  } else {
    verdict = "Le compte est actif et rien ne l'empêche, mais aucun lien n'est en cours.";
    aFaire = "Soit il n'a pas encore fait la demande, soit son lien a expiré ou a "
      + "déjà été utilisé. Demandez-lui de refaire la demande, puis rechargez cette page.";
  }

  return json({
    ok: true,
    adresse: email,
    verdict,
    a_faire: aFaire,
    compte: compte
      ? {
          existe: true,
          etat: compte.etat,
          salon: compte.salon || null,
          cree_le: compte.cree_le || null,
          cree: ilYA(compte.cree_le),
        }
      : { existe: false },
    demandes: {
      dans_la_fenetre: n,
      seuil: MAX_TENTATIVES,
      freine: n >= MAX_TENTATIVES,
      total: Number((total && total.n) || 0),
      derniere: ilYA(total && total.dernier),
    },
    lien_en_cours: lien
      ? { cree: ilYA(lien.cree_le), expire_le: lien.expire_le,
          encore_valable: Date.parse(lien.expire_le) > Date.now() }
      : null,
    journal: incidents.map((x) => ({ quand: x.quand, cause: x.cause, detail: x.detail })),
  });
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
