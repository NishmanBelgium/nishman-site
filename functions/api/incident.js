/* ==========================================================================
   LE POINT D'ENTRÉE DES INCIDENTS

   La page signale qu'une commande a échoué. Elle n'envoie que trois
   choses : à quelle étape, ce qu'elle a compris de la cause, et le début
   de ce que le serveur lui a répondu. Le compte, le pays et l'appareil
   sont ajoutés ici — la page n'a pas à les dire, on les sait déjà.

   Public par nécessité : il est appelé précisément quand le reste ne
   répond plus. Donc écrit comme /api/mesure, en partant du principe que
   n'importe qui peut l'appeler n'importe comment.

   - le corps est borné avant d'être lu ;
   - l'étape et la cause passent par des listes fermées ;
   - un plafond par connexion empêche de remplir la table à la main ;
   - la réponse est toujours vide et toujours 204. Un client qui vient de
     rater sa commande n'a pas besoin d'une deuxième erreur par-dessus.
   ========================================================================== */

import { freinerIp, compteConnecte } from "../_commun.js";
import { noterIncident } from "../_incidents.js";
import { estRobot, appareilPropre, paysPropre } from "../_mesure.js";

const TAILLE_MAX = 1024;

/* Vingt échecs par heure et par connexion. Un client malchanceux en
   déclenche deux ou trois en réessayant ; au-delà, ce n'est plus un
   client. */
const PLAFOND = 20;

const RIEN = () => new Response(null, {
  status: 204,
  headers: { "cache-control": "no-store" },
});

export async function onRequestPost({ request, env }) {
  if (!env.DB) return RIEN();

  const ua = request.headers.get("user-agent") || "";
  if (estRobot(ua)) return RIEN();

  let brut;
  try {
    brut = await request.text();
    if (brut.length > TAILLE_MAX) return RIEN();
  } catch (e) { return RIEN(); }

  let corps;
  try { corps = JSON.parse(brut || "{}"); } catch (e) { return RIEN(); }
  if (!corps || typeof corps !== "object") return RIEN();

  if (await freinerIp(env.DB, request, "incident", PLAFOND, 60)) return RIEN();

  // Qui c'était. C'est le champ le plus utile de toute la table : il
  // permet de rappeler la personne au lieu d'attendre qu'elle se
  // manifeste — ou pire, qu'elle aille commander ailleurs.
  let compteId = null;
  try {
    const compte = await compteConnecte(request, env.DB);
    if (compte) compteId = compte.id;
  } catch (e) { /* sans compte, l'incident vaut quand même d'être noté */ }

  try {
    await noterIncident(env.DB, {
      etape: corps.etape,
      cause: corps.cause,
      statut: corps.statut,
      detail: corps.detail,
      compte_id: compteId,
      pays: paysPropre(request.headers.get("CF-IPCountry")),
      appareil: appareilPropre(ua),
    });
  } catch (e) {
    /* Un incident perdu vaut mieux qu'une page qui plante en voulant le
       signaler. */
  }

  return RIEN();
}

export async function onRequest() {
  return new Response(null, { status: 405 });
}
