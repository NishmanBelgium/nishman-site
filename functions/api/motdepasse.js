/* ==========================================================================
   MOT DE PASSE — changement depuis l'espace client.
   On exige l'ancien : sans cela, un appareil laissé ouvert chez le coiffeur
   suffirait à s'approprier le compte.
   ========================================================================== */

import {
  json, erreur, compteConnecte, verifier, hacher,
  motDePasseValide, lireCookie,
} from "../_commun.js";

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  if (!db) return erreur("La base de données n'est pas branchée.", 500);

  const compte = await compteConnecte(request, db);
  if (!compte) return erreur("Session expirée. Reconnectez-vous.", 401);

  let corps;
  try { corps = await request.json(); }
  catch (e) { return erreur("Requête illisible."); }

  const actuel  = String(corps.actuel || "");
  const nouveau = String(corps.nouveau || "");

  if (!motDePasseValide(nouveau))
    return erreur("Le nouveau mot de passe doit faire au moins 8 caractères.");
  if (actuel === nouveau)
    return erreur("Le nouveau mot de passe est identique à l'ancien.");

  // compteConnecte ne ramène pas l'empreinte : on va la chercher ici.
  const ligne = await db.prepare("SELECT mot_de_passe FROM comptes WHERE id = ?")
    .bind(compte.id).first();
  if (!ligne || !(await verifier(actuel, ligne.mot_de_passe)))
    return erreur("Mot de passe actuel incorrect.", 403);

  const empreinte = await hacher(nouveau);
  await db.prepare("UPDATE comptes SET mot_de_passe = ? WHERE id = ?")
    .bind(empreinte, compte.id).run();

  // Changer son mot de passe, c'est souvent réagir à un doute. On ferme
  // donc toutes les autres sessions — l'appareil en cours reste ouvert,
  // sinon la personne serait éjectée de la page qu'elle vient d'utiliser.
  const jeton = lireCookie(request);
  await db.prepare("DELETE FROM sessions WHERE compte_id = ? AND jeton <> ?")
    .bind(compte.id, jeton || "").run();

  return json({ ok: true });
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405);
}
