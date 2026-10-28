/* ==========================================================================
   E-MAIL — changement de l'adresse de connexion.
   L'adresse est l'identifiant du compte : on demande le mot de passe avant
   de la changer, et on refuse une adresse déjà prise.
   ========================================================================== */

import { estAdresseAdmin,
  json, erreur, compteConnecte, verifier,
  emailValide, cleEmail,
} from "../_commun.js";

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  if (!db) return erreur("La base de données n'est pas branchée.", 500, "base_absente");

  const compte = await compteConnecte(request, db);
  if (!compte) return erreur("Session expirée. Reconnectez-vous.", 401, "session_expiree");

  let corps;
  try { corps = await request.json(); }
  catch (e) { return erreur("Requête illisible.", 400, "illisible"); }

  const email = String(corps.email || "").trim();
  const mdp   = String(corps.motdepasse || "");

  if (!emailValide(email)) return erreur("Cette adresse e-mail n'est pas valide.", 400, "email_invalide");

  const ligne = await db.prepare("SELECT mot_de_passe FROM comptes WHERE id = ?")
    .bind(compte.id).first();
  if (!ligne || !(await verifier(mdp, ligne.mot_de_passe)))
    return erreur("Mot de passe incorrect.", 403, "mdp_faux");

  /* Une adresse d'administration ne se prend pas.
   *
   * Sans cette ligne, le contrôle des pages réservées ne vaut rien :
   * elles reconnaissent l'administratrice à son adresse, et cette page
   * permettait justement d'en changer. S'inscrire avec une adresse
   * jetable puis basculer sur celle de NBD suffisait à tout ouvrir.
   *
   * Le message reste vague à dessein : « déjà utilisée » n'apprend rien
   * à qui tâtonne, là où « réservée » confirmerait la cible. */
  if (estAdresseAdmin(env, email)) {
    return erreur("Cette adresse est déjà utilisée par un autre compte.", 409, "email_pris");
  }

  const cle = cleEmail(email);
  if (cle === cleEmail(compte.email)) return erreur("C'est déjà votre adresse.", 400, "email_identique");

  const pris = await db.prepare("SELECT id FROM comptes WHERE email_cle = ? AND id <> ?")
    .bind(cle, compte.id).first();
  if (pris) return erreur("Cette adresse est déjà utilisée par un autre compte.", 409, "email_pris");

  await db.prepare("UPDATE comptes SET email = ?, email_cle = ? WHERE id = ?")
    .bind(email, cle, compte.id).run();

  return json({ ok: true, email });
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
