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

  /* LES TROIS SORTIES MUETTES.
   *
   * Hier, on a rendu visible l'échec d'ENVOI du lien. C'était la moitié du
   * problème. Le 10 novembre 2026, un coiffeur n'a rien reçu — et le
   * journal des incidents était vide. L'envoi n'avait pas échoué : le code
   * s'était arrêté avant, par l'un des trois chemins ci-dessous, qui
   * rendaient tous la même réponse rassurante sans laisser la moindre
   * trace. Impossible de dire lequel.
   *
   * Le silence vers le CLIENT est voulu et ne change pas : dire « cette
   * adresse n'existe pas » ferait de ce formulaire un moyen de savoir qui
   * est client chez NBD. Mais rien n'oblige à être aveugle de notre côté.
   * On note donc la raison dans le journal, sans jamais la renvoyer.
   *
   * Même leçon que pour les prix et pour la TVA : une protection posée sur
   * une partie du chemin laisse croire qu'on voit tout, et c'est pire que
   * de savoir qu'on ne voit rien. */

  // Même freinage que la connexion : on ne laisse pas quelqu'un déclencher
  // des centaines d'envois sur l'adresse d'un tiers. Mais quelqu'un qui ne
  // reçoit rien réessaie — c'est le réflexe de tout le monde — et à la
  // huitième tentative il est freiné sans le savoir, donc il ne recevra
  // plus rien quoi qu'il fasse. Il fallait que ça se voie.
  if (await tropDeTentatives(db, "oubli:" + cle)) {
    await noterIncident(db, {
      etape: "reinitialisation", cause: "delai",
      detail: "demandes trop rapprochées pour " + cle + " — freinage, aucun lien envoyé",
    });
    return json(REPONSE);
  }
  await noterTentative(db, "oubli:" + cle);

  const compte = await db.prepare(
    "SELECT id, email, salon, etat FROM comptes WHERE email_cle = ?"
  ).bind(cle).first();

  /* Compte inexistant : le cas le plus fréquent et le plus coûteux. 68
   * comptes sur le site pour 119 clients qui ont déjà commandé — des
   * dizaines de clients fidèles tapent leur adresse ici et attendent un
   * mail qui ne peut pas exister. C'est exactement ce qu'il faut voir
   * venir, pour les inviter à créer leur compte au lieu d'attendre qu'ils
   * se manifestent. */
  if (!compte) {
    await noterIncident(db, {
      etape: "reinitialisation", cause: "serveur",
      detail: "aucun compte pour " + cle + " — probablement un client sans compte sur le site",
    });
    return json(REPONSE);
  }

  // Compte existant mais suspendu ou en attente : lui non plus ne recevra
  // rien, et lui non plus ne peut le deviner.
  if (compte.etat !== "actif") {
    await noterIncident(db, {
      etape: "reinitialisation", cause: "serveur", compte_id: compte.id,
      detail: "compte « " + compte.etat + " » pour " + cle + " — aucun lien envoyé",
    });
    return json(REPONSE);
  }

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
