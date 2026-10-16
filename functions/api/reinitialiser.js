/* ==========================================================================
   RÉINITIALISER — pose un nouveau mot de passe à partir du lien reçu.
   ========================================================================== */

import {
  json, erreur, hacher, motDePasseValide, empreinteJeton,
} from "../_commun.js";

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  if (!db) return erreur("La base de données n'est pas branchée.", 500);

  let corps;
  try { corps = await request.json(); }
  catch (e) { return erreur("Requête illisible."); }

  const jeton = String(corps.jeton || "");
  const mdp = String(corps.motdepasse || "");
  if (!jeton) return erreur("Lien incomplet.", 400);
  if (!motDePasseValide(mdp))
    return erreur("Le mot de passe doit faire au moins 8 caractères.");

  const ligne = await db.prepare(`
    SELECT r.compte_id, r.expire_le, r.utilise, c.etat
      FROM reinitialisations r
      JOIN comptes c ON c.id = r.compte_id
     WHERE r.empreinte = ?
  `).bind(await empreinteJeton(jeton)).first();

  const perime = !ligne
    || ligne.utilise
    || new Date(ligne.expire_le) < new Date();

  if (perime) {
    return erreur("Ce lien n'est plus valable. Demandez-en un nouveau.", 410);
  }
  if (ligne.etat !== "actif") {
    return erreur("Ce compte est suspendu. Contactez-nous à contact@nishman.be.", 403);
  }

  const empreinte = await hacher(mdp);
  await db.prepare("UPDATE comptes SET mot_de_passe = ? WHERE id = ?")
    .bind(empreinte, ligne.compte_id).run();

  // Le lien ne sert qu'une fois, et toutes les sessions tombent : si le
  // mot de passe a été oublié parce qu'un tiers l'avait, ce tiers est
  // déconnecté dans la foulée.
  await db.prepare("UPDATE reinitialisations SET utilise = 1 WHERE empreinte = ?")
    .bind(await empreinteJeton(jeton)).run();
  await db.prepare("DELETE FROM sessions WHERE compte_id = ?")
    .bind(ligne.compte_id).run();
  await db.prepare("DELETE FROM tentatives WHERE email_cle IN (SELECT email_cle FROM comptes WHERE id = ?)")
    .bind(ligne.compte_id).run();

  return json({ ok: true });
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405);
}
