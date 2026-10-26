/* ==========================================================================
   OUBLI — demande d'un lien de réinitialisation.

   La réponse est toujours la même, que l'adresse existe ou non : sinon ce
   formulaire deviendrait un moyen de savoir qui est client chez vous.
   L'envoi passe par le script Google, qui sert déjà de portier aux prix.
   ========================================================================== */

import { codePortier, adressePortier } from "../_portier.js";

import {
  json, erreur, cleEmail, emailValide,
  creerLienReinit, tropDeTentatives, noterTentative,
} from "../_commun.js";


// Réponse volontairement identique que le compte existe ou non : sinon la page
// devient un outil pour savoir qui est client.
const REPONSE = {
  ok: true,
  message: "Si un compte existe avec cette adresse, vous allez recevoir un lien dans quelques instants. Pensez à regarder vos courriers indésirables.",
  code: "lien_envoye",
};

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  if (!db) return erreur("La base de données n'est pas branchée.", 500, "base_absente");

  let corps;
  try { corps = await request.json(); }
  catch (e) { return erreur("Requête illisible.", 400, "illisible"); }

  const email = String(corps.email || "").trim();
  if (!emailValide(email)) return erreur("Cette adresse e-mail n'est pas valide.", 400, "email_invalide");

  const cle = cleEmail(email);

  // Même freinage que la connexion : on ne laisse pas quelqu'un déclencher
  // des centaines d'envois sur l'adresse d'un tiers.
  if (await tropDeTentatives(db, "oubli:" + cle)) return json(REPONSE);
  await noterTentative(db, "oubli:" + cle);

  const compte = await db.prepare(
    "SELECT id, email, salon, etat FROM comptes WHERE email_cle = ?"
  ).bind(cle).first();

  // Compte inexistant ou suspendu : on s'arrête là, sans rien dire de plus.
  if (!compte || compte.etat !== "actif") return json(REPONSE);

  const jeton = await creerLienReinit(db, compte.id);
  const origine = new URL(request.url).origin;
  const lien = origine + "/pro/reinit/?j=" + encodeURIComponent(jeton);

  const url = adressePortier(env)
    + "?action=reinit&callback=p"
    + "&code=" + encodeURIComponent(codePortier(env))
    + "&email=" + encodeURIComponent(compte.email)
    + "&salon=" + encodeURIComponent(compte.salon || "")
    + "&lien=" + encodeURIComponent(lien);

  try {
    await fetch(url, { headers: { accept: "*/*" } });
  } catch (e) {
    // L'envoi a échoué : on ne le dit pas ici, pour ne pas révéler que
    // l'adresse existe. Le lien reste valable si la personne redemande.
  }

  return json(REPONSE);
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
