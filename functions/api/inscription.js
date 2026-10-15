/* ==========================================================================
   INSCRIPTION — création d'un compte professionnel.
   E-mail, nom du salon, mot de passe. Rien d'autre n'est demandé ici :
   le numéro de TVA et l'adresse viendront au moment de la commande.
   ========================================================================== */

import {
  json, erreur, hacher, ouvrirSession, cookieSession,
  emailValide, cleEmail, motDePasseValide,
} from "../_commun.js";

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  if (!db) return erreur("La base de données n'est pas branchée.", 500);

  let corps;
  try { corps = await request.json(); }
  catch (e) { return erreur("Requête illisible."); }

  const email = String(corps.email || "").trim();
  const salon = String(corps.salon || "").trim();
  const mdp   = String(corps.motdepasse || "");

  if (!emailValide(email))      return erreur("Cette adresse e-mail n'est pas valide.");
  if (salon.length < 2 || salon.length > 120)
    return erreur("Indiquez le nom de votre salon.");
  if (!motDePasseValide(mdp))
    return erreur("Le mot de passe doit faire au moins 8 caractères.");

  const cle = cleEmail(email);

  const existe = await db.prepare("SELECT id FROM comptes WHERE email_cle = ?")
    .bind(cle).first();
  if (existe) {
    return erreur("Un compte existe déjà avec cette adresse. Connectez-vous.", 409);
  }

  const empreinte = await hacher(mdp);
  const maintenant = new Date().toISOString();

  const res = await db.prepare(`
    INSERT INTO comptes (email, email_cle, salon, mot_de_passe, cree_le, vu_le)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(email, cle, salon, empreinte, maintenant, maintenant).run();

  const compteId = res.meta.last_row_id;
  const jeton = await ouvrirSession(db, compteId);

  // Le compte est créé et l'utilisateur est connecté dans la foulée :
  // lui redemander son mot de passe juste après l'avoir choisi n'apporte rien.
  return json(
    { ok: true, compte: { email, salon, tva: null, tva_valide: 0 } },
    201,
    { "set-cookie": cookieSession(jeton) }
  );
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405);
}
