/* ==========================================================================
   OUBLI — demande d'un lien de réinitialisation.

   La réponse est toujours la même, que l'adresse existe ou non : sinon ce
   formulaire deviendrait un moyen de savoir qui est client chez vous.
   L'envoi passe par le script Google, qui sert déjà de portier aux prix.
   ========================================================================== */

import { interrogerPortier } from "../_portier.js";
import { noterIncident } from "../_incidents.js";

import {
  json, erreur, cleEmail, emailValide,
  creerLienReinit, tropDeTentatives, noterTentative,
} from "../_commun.js";


/* Réponse volontairement identique que le compte existe ou non : sinon la
 * page devient un outil pour savoir qui est client chez vous.
 *
 * Mais ce silence créait une impasse. Un client de longue date qui n'a
 * jamais ouvert de compte sur le site lit « vous allez recevoir un lien »,
 * attend, et ne reçoit rien — puisqu'il n'y a rien à réinitialiser. Le
 * 10 novembre 2026, l'un d'eux a fini par écrire par message privé pour
 * dire qu'il n'arrivait pas à commander. Du chiffre d'affaires perdu sur
 * une phrase incomplète.
 *
 * La seconde phrase dit donc la sortie, et elle s'affiche pour TOUT LE
 * MONDE : celui qui a un compte la lit sans rien y apprendre, celui qui
 * n'en a pas y trouve enfin quoi faire. L'anonymat est conservé parce que
 * le message ne varie pas. */
const REPONSE = {
  ok: true,
  message: "Si un compte existe avec cette adresse, vous allez recevoir un lien dans quelques instants. Pensez à regarder vos courriers indésirables. Si rien n'arrive, c'est que vous n'avez pas encore de compte sur le site : créez-le en deux minutes, même si vous êtes déjà client chez nous.",
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

  /* L'envoi ne peut plus échouer en silence.
   *
   * Ce `fetch` était nu : son résultat n'était pas lu, et son erreur
   * était avalée par un `catch` vide. Trois pannes connues passaient donc
   * inaperçues — le quota du script Google épuisé, un déploiement cassé,
   * et le code interne refusé, comme le 26 octobre où un espace invisible
   * collé dans Cloudflare a fait tomber d'un coup les prix et les envois
   * sans qu'aucun message ne dise pourquoi.
   *
   * Pendant ce temps le client lisait « vous allez recevoir un lien ».
   *
   * On passe donc par `interrogerPortier`, qui lit vraiment la réponse et
   * distingue les trois maillons, et l'échec part au journal d'incidents.
   * La réponse au client, elle, ne change pas : elle ne doit toujours rien
   * révéler. C'est à nous de voir la panne, pas à lui de la deviner. */
  const envoi = await interrogerPortier(env,
    "action=reinit&callback=p"
    + "&email=" + encodeURIComponent(compte.email)
    + "&salon=" + encodeURIComponent(compte.salon || "")
    + "&lien=" + encodeURIComponent(lien));

  if (envoi.etat !== "ok") {
    await noterIncident(db, {
      etape: "reinitialisation",
      cause: envoi.etat === "code" ? "serveur" : "reseau",
      compte_id: compte.id,
      detail: "lien de mot de passe non envoyé — portier : " + (envoi.motif || envoi.etat),
    });
  }

  return json(REPONSE);
}

export async function onRequest() {
  return erreur("Méthode non autorisée.", 405, "methode");
}
